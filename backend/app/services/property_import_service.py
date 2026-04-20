"""
Bulk property + unit import service.

Pipeline:
  1. parse_csv()   — decode bytes, sanitise (strip CSV injection), emit rows + parse errors
  2. validate()    — per-row type / enum / required-field checks
  3. build_preview() — group rows by property, check existing names, return preview
  4. commit()      — write properties + units in one transaction, return result

Auto-provision: a landlord/owner with no organisation gets a personal org created
on first import so all properties have a valid organisation_id.
"""
from __future__ import annotations

import csv
import io
import re
import secrets
import uuid
from dataclasses import dataclass, field
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organisation import Organisation, Plan
from app.models.profile import Profile
from app.models.property import Property, PropertyStatus, PropertyType, Unit, UnitStatus, UnitType
from app.schemas.common import CamelModel

log = structlog.get_logger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────

MAX_ROWS = 500
MAX_FILE_BYTES = 2 * 1024 * 1024  # 2 MB

REQUIRED_COLS = {
    "property_name", "property_type",
    "address_line1", "address_city",
    "unit_name", "unit_type", "unit_monthly_rent",
}

TEMPLATE_HEADERS = [
    "property_name", "property_type",
    "address_line1", "address_city", "address_state", "address_country", "address_postcode",
    # Lease policy (stored in property.rules JSONB — all optional)
    "grace_period_days", "late_fee_type", "late_fee_amount",
    "deposit_months", "notice_period_days", "rent_due_day",
    "allow_subletting", "allow_smoking", "allow_pets",
    # Unit fields
    "unit_name", "unit_type", "unit_bedrooms", "unit_bathrooms",
    "unit_monthly_rent", "unit_currency", "unit_status",
]

TEMPLATE_EXAMPLE_ROWS = [
    ["Block A", "flat", "12 Kampala Road", "Kampala", "Central", "UG", "00256",
     "5", "fixed", "50000", "2", "30", "1", "no", "no", "yes",
     "Unit 1A", "single", "1", "1", "500000", "UGX", "available"],
    ["Block A", "flat", "12 Kampala Road", "Kampala", "Central", "UG", "00256",
     "5", "fixed", "50000", "2", "30", "1", "no", "no", "yes",
     "Unit 1B", "double", "2", "1", "700000", "UGX", "available"],
    ["Block B", "flat", "14 Kampala Road", "Kampala", "Central", "UG", "00256",
     "7", "percentage", "5", "1", "60", "5", "no", "no", "no",
     "Unit 2A", "single", "1", "1", "500000", "UGX", "available"],
]

VALID_PROPERTY_TYPES = {e.value for e in PropertyType}
VALID_UNIT_TYPES     = {e.value for e in UnitType}
VALID_UNIT_STATUSES  = {e.value for e in UnitStatus}

# ── Internal row dataclass ─────────────────────────────────────────────────────

VALID_LATE_FEE_TYPES = {"fixed", "percentage"}

@dataclass
class ImportRow:
    row_num: int
    property_name: str
    property_type: str
    address_line1: str
    address_city: str
    address_state: str
    address_country: str
    address_postcode: str
    # Lease policy
    grace_period_days: int
    late_fee_type: str        # "fixed" | "percentage" | ""
    late_fee_amount: float
    deposit_months: int
    notice_period_days: int
    rent_due_day: int
    allow_subletting: bool
    allow_smoking: bool
    allow_pets: bool
    # Unit
    unit_name: str
    unit_type: str
    unit_bedrooms: int
    unit_bathrooms: int
    unit_monthly_rent: float
    unit_currency: str
    unit_status: str


# ── Response schemas ───────────────────────────────────────────────────────────

class ImportError(CamelModel):
    row: int
    column: str
    message: str


class ImportWarning(CamelModel):
    property_name: str
    message: str


class UnitPreview(CamelModel):
    name: str
    type: str
    bedrooms: int
    bathrooms: int
    monthly_rent: float
    currency: str
    status: str


class PropertyPreview(CamelModel):
    name: str
    type: str
    address: str
    unit_count: int
    units: list[UnitPreview]


class ImportPreviewResponse(CamelModel):
    properties: list[PropertyPreview]
    total_properties: int
    total_units: int
    errors: list[ImportError]
    warnings: list[ImportWarning]
    is_valid: bool


class ImportResultResponse(CamelModel):
    imported_properties: int
    imported_units: int
    skipped_properties: int
    warnings: list[ImportWarning]


# ── CSV template generator ─────────────────────────────────────────────────────

def generate_template_csv() -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(TEMPLATE_HEADERS)
    writer.writerows(TEMPLATE_EXAMPLE_ROWS)
    return buf.getvalue()


# ── Parse ──────────────────────────────────────────────────────────────────────

def _sanitise(value: str) -> str:
    """Strip CSV-injection prefixes and surrounding whitespace."""
    value = value.strip()
    if value and value[0] in ("=", "+", "-", "@", "\t", "\r"):
        value = value[1:]
    return value.strip()


def parse_csv(content: bytes) -> tuple[list[ImportRow], list[ImportError]]:
    """Decode bytes, parse CSV, return (rows, errors). Does not hit the DB."""
    errors: list[ImportError] = []
    rows: list[ImportRow] = []

    try:
        text = content.decode("utf-8-sig")  # handle BOM from Excel
    except UnicodeDecodeError:
        try:
            text = content.decode("latin-1")
        except Exception:
            return [], [ImportError(row=0, column="file", message="File encoding not supported — save as UTF-8")]

    reader = csv.DictReader(io.StringIO(text))

    # Validate headers
    if reader.fieldnames is None:
        return [], [ImportError(row=0, column="file", message="CSV file appears to be empty")]

    actual_cols = {c.strip().lower() for c in reader.fieldnames}
    missing = REQUIRED_COLS - actual_cols
    if missing:
        return [], [ImportError(
            row=0, column="headers",
            message=f"Missing required columns: {', '.join(sorted(missing))}",
        )]

    for raw_row_num, raw in enumerate(reader, start=2):  # row 1 = header
        if len(rows) >= MAX_ROWS:
            errors.append(ImportError(
                row=raw_row_num, column="file",
                message=f"Import limited to {MAX_ROWS} rows — truncated here",
            ))
            break

        # Normalise keys
        row: dict[str, str] = {k.strip().lower(): _sanitise(v) for k, v in raw.items() if k}

        # Skip blank rows
        if not any(row.values()):
            continue

        row_errors: list[ImportError] = []

        def require(col: str) -> str:
            val = row.get(col, "")
            if not val:
                row_errors.append(ImportError(row=raw_row_num, column=col, message=f"{col} is required"))
            return val

        def optional(col: str, default: str = "") -> str:
            return row.get(col, "") or default

        property_name = require("property_name")
        property_type = require("property_type")
        address_line1 = require("address_line1")
        address_city  = require("address_city")
        unit_name     = require("unit_name")
        unit_type     = require("unit_type")
        rent_raw      = require("unit_monthly_rent")

        if row_errors:
            errors.extend(row_errors)
            continue

        # Enum checks
        if property_type not in VALID_PROPERTY_TYPES:
            errors.append(ImportError(
                row=raw_row_num, column="property_type",
                message=f"Must be one of: {', '.join(sorted(VALID_PROPERTY_TYPES))}",
            ))
            continue

        if unit_type not in VALID_UNIT_TYPES:
            errors.append(ImportError(
                row=raw_row_num, column="unit_type",
                message=f"Must be one of: {', '.join(sorted(VALID_UNIT_TYPES))}",
            ))
            continue

        unit_status = optional("unit_status", "available")
        if unit_status not in VALID_UNIT_STATUSES:
            errors.append(ImportError(
                row=raw_row_num, column="unit_status",
                message=f"Must be one of: {', '.join(sorted(VALID_UNIT_STATUSES))}",
            ))
            continue

        # Numeric checks
        try:
            monthly_rent = float(re.sub(r"[,\s]", "", rent_raw))
            if monthly_rent <= 0:
                raise ValueError
        except ValueError:
            errors.append(ImportError(
                row=raw_row_num, column="unit_monthly_rent",
                message="Must be a positive number",
            ))
            continue

        try:
            bedrooms = int(optional("unit_bedrooms", "1") or "1")
        except ValueError:
            bedrooms = 1

        try:
            bathrooms = int(optional("unit_bathrooms", "1") or "1")
        except ValueError:
            bathrooms = 1

        # ── Lease policy fields (all optional) ────────────────────────────────
        def _int_opt(col: str, default: int) -> int:
            try:
                return max(0, int(optional(col, str(default)) or str(default)))
            except ValueError:
                return default

        def _float_opt(col: str, default: float) -> float:
            try:
                return max(0.0, float(re.sub(r"[,\s]", "", optional(col, str(default)) or str(default))))
            except ValueError:
                return default

        def _bool_opt(col: str, default: bool = False) -> bool:
            val = optional(col, "").lower()
            if val in ("yes", "true", "1"):
                return True
            if val in ("no", "false", "0"):
                return False
            return default

        late_fee_type_raw = optional("late_fee_type", "").lower()
        if late_fee_type_raw and late_fee_type_raw not in VALID_LATE_FEE_TYPES:
            errors.append(ImportError(
                row=raw_row_num, column="late_fee_type",
                message=f"Must be one of: {', '.join(sorted(VALID_LATE_FEE_TYPES))} (or leave blank)",
            ))
            continue

        rent_due_day = _int_opt("rent_due_day", 1)
        if rent_due_day and not (1 <= rent_due_day <= 28):
            errors.append(ImportError(
                row=raw_row_num, column="rent_due_day",
                message="Must be between 1 and 28",
            ))
            continue

        rows.append(ImportRow(
            row_num=raw_row_num,
            property_name=property_name,
            property_type=property_type,
            address_line1=address_line1,
            address_city=address_city,
            address_state=optional("address_state"),
            address_country=optional("address_country", "UG"),
            address_postcode=optional("address_postcode"),
            grace_period_days=_int_opt("grace_period_days", 0),
            late_fee_type=late_fee_type_raw,
            late_fee_amount=_float_opt("late_fee_amount", 0.0),
            deposit_months=_int_opt("deposit_months", 1),
            notice_period_days=_int_opt("notice_period_days", 30),
            rent_due_day=rent_due_day,
            allow_subletting=_bool_opt("allow_subletting"),
            allow_smoking=_bool_opt("allow_smoking"),
            allow_pets=_bool_opt("allow_pets"),
            unit_name=unit_name,
            unit_type=unit_type,
            unit_bedrooms=max(0, bedrooms),
            unit_bathrooms=max(1, bathrooms),
            unit_monthly_rent=monthly_rent,
            unit_currency=optional("unit_currency", "UGX").upper()[:3],
            unit_status=unit_status,
        ))

    return rows, errors


# ── Group rows by property ─────────────────────────────────────────────────────

def _group(rows: list[ImportRow]) -> dict[str, list[ImportRow]]:
    """Order-preserving grouping by normalised property_name."""
    groups: dict[str, list[ImportRow]] = {}
    for r in rows:
        key = r.property_name.strip().lower()
        groups.setdefault(key, []).append(r)
    return groups


# ── Auto-provision personal org ────────────────────────────────────────────────

async def _ensure_org(profile: Profile, db: AsyncSession) -> Organisation:
    """Return the profile's org, auto-provisioning a personal one if absent."""
    if profile.organisation_id:
        result = await db.execute(
            select(Organisation).where(Organisation.id == profile.organisation_id)
        )
        org = result.scalar_one_or_none()
        if org:
            return org

    display = (profile.display_name or profile.email or "landlord").strip()
    org_name = f"{display}'s Properties"
    base_slug = re.sub(r"[^\w-]", "-", display.lower())[:30]
    slug = f"{base_slug}-{secrets.token_hex(4)}"

    org = Organisation(
        logto_org_id=f"org_personal_{secrets.token_hex(6)}",
        name=org_name,
        slug=slug,
        plan=Plan.starter,
        currency="UGX",
        settings={},
        payment_settings={},
    )
    db.add(org)
    await db.flush()

    profile.organisation_id = org.id
    await db.flush()

    log.info("property_import.personal_org_created", org_id=str(org.id), profile_id=str(profile.id))
    return org


# ── Preview ────────────────────────────────────────────────────────────────────

async def build_preview(
    rows: list[ImportRow],
    parse_errors: list[ImportError],
    db: AsyncSession,
    organisation_id: uuid.UUID,
) -> ImportPreviewResponse:
    if parse_errors:
        return ImportPreviewResponse(
            properties=[], total_properties=0, total_units=0,
            errors=parse_errors, warnings=[], is_valid=False,
        )

    groups = _group(rows)
    warnings: list[ImportWarning] = []

    # Check which property names already exist in this org
    names = [rows_list[0].property_name for rows_list in groups.values()]
    existing_result = await db.execute(
        select(Property.name).where(
            Property.organisation_id == organisation_id,
            Property.name.in_(names),
        )
    )
    existing_names = {row[0].strip().lower() for row in existing_result}

    previews: list[PropertyPreview] = []
    for key, unit_rows in groups.items():
        rep = unit_rows[0]
        if key in existing_names:
            warnings.append(ImportWarning(
                property_name=rep.property_name,
                message="A property with this name already exists and will be skipped",
            ))
        previews.append(PropertyPreview(
            name=rep.property_name,
            type=rep.property_type,
            address=f"{rep.address_line1}, {rep.address_city}",
            unit_count=len(unit_rows),
            units=[
                UnitPreview(
                    name=r.unit_name,
                    type=r.unit_type,
                    bedrooms=r.unit_bedrooms,
                    bathrooms=r.unit_bathrooms,
                    monthly_rent=r.unit_monthly_rent,
                    currency=r.unit_currency,
                    status=r.unit_status,
                )
                for r in unit_rows
            ],
        ))

    skipped = len(existing_names)
    net_properties = len(previews) - skipped
    total_units = sum(
        len(unit_rows) for key, unit_rows in groups.items()
        if key not in existing_names
    )

    return ImportPreviewResponse(
        properties=previews,
        total_properties=net_properties,
        total_units=total_units,
        errors=[],
        warnings=warnings,
        is_valid=True,
    )


# ── Commit ─────────────────────────────────────────────────────────────────────

async def commit_import(
    rows: list[ImportRow],
    db: AsyncSession,
    profile: Profile,
) -> ImportResultResponse:
    org = await _ensure_org(profile, db)
    organisation_id = org.id

    groups = _group(rows)
    warnings: list[ImportWarning] = []

    # Re-check duplicates at commit time (idempotent)
    names = [rows_list[0].property_name for rows_list in groups.values()]
    existing_result = await db.execute(
        select(Property.name).where(
            Property.organisation_id == organisation_id,
            Property.name.in_(names),
        )
    )
    existing_names = {row[0].strip().lower() for row in existing_result}

    imported_properties = 0
    imported_units = 0
    skipped = 0

    for key, unit_rows in groups.items():
        rep = unit_rows[0]
        if key in existing_names:
            warnings.append(ImportWarning(
                property_name=rep.property_name,
                message="Skipped — a property with this name already exists",
            ))
            skipped += 1
            continue

        rules: dict = {
            "grace_period_days":  rep.grace_period_days,
            "deposit_months":     rep.deposit_months,
            "notice_period_days": rep.notice_period_days,
            "rent_due_day":       rep.rent_due_day,
            "allow_subletting":   rep.allow_subletting,
            "allow_smoking":      rep.allow_smoking,
            "allow_pets":         rep.allow_pets,
        }
        if rep.late_fee_type:
            rules["late_fee_type"]   = rep.late_fee_type
            rules["late_fee_amount"] = rep.late_fee_amount

        prop = Property(
            organisation_id=organisation_id,
            name=rep.property_name,
            type=PropertyType(rep.property_type),
            status=PropertyStatus.active,
            address={
                "line1":    rep.address_line1,
                "city":     rep.address_city,
                "state":    rep.address_state,
                "postcode": rep.address_postcode,
                "country":  rep.address_country,
            },
            rules=rules,
            images=[],
            tags=[],
            amenities=[],
            currency=unit_rows[0].unit_currency,
        )
        db.add(prop)
        await db.flush()  # get prop.id before creating units

        for r in unit_rows:
            unit = Unit(
                property_id=prop.id,
                name=r.unit_name,
                type=UnitType(r.unit_type),
                status=UnitStatus(r.unit_status),
                monthly_rent=r.unit_monthly_rent,
                currency=r.unit_currency,
                bedrooms=r.unit_bedrooms,
                bathrooms=r.unit_bathrooms,
                amenities=[],
                images=[],
            )
            db.add(unit)
            imported_units += 1

        imported_properties += 1

    await db.flush()
    log.info(
        "property_import.committed",
        org_id=str(organisation_id),
        properties=imported_properties,
        units=imported_units,
        skipped=skipped,
    )

    return ImportResultResponse(
        imported_properties=imported_properties,
        imported_units=imported_units,
        skipped_properties=skipped,
        warnings=warnings,
    )
