"""
Bulk tenant import service.

Pipeline:
  1. parse_csv()      — decode bytes, sanitise, emit rows + parse errors
  2. build_preview()  — resolve property/unit names, check availability, return preview
  3. commit_import()  — transactional writes:
                          a. Create Tenant records
                          b. With unit: create active Lease + update Unit cached FKs
                          c. Profile-only: create TenantInvite (72-hour onboarding token)
                          d. Activated tenants: provision Logto account + send welcome email

Tenant state after import:
  - With unit + lease  → Tenant(active/activated), Lease(active), Unit(occupied)
  - Profile only       → Tenant(inactive/invited), TenantInvite(pending)
"""
from __future__ import annotations

import csv
import io
import re
import secrets
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lease import Lease, LeaseStatus
from app.models.profile import Profile
from app.models.property import Property, Unit, UnitStatus
from app.models.tenant import (
    InviteStatus,
    OnboardingState,
    Tenant,
    TenantInvite,
    TenantStatus,
)
from app.schemas.common import CamelModel
from app.utils.references import build_ref, next_seq

log = structlog.get_logger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────

MAX_ROWS = 500
MAX_FILE_BYTES = 2 * 1024 * 1024  # 2 MB
INVITE_EXPIRY_HOURS = 72

REQUIRED_COLS = {"first_name", "last_name", "email"}

TEMPLATE_HEADERS = [
    # Required
    "first_name", "last_name", "email",
    # Personal details (all optional)
    "phone", "national_id", "date_of_birth", "nationality",
    "whatsapp_number", "emergency_contact_name", "emergency_contact_phone",
    # Unit assignment (optional — both required if either provided)
    "property_name", "unit_name",
    # Lease terms (optional — only used when property_name + unit_name are set)
    "lease_start_date", "lease_end_date", "monthly_rent", "currency", "deposit_amount",
]

TEMPLATE_EXAMPLE_ROWS = [
    # Tenant with active rolling lease in Unit 1A (UK date format)
    ["John", "Doe", "john.doe@example.com",
     "+256 700 000001", "CM1234567", "15/05/1990", "Ugandan",
     "+256 700 000001", "Jane Doe", "+256 700 000002",
     "Block A", "Unit 1A",
     "01/01/2024", "", "500000", "UGX", "500000"],
    # Tenant with fixed-term lease in Unit 1B
    ["Mary", "Smith", "mary.smith@example.com",
     "+256 700 000003", "", "22/09/1985", "Kenyan",
     "", "", "",
     "Block A", "Unit 1B",
     "01/03/2024", "28/02/2025", "700000", "UGX", "700000"],
    # Profile-only tenant (no unit yet)
    ["Peter", "Okello", "peter.okello@example.com",
     "+256 700 000005", "", "", "",
     "", "", "",
     "", "",
     "", "", "", "", ""],
]


# ── Internal row dataclass ─────────────────────────────────────────────────────

@dataclass
class TenantImportRow:
    row_num: int
    # Required
    first_name: str
    last_name: str
    email: str
    # Personal details
    phone: str
    national_id: str
    date_of_birth: str        # raw string; validated as ISO date if non-empty
    nationality: str
    whatsapp_number: str
    emergency_contact_name: str
    emergency_contact_phone: str
    # Unit assignment (both empty → profile-only)
    property_name: str
    unit_name: str
    # Lease terms (used only when has_unit)
    lease_start_date: str     # ISO date string or ""
    lease_end_date: str       # ISO date string or "" (empty = rolling)
    monthly_rent: float | None
    currency: str
    deposit_amount: float

    @property
    def has_unit(self) -> bool:
        return bool(self.property_name and self.unit_name)

    @property
    def lease_mode(self) -> str:
        """Classify the lease type based on the parsed ISO dates and today's date."""
        if not self.has_unit:
            return "profile_only"
        return _classify_lease_mode(self.lease_start_date, self.lease_end_date)


# ── Response schemas ───────────────────────────────────────────────────────────

class TenantImportError(CamelModel):
    row: int
    column: str
    message: str


class TenantImportWarning(CamelModel):
    row: int | None = None
    email: str | None = None
    message: str


class TenantPreview(CamelModel):
    row_num: int
    first_name: str
    last_name: str
    email: str
    property_name: str | None
    unit_name: str | None
    monthly_rent: float | None
    lease_start_date: str | None
    lease_end_date: str | None
    # profile_only | active | rolling | expired | upcoming
    mode: str


class TenantImportPreviewResponse(CamelModel):
    tenants: list[TenantPreview]
    total_tenants: int
    # Counts by mode
    active_leases: int
    rolling_leases: int
    expired_leases: int
    upcoming_leases: int
    profile_only: int
    errors: list[TenantImportError]
    warnings: list[TenantImportWarning]
    is_valid: bool


class TenantImportResultResponse(CamelModel):
    imported_tenants: int
    active_leases: int
    rolling_leases: int
    expired_leases: int
    upcoming_leases: int
    profile_only: int
    skipped_tenants: int
    logto_accounts_created: int
    logto_accounts_failed: int
    warnings: list[TenantImportWarning]


# ── CSV template ───────────────────────────────────────────────────────────────

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


def _parse_date(s: str) -> str | None:
    """
    Parse a date string in any of the accepted formats and return ISO (YYYY-MM-DD).
    Returns None for empty input (field is optional).
    Raises ValueError with a human-readable message if the value is present but invalid.

    Accepted formats:
      DD/MM/YYYY  — UK  (e.g. 24/06/2026)
      DD-MM-YYYY  — UK  (e.g. 24-06-2026)
      DD.MM.YYYY  — EU  (e.g. 24.06.2026)
      YYYY-MM-DD  — ISO (e.g. 2026-06-24)
    """
    if not s:
        return None

    # Try each format in order; first match wins
    _FORMATS = [
        ("%d/%m/%Y", "DD/MM/YYYY"),
        ("%d-%m-%Y", "DD-MM-YYYY"),
        ("%d.%m.%Y", "DD.MM.YYYY"),
        ("%Y-%m-%d", "YYYY-MM-DD"),
    ]
    for fmt, _ in _FORMATS:
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue

    accepted = ", ".join(lbl for _, lbl in _FORMATS)
    raise ValueError(f"use one of: {accepted} (got: {s!r})")


def _classify_lease_mode(start_iso: str, end_iso: str) -> str:
    """
    Classify a lease row into one of four modes based on ISO date strings and today.

    active   — start ≤ today, end ≥ today (or no end)
    rolling  — start ≤ today, no end date
    expired  — end < today
    upcoming — start > today
    """
    today = date.today()
    start = date.fromisoformat(start_iso) if start_iso else today
    end   = date.fromisoformat(end_iso)   if end_iso   else None

    if end is not None and end < today:
        return "expired"
    if start > today:
        return "upcoming"
    if end is None:
        return "rolling"
    return "active"


def parse_csv(content: bytes) -> tuple[list[TenantImportRow], list[TenantImportError]]:
    """Decode bytes, parse CSV, return (rows, errors). Does not hit the DB."""
    errors: list[TenantImportError] = []
    rows: list[TenantImportRow] = []

    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = content.decode("latin-1")
        except Exception:
            return [], [TenantImportError(
                row=0, column="file",
                message="File encoding not supported — save as UTF-8",
            )]

    reader = csv.DictReader(io.StringIO(text))

    if reader.fieldnames is None:
        return [], [TenantImportError(row=0, column="file", message="CSV file appears to be empty")]

    actual_cols = {c.strip().lower() for c in reader.fieldnames}
    missing = REQUIRED_COLS - actual_cols
    if missing:
        return [], [TenantImportError(
            row=0, column="headers",
            message=f"Missing required columns: {', '.join(sorted(missing))}",
        )]

    seen_emails: set[str] = set()

    for raw_row_num, raw in enumerate(reader, start=2):
        if len(rows) >= MAX_ROWS:
            errors.append(TenantImportError(
                row=raw_row_num, column="file",
                message=f"Import limited to {MAX_ROWS} rows — truncated here",
            ))
            break

        row: dict[str, str] = {k.strip().lower(): _sanitise(v) for k, v in raw.items() if k}

        if not any(row.values()):
            continue

        row_errors: list[TenantImportError] = []

        def require(col: str) -> str:
            val = row.get(col, "")
            if not val:
                row_errors.append(TenantImportError(
                    row=raw_row_num, column=col, message=f"{col} is required",
                ))
            return val

        def optional(col: str, default: str = "") -> str:
            return row.get(col, "") or default

        first_name = require("first_name")
        last_name  = require("last_name")
        email      = require("email")

        if row_errors:
            errors.extend(row_errors)
            continue

        # Basic email format check
        if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email):
            errors.append(TenantImportError(
                row=raw_row_num, column="email",
                message="Invalid email address",
            ))
            continue

        # Within-file duplicate email check
        email_lower = email.lower()
        if email_lower in seen_emails:
            errors.append(TenantImportError(
                row=raw_row_num, column="email",
                message=f"Duplicate email in this file: {email}",
            ))
            continue
        seen_emails.add(email_lower)

        property_name = optional("property_name")
        unit_name     = optional("unit_name")

        # Both or neither — partial unit assignment is invalid
        if bool(property_name) != bool(unit_name):
            errors.append(TenantImportError(
                row=raw_row_num, column="property_name" if not property_name else "unit_name",
                message="Both property_name and unit_name must be provided together (or both left blank)",
            ))
            continue

        # Parse and normalise dates (UK DD/MM/YYYY, DD-MM-YYYY, ISO YYYY-MM-DD)
        lease_start = optional("lease_start_date")
        lease_end   = optional("lease_end_date")
        dob         = optional("date_of_birth")

        date_parse_ok = True
        for col, val in [("lease_start_date", lease_start), ("lease_end_date", lease_end),
                         ("date_of_birth", dob)]:
            if not val:
                continue
            try:
                normalized = _parse_date(val)
                if col == "lease_start_date":
                    lease_start = normalized or ""
                elif col == "lease_end_date":
                    lease_end = normalized or ""
                elif col == "date_of_birth":
                    dob = normalized or ""
            except ValueError as exc:
                errors.append(TenantImportError(
                    row=raw_row_num, column=col,
                    message=f"Invalid date — {exc}",
                ))
                date_parse_ok = False

        if not date_parse_ok or row_errors:
            continue

        # Monthly rent (optional float)
        monthly_rent: float | None = None
        rent_raw = optional("monthly_rent")
        if rent_raw:
            try:
                monthly_rent = float(re.sub(r"[,\s]", "", rent_raw))
                if monthly_rent <= 0:
                    raise ValueError
            except ValueError:
                errors.append(TenantImportError(
                    row=raw_row_num, column="monthly_rent",
                    message="Must be a positive number",
                ))
                continue

        # Deposit (optional float, default 0)
        deposit_amount = 0.0
        deposit_raw = optional("deposit_amount")
        if deposit_raw:
            try:
                deposit_amount = max(0.0, float(re.sub(r"[,\s]", "", deposit_raw)))
            except ValueError:
                deposit_amount = 0.0

        # Emergency contact
        ec_name  = optional("emergency_contact_name")
        ec_phone = optional("emergency_contact_phone")

        rows.append(TenantImportRow(
            row_num=raw_row_num,
            first_name=first_name,
            last_name=last_name,
            email=email,
            phone=optional("phone"),
            national_id=optional("national_id"),
            date_of_birth=dob,
            nationality=optional("nationality"),
            whatsapp_number=optional("whatsapp_number"),
            emergency_contact_name=ec_name,
            emergency_contact_phone=ec_phone,
            property_name=property_name,
            unit_name=unit_name,
            lease_start_date=lease_start,
            lease_end_date=lease_end,
            monthly_rent=monthly_rent,
            currency=optional("currency", "UGX").upper()[:3],
            deposit_amount=deposit_amount,
        ))

    return rows, errors


# ── Preview ────────────────────────────────────────────────────────────────────

async def build_preview(
    rows: list[TenantImportRow],
    parse_errors: list[TenantImportError],
    db: AsyncSession,
    organisation_id: uuid.UUID,
) -> TenantImportPreviewResponse:
    if parse_errors:
        return TenantImportPreviewResponse(
            tenants=[], total_tenants=0,
            active_leases=0, rolling_leases=0, expired_leases=0, upcoming_leases=0, profile_only=0,
            errors=parse_errors, warnings=[], is_valid=False,
        )

    warnings: list[TenantImportWarning] = []

    # ── Check for emails already in this org ───────────────────────────────────
    emails = [r.email.lower() for r in rows]
    existing_result = await db.execute(
        select(Tenant.email).where(
            Tenant.organisation_id == organisation_id,
            Tenant.email.in_(emails),
        )
    )
    existing_emails = {row[0].lower() for row in existing_result}

    # ── Resolve property and unit names ───────────────────────────────────────
    # Build set of unique (property_name, unit_name) pairs needing resolution
    unit_pairs: set[tuple[str, str]] = {
        (r.property_name.strip().lower(), r.unit_name.strip().lower())
        for r in rows if r.has_unit
    }

    # Load all matching properties in this org
    prop_names = {p for p, _ in unit_pairs}
    props_result = await db.execute(
        select(Property).where(
            Property.organisation_id == organisation_id,
            Property.name.ilike_any(list(prop_names)) if False else Property.id.isnot(None),
        )
    )
    # Simpler: load all org properties and filter in Python
    all_props_result = await db.execute(
        select(Property).where(Property.organisation_id == organisation_id)
    )
    prop_by_name: dict[str, Property] = {
        p.name.strip().lower(): p
        for p in all_props_result.scalars()
    }

    # Load all units for matching properties
    matched_prop_ids = [p.id for p in prop_by_name.values() if p.name.strip().lower() in prop_names]
    unit_by_prop_unit: dict[tuple[uuid.UUID, str], Unit] = {}
    if matched_prop_ids:
        units_result = await db.execute(
            select(Unit).where(Unit.property_id.in_(matched_prop_ids))
        )
        for u in units_result.scalars():
            unit_by_prop_unit[(u.property_id, u.name.strip().lower())] = u

    previews: list[TenantPreview] = []

    for r in rows:
        if r.email.lower() in existing_emails:
            warnings.append(TenantImportWarning(
                row=r.row_num, email=r.email,
                message=f"Tenant with email {r.email} already exists in this organisation — will be skipped",
            ))

        mode = r.lease_mode  # profile_only | active | rolling | expired | upcoming
        resolved_monthly_rent = r.monthly_rent

        if r.has_unit:
            prop = prop_by_name.get(r.property_name.strip().lower())
            if not prop:
                warnings.append(TenantImportWarning(
                    row=r.row_num, email=r.email,
                    message=f"Property '{r.property_name}' not found — unit assignment skipped, importing as profile only",
                ))
                mode = "profile_only"
            else:
                unit = unit_by_prop_unit.get((prop.id, r.unit_name.strip().lower()))
                if not unit:
                    warnings.append(TenantImportWarning(
                        row=r.row_num, email=r.email,
                        message=f"Unit '{r.unit_name}' not found in '{r.property_name}' — unit assignment skipped",
                    ))
                    mode = "profile_only"
                elif unit.status == UnitStatus.occupied and mode not in ("expired",):
                    # Occupied is only a conflict for active/rolling/upcoming leases;
                    # expired leases don't need to claim the unit.
                    warnings.append(TenantImportWarning(
                        row=r.row_num, email=r.email,
                        message=f"Unit '{r.unit_name}' is already occupied — unit assignment skipped",
                    ))
                    mode = "profile_only"
                else:
                    if resolved_monthly_rent is None:
                        resolved_monthly_rent = float(unit.monthly_rent or 0)

            # Mode-specific guidance warnings
            if mode == "expired":
                warnings.append(TenantImportWarning(
                    row=r.row_num, email=r.email,
                    message=(
                        f"Lease end date {r.lease_end_date!r} is in the past — imported as a historical "
                        "record (expired). Tenant will not have active portal access. "
                        "If this tenant is still occupying, update the end date in your CSV."
                    ),
                ))
            elif mode == "upcoming":
                warnings.append(TenantImportWarning(
                    row=r.row_num, email=r.email,
                    message=(
                        f"Lease start date {r.lease_start_date!r} is in the future — imported as a draft "
                        "lease. The unit will not be marked occupied until you activate the lease "
                        "from the lease detail page when the tenant moves in."
                    ),
                ))

        previews.append(TenantPreview(
            row_num=r.row_num,
            first_name=r.first_name,
            last_name=r.last_name,
            email=r.email,
            property_name=r.property_name or None,
            unit_name=r.unit_name or None,
            monthly_rent=resolved_monthly_rent,
            lease_start_date=r.lease_start_date or None,
            lease_end_date=r.lease_end_date or None,
            mode=mode,
        ))

    def _cnt(m: str) -> int:
        return sum(1 for p in previews if p.mode == m)

    return TenantImportPreviewResponse(
        tenants=previews,
        total_tenants=len(previews),
        active_leases=_cnt("active"),
        rolling_leases=_cnt("rolling"),
        expired_leases=_cnt("expired"),
        upcoming_leases=_cnt("upcoming"),
        profile_only=_cnt("profile_only"),
        errors=[],
        warnings=warnings,
        is_valid=True,
    )


# ── Commit ─────────────────────────────────────────────────────────────────────

async def commit_import(
    rows: list[TenantImportRow],
    db: AsyncSession,
    profile: Profile,
) -> TenantImportResultResponse:
    """
    Write validated rows to the database in one transaction.

    For each row:
     - Skip if email already exists in this org
     - Create Tenant
     - If has_unit + property/unit found + unit available:
         Create active Lease, update Unit + Tenant cached FKs
         Provision Logto account + send welcome email
     - Else:
         Create TenantInvite with 72-hour onboarding token
    """
    from app.services import logto_service

    organisation_id = profile.organisation_id
    if not organisation_id:
        from fastapi import HTTPException, status as http_status
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Your account is not linked to an organisation",
        )

    # Load org for Logto org ID
    from app.models.organisation import Organisation
    org_result = await db.execute(
        select(Organisation).where(Organisation.id == organisation_id)
    )
    org = org_result.scalar_one_or_none()
    logto_org_id = org.logto_org_id if org else None

    warnings: list[TenantImportWarning] = []
    now = datetime.now(timezone.utc)
    today_str = date.today().isoformat()
    logto_created = 0
    logto_failed  = 0

    # ── Re-check existing emails (idempotent at commit time) ──────────────────
    emails = [r.email.lower() for r in rows]
    existing_result = await db.execute(
        select(Tenant.email).where(
            Tenant.organisation_id == organisation_id,
            Tenant.email.in_(emails),
        )
    )
    existing_emails = {row[0].lower() for row in existing_result}

    # ── Load all org properties + units once ──────────────────────────────────
    all_props_result = await db.execute(
        select(Property).where(Property.organisation_id == organisation_id)
    )
    prop_by_name: dict[str, Property] = {
        p.name.strip().lower(): p for p in all_props_result.scalars()
    }

    prop_ids = [p.id for p in prop_by_name.values()]
    unit_by_prop_unit: dict[tuple[uuid.UUID, str], Unit] = {}
    if prop_ids:
        units_result = await db.execute(
            select(Unit).where(Unit.property_id.in_(prop_ids))
        )
        for u in units_result.scalars():
            unit_by_prop_unit[(u.property_id, u.name.strip().lower())] = u

    # Track units claimed within this import batch (prevent double-assigning)
    claimed_unit_ids: set[uuid.UUID] = set()

    imported_tenants = 0
    cnt: dict[str, int] = {
        "active": 0, "rolling": 0, "expired": 0, "upcoming": 0, "profile_only": 0
    }
    skipped = 0

    for r in rows:
        # ── Skip duplicate emails ─────────────────────────────────────────────
        if r.email.lower() in existing_emails:
            warnings.append(TenantImportWarning(
                row=r.row_num, email=r.email,
                message=f"Skipped — tenant with email {r.email} already exists",
            ))
            skipped += 1
            continue

        # ── Resolve unit ──────────────────────────────────────────────────────
        resolved_unit: Unit | None = None
        resolved_prop: Property | None = None
        lease_mode = r.lease_mode   # profile_only | active | rolling | expired | upcoming

        if r.has_unit:
            resolved_prop = prop_by_name.get(r.property_name.strip().lower())
            if resolved_prop:
                resolved_unit = unit_by_prop_unit.get(
                    (resolved_prop.id, r.unit_name.strip().lower())
                )

            if not resolved_prop or not resolved_unit:
                warnings.append(TenantImportWarning(
                    row=r.row_num, email=r.email,
                    message=f"Property/unit '{r.property_name} / {r.unit_name}' not found — imported as profile only",
                ))
                lease_mode = "profile_only"
            elif resolved_unit.status == UnitStatus.occupied and lease_mode != "expired":
                warnings.append(TenantImportWarning(
                    row=r.row_num, email=r.email,
                    message=f"Unit '{r.unit_name}' is already occupied — imported as profile only",
                ))
                resolved_unit = None
                lease_mode = "profile_only"
            elif resolved_unit.id in claimed_unit_ids and lease_mode != "expired":
                warnings.append(TenantImportWarning(
                    row=r.row_num, email=r.email,
                    message=f"Unit '{r.unit_name}' is already assigned to another tenant in this import — imported as profile only",
                ))
                resolved_unit = None
                lease_mode = "profile_only"

        # ── Tenant initial state depends on lease mode ────────────────────────
        # active/rolling → active + activated (currently in the unit)
        # upcoming       → inactive + approved (ready to activate on move-in)
        # expired        → inactive + invited  (historical, no portal access)
        # profile_only   → inactive + invited  (onboarding invite sent)
        if lease_mode in ("active", "rolling"):
            initial_status = TenantStatus.active
            initial_state  = OnboardingState.activated
        elif lease_mode == "upcoming":
            initial_status = TenantStatus.inactive
            initial_state  = OnboardingState.approved
        else:  # expired | profile_only
            initial_status = TenantStatus.inactive
            initial_state  = OnboardingState.invited

        # ── Emergency contact ─────────────────────────────────────────────────
        emergency_contact = None
        if r.emergency_contact_name or r.emergency_contact_phone:
            emergency_contact = {
                "name":  r.emergency_contact_name,
                "phone": r.emergency_contact_phone,
            }

        # ── Create Tenant ─────────────────────────────────────────────────────
        seq = await next_seq(db, Tenant)
        ref = build_ref("TEN", seq)

        tenant = Tenant(
            organisation_id=organisation_id,
            reference=ref,
            first_name=r.first_name,
            last_name=r.last_name,
            email=r.email,
            phone=r.phone or None,
            nin=r.national_id or None,
            date_of_birth=r.date_of_birth or None,
            nationality=r.nationality or None,
            whatsapp_number=r.whatsapp_number or None,
            emergency_contact=emergency_contact,
            status=initial_status,
            onboarding_state=initial_state,
            tags=[],
        )
        db.add(tenant)
        await db.flush()
        await db.refresh(tenant)

        # ── Create Lease (mode-specific) ──────────────────────────────────────
        if lease_mode in ("active", "rolling", "expired", "upcoming") and resolved_unit is not None:
            monthly_rent = r.monthly_rent or float(resolved_unit.monthly_rent or 0)  # type: ignore[union-attr]
            lease_start  = date.fromisoformat(r.lease_start_date) if r.lease_start_date else date.today()
            lease_end    = date.fromisoformat(r.lease_end_date) if r.lease_end_date else None

            # Load property so we can derive the effective billing rules
            # (unit rules override property rules, same logic as lease_service.create_lease)
            prop_result = await db.execute(
                select(Property).where(Property.id == resolved_unit.property_id)  # type: ignore[union-attr]
            )
            prop_for_rules = prop_result.scalar_one_or_none()
            effective = (resolved_unit.rules or {}) if resolved_unit.rules else (  # type: ignore[union-attr]
                prop_for_rules.rules if prop_for_rules else {}
            ) or {}

            # Map mode to LeaseStatus
            lease_status_map = {
                "active":   LeaseStatus.active,
                "rolling":  LeaseStatus.active,
                "expired":  LeaseStatus.expired,
                "upcoming": LeaseStatus.draft,
            }

            lease = Lease(
                organisation_id=organisation_id,
                property_id=resolved_unit.property_id,  # type: ignore[union-attr]
                unit_id=resolved_unit.id,               # type: ignore[union-attr]
                tenant_id=tenant.id,
                status=lease_status_map[lease_mode],
                start_date=lease_start,
                end_date=lease_end,
                monthly_rent=monthly_rent,
                currency=r.currency,
                deposit_amount=r.deposit_amount,
                deposit_paid=False,
                signed_at=now if lease_mode in ("active", "rolling") else None,
                rent_day_of_month=effective.get("rentDayOfMonth", 1),
                grace_period_days=effective.get("gracePeriodDays", 5),
                late_fee_type=effective.get("lateFeeType", "flat"),
                late_fee_value=effective.get("lateFeeValue", 0),
                notice_period_days=effective.get("noticePeriodDays", 30),
            )
            db.add(lease)
            await db.flush()
            await db.refresh(lease)

            # Only active/rolling leases occupy the unit immediately
            if lease_mode in ("active", "rolling"):
                resolved_unit.status = UnitStatus.occupied          # type: ignore[union-attr]
                resolved_unit.current_tenant_id = tenant.id         # type: ignore[union-attr]
                resolved_unit.current_lease_id = lease.id           # type: ignore[union-attr]
                tenant.current_property_id = resolved_unit.property_id  # type: ignore[union-attr]
                tenant.current_unit_id = resolved_unit.id               # type: ignore[union-attr]
                tenant.current_lease_id = lease.id
                claimed_unit_ids.add(resolved_unit.id)               # type: ignore[union-attr]

        # ── Create TenantInvite for profile-only tenants ──────────────────────
        if lease_mode == "profile_only":
            token = secrets.token_urlsafe(48)
            tenant.onboarding_token = token
            db.add(TenantInvite(
                tenant_id=tenant.id,
                organisation_id=organisation_id,
                email=r.email,
                name=f"{r.first_name} {r.last_name}",
                token=token,
                status=InviteStatus.pending,
                sent_at=now,
                expires_at=now + timedelta(hours=INVITE_EXPIRY_HOURS),
            ))

        cnt[lease_mode] = cnt.get(lease_mode, 0) + 1

        # ── Provision Logto account ───────────────────────────────────────────
        # Only active, rolling, and profile_only tenants get portal access now.
        # expired = historical record only; upcoming = activate at move-in time.
        provision_logto = lease_mode in ("active", "rolling", "profile_only")
        if provision_logto and logto_org_id:
            try:
                logto_user_id = await logto_service.create_tenant_user(
                    email=r.email,
                    first_name=r.first_name,
                    last_name=r.last_name,
                    logto_org_id=logto_org_id,
                )
                if logto_user_id:
                    tenant.logto_user_id = logto_user_id
                    logto_created += 1
                else:
                    logto_failed += 1
                    warnings.append(TenantImportWarning(
                        row=r.row_num, email=r.email,
                        message=(
                            f"Logto account could not be created for {r.email}. "
                            "Use 'Resend login credentials' on the tenant detail page to retry."
                        ),
                    ))
            except Exception:
                logto_failed += 1
                log.warning("tenant_import.logto_provisioning_failed", email=r.email, exc_info=True)
                warnings.append(TenantImportWarning(
                    row=r.row_num, email=r.email,
                    message=(
                        f"Logto provisioning failed for {r.email}. "
                        "Use 'Resend login credentials' on the tenant detail page to retry."
                    ),
                ))
        elif provision_logto:
            log.debug("tenant_import.logto_org_id_missing — skipping provisioning", email=r.email)

        existing_emails.add(r.email.lower())
        imported_tenants += 1

    await db.flush()
    log.info(
        "tenant_import.committed",
        org_id=str(organisation_id),
        imported=imported_tenants,
        **{f"mode_{k}": v for k, v in cnt.items()},
        skipped=skipped,
    )

    return TenantImportResultResponse(
        imported_tenants=imported_tenants,
        active_leases=cnt["active"],
        rolling_leases=cnt["rolling"],
        expired_leases=cnt["expired"],
        upcoming_leases=cnt["upcoming"],
        profile_only=cnt["profile_only"],
        skipped_tenants=skipped,
        logto_accounts_created=logto_created,
        logto_accounts_failed=logto_failed,
        warnings=warnings,
    )
