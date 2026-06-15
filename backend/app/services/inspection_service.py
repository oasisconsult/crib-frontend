"""
Business logic for the inspections domain.

Inspection state machine:
  scheduled → in_progress → completed → approved
            ↘ cancelled     ↘ failed    ↘ failed
  failed/cancelled → scheduled (reschedule)

Maintenance state machine:
  reported → assigned → in_progress → resolved → closed
           ↘ cancelled ↘ cancelled  ↘ cancelled
"""

from __future__ import annotations

import base64
import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)

from app.models.inspection import (
    Inspection,
    InspectionState,
    MaintenanceIssue,
    MaintenanceState,
    INSPECTION_TRANSITIONS,
    MAINTENANCE_TRANSITIONS,
)
from app.models.landlord_invite import LandlordPropertyAccess
from app.models.lease import Lease, LeaseStatus
from app.models.property import Property, Unit
from app.utils.references import build_ref, next_seq
from app.utils.db_filters import org_scope
from app.schemas.inspection import (
    InspectionCreate,
    InspectionOut,
    InspectionPublicOut,
    InspectionUpdate,
    MaintenanceCreate,
    MaintenanceOut,
    MaintenanceTransition,
    MaintenanceUpdate,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _insp_type_label(insp_type) -> str:
    """Return a human-readable inspection type string (e.g. 'move-in', 'move-out')."""
    t = insp_type if isinstance(insp_type, str) else insp_type.value
    return {"move_in": "move-in", "move_out": "move-out", "routine": "routine"}.get(t, t.replace("_", "-"))


# ── Serialisers ────────────────────────────────────────────────────────────────

def _insp_out(i: Inspection, unit_name: str | None = None, property_name: str | None = None) -> InspectionOut:
    def _s(v) -> str | None:
        if v is None:
            return None
        return v.isoformat() if hasattr(v, "isoformat") else str(v)

    return InspectionOut(
        id=str(i.id),
        reference=i.reference,
        organisation_id=str(i.organisation_id),
        property_id=str(i.property_id),
        unit_id=str(i.unit_id) if i.unit_id else None,
        lease_id=str(i.lease_id) if i.lease_id else None,
        tenant_id=str(i.tenant_id) if i.tenant_id else None,
        inspector_id=str(i.inspector_id) if i.inspector_id else None,
        inspector_name=i.inspector_name,
        type=i.type if isinstance(i.type, str) else i.type.value,
        state=i.state if isinstance(i.state, str) else i.state.value,
        scheduled_date=str(i.scheduled_date),
        scheduled_time_slot=i.scheduled_time_slot,
        started_at=_s(i.started_at),
        completed_at=_s(i.completed_at),
        approved_at=_s(i.approved_at),
        checklist=i.checklist or [],
        overall_condition=i.overall_condition,
        summary=i.summary,
        recommendations=i.recommendations,
        photo_urls=i.photo_urls or [],
        video_urls=i.video_urls or [],
        maintenance_issue_ids=i.maintenance_issue_ids or [],
        tenant_signed_at=_s(i.tenant_signed_at),
        landlord_signed_at=_s(i.landlord_signed_at),
        landlord_signed_by=i.landlord_signed_by,
        report_pdf_url=i.report_pdf_url,
        sign_token=i.sign_token,
        sign_token_expires_at=_s(i.sign_token_expires_at),
        created_at=i.created_at.isoformat(),
        updated_at=i.updated_at.isoformat(),
        unit_name=unit_name,
        property_name=property_name,
        baseline_inspection_id=str(i.baseline_inspection_id) if i.baseline_inspection_id else None,
    )


def _maint_out(
    m: MaintenanceIssue,
    property_name: str | None = None,
    unit_name: str | None = None,
) -> MaintenanceOut:
    def _s(v) -> str | None:
        if v is None:
            return None
        return v.isoformat() if hasattr(v, "isoformat") else str(v)

    return MaintenanceOut(
        id=str(m.id),
        reference=m.reference,
        organisation_id=str(m.organisation_id),
        property_id=str(m.property_id),
        unit_id=str(m.unit_id) if m.unit_id else None,
        lease_id=str(m.lease_id) if m.lease_id else None,
        inspection_id=str(m.inspection_id) if m.inspection_id else None,
        reported_by=m.reported_by if isinstance(m.reported_by, str) else m.reported_by.value,
        reported_by_id=m.reported_by_id,
        title=m.title,
        description=m.description,
        category=m.category if isinstance(m.category, str) else m.category.value,
        priority=m.priority if isinstance(m.priority, str) else m.priority.value,
        state=m.state if isinstance(m.state, str) else m.state.value,
        contractor_id=str(m.contractor_id) if m.contractor_id else None,
        assigned_to=m.assigned_to,
        assigned_at=_s(m.assigned_at),
        estimated_cost=float(m.estimated_cost) if m.estimated_cost is not None else None,
        actual_cost=float(m.actual_cost) if m.actual_cost is not None else None,
        currency=m.currency,
        reported_at=m.reported_at.isoformat(),
        started_at=_s(m.started_at),
        resolved_at=_s(m.resolved_at),
        closed_at=_s(m.closed_at),
        photo_urls=m.photo_urls or [],
        notes=m.notes,
        created_at=m.created_at.isoformat(),
        updated_at=m.updated_at.isoformat(),
        property_name=property_name,
        unit_name=unit_name,
    )


# ── Internal helpers ───────────────────────────────────────────────────────────

async def _get_inspection(
    inspection_id: uuid.UUID, org_id: uuid.UUID | None, db: AsyncSession
) -> Inspection:
    _filters = [Inspection.id == inspection_id]
    if org_id is not None:
        _filters.append(Inspection.organisation_id == org_id)
    result = await db.execute(select(Inspection).where(*_filters))
    i = result.scalar_one_or_none()
    if not i:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")
    return i


async def _get_maintenance(
    issue_id: uuid.UUID, org_id: uuid.UUID | None, db: AsyncSession
) -> MaintenanceIssue:
    _filters = [MaintenanceIssue.id == issue_id]
    if org_id is not None:
        _filters.append(MaintenanceIssue.organisation_id == org_id)
    result = await db.execute(select(MaintenanceIssue).where(*_filters))
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Maintenance issue not found")
    return m


# ── Event → state mapping ──────────────────────────────────────────────────────

_INSPECTION_EVENT_TO_STATE: dict[str, str] = {
    "INSPECTION_STARTED":    InspectionState.in_progress,
    "INSPECTION_COMPLETED":  InspectionState.completed,
    "INSPECTION_APPROVED":   InspectionState.approved,
    "INSPECTION_FAILED":     InspectionState.failed,
    "INSPECTION_CANCELLED":  InspectionState.cancelled,
    "INSPECTION_CREATED":    InspectionState.scheduled,   # reschedule
}

_MAINTENANCE_EVENT_TO_STATE: dict[str, str] = {
    "ISSUE_ASSIGNED":   MaintenanceState.assigned,
    "ISSUE_STARTED":    MaintenanceState.in_progress,
    "ISSUE_RESOLVED":   MaintenanceState.resolved,
    "ISSUE_CLOSED":     MaintenanceState.closed,
    "ISSUE_CANCELLED":  MaintenanceState.cancelled,
    "ISSUE_CREATED":    MaintenanceState.reported,
}


# ── Inspections CRUD ───────────────────────────────────────────────────────────

async def list_inspections(
    org_id: uuid.UUID | None,
    db: AsyncSession,
    property_id: str | None = None,
    unit_id: str | None = None,
    lease_id: str | None = None,
    states: list[str] | None = None,
    type_filter: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
    landlord_profile_id: uuid.UUID | None = None,
    tenant_profile_id: uuid.UUID | None = None,
) -> dict:
    if tenant_profile_id is not None:
        # Tenant access: scope by tenant_id rather than org to avoid JWT org mismatch.
        # Inspections created by a superadmin may have organisation_id=NULL which
        # org_scope would exclude; filtering by tenant_id is both correct and secure.
        tenant_clauses = [Inspection.tenant_id == tenant_profile_id]
        if lease_id:
            # Also surface inspections linked to the lease but with a legacy/missing tenant_id
            tenant_clauses.append(Inspection.lease_id == uuid.UUID(lease_id))
        q = select(Inspection).where(or_(*tenant_clauses))
    else:
        q = org_scope(select(Inspection), Inspection.organisation_id, org_id)
    if landlord_profile_id is not None:
        allowed = select(LandlordPropertyAccess.property_id).where(
            LandlordPropertyAccess.landlord_profile_id == landlord_profile_id
        )
        q = q.where(Inspection.property_id.in_(allowed))
    if property_id:
        q = q.where(Inspection.property_id == uuid.UUID(property_id))
    if unit_id and lease_id:
        # Tenant portal: match inspections tied to the unit OR the lease
        # (admin may schedule without linking a lease, or without a unit)
        q = q.where(or_(
            Inspection.unit_id == uuid.UUID(unit_id),
            Inspection.lease_id == uuid.UUID(lease_id),
        ))
    elif unit_id:
        q = q.where(Inspection.unit_id == uuid.UUID(unit_id))
    elif lease_id:
        q = q.where(Inspection.lease_id == uuid.UUID(lease_id))
    if states:
        q = q.where(Inspection.state.in_(states))
    if type_filter:
        q = q.where(Inspection.type == type_filter)
    if search:
        term = f"%{search}%"
        q = q.where(Inspection.type.ilike(term))

    total = await db.scalar(select(func.count()).select_from(q.subquery())) or 0
    q = q.order_by(Inspection.scheduled_date.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    inspections = result.scalars().all()

    # Batch-fetch display names to avoid N+1 queries
    unit_ids     = {i.unit_id     for i in inspections if i.unit_id}
    property_ids = {i.property_id for i in inspections if i.property_id}

    unit_map:     dict[uuid.UUID, str] = {}
    property_map: dict[uuid.UUID, str] = {}

    if unit_ids:
        rows = (await db.execute(select(Unit).where(Unit.id.in_(unit_ids)))).scalars().all()
        unit_map = {u.id: u.name for u in rows}

    if property_ids:
        rows = (await db.execute(select(Property).where(Property.id.in_(property_ids)))).scalars().all()
        property_map = {p.id: p.name for p in rows}

    return {
        "data": [
            _insp_out(
                i,
                unit_name=unit_map.get(i.unit_id) if i.unit_id else None,
                property_name=property_map.get(i.property_id) if i.property_id else None,
            )
            for i in inspections
        ],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "hasNext": (page * page_size) < total,
    }


async def get_inspection(
    inspection_id: uuid.UUID, org_id: uuid.UUID | None, db: AsyncSession
) -> InspectionOut:
    return _insp_out(await _get_inspection(inspection_id, org_id, db))


async def create_inspection(
    body: InspectionCreate, org_id: uuid.UUID | None, db: AsyncSession
) -> InspectionOut:
    year = datetime.now(timezone.utc).year
    seq = await next_seq(db, Inspection, year=year)
    ref = build_ref("INS", seq, str(year))

    # Auto-link to the active lease for this unit when lease_id is not explicit
    resolved_lease_id: uuid.UUID | None = uuid.UUID(body.lease_id) if body.lease_id else None
    resolved_tenant_id: uuid.UUID | None = uuid.UUID(body.tenant_id) if body.tenant_id else None
    if resolved_lease_id is None and body.unit_id:
        active_lease = await db.scalar(
            select(Lease).where(
                Lease.unit_id == uuid.UUID(body.unit_id),
                Lease.status == LeaseStatus.active,
            )
        )
        if active_lease:
            resolved_lease_id = active_lease.id
            if resolved_tenant_id is None and active_lease.tenant_id:
                # inspections.tenant_id FK → profiles.id; find the Profile for this tenant
                from app.models.profile import Profile as _P
                _prof = await db.scalar(select(_P).where(_P.tenant_id == active_lease.tenant_id))
                if _prof:
                    resolved_tenant_id = _prof.id
    elif resolved_lease_id is not None and resolved_tenant_id is None:
        # lease_id supplied explicitly — resolve Profile UUID for the linked tenant
        linked_lease = await db.scalar(select(Lease).where(Lease.id == resolved_lease_id))
        if linked_lease and linked_lease.tenant_id:
            from app.models.profile import Profile as _P
            _prof = await db.scalar(select(_P).where(_P.tenant_id == linked_lease.tenant_id))
            if _prof:
                resolved_tenant_id = _prof.id

    # Superadmin creates without org context — derive from lease or property
    if org_id is None:
        if resolved_lease_id:
            _lease = await db.scalar(select(Lease).where(Lease.id == resolved_lease_id))
            if _lease and _lease.organisation_id:
                org_id = _lease.organisation_id
        if org_id is None and body.property_id:
            _prop = await db.scalar(select(Property).where(Property.id == uuid.UUID(body.property_id)))
            if _prop and _prop.organisation_id:
                org_id = _prop.organisation_id

    # For move-out inspections: auto-copy checklist structure from the move-in baseline
    baseline_inspection_id: uuid.UUID | None = None
    checklist_to_use = body.checklist or []
    if body.type == "move_out" and resolved_lease_id and not body.checklist:
        baseline = await db.scalar(
            select(Inspection).where(
                Inspection.lease_id == resolved_lease_id,
                Inspection.type == "move_in",
                Inspection.state.in_(["completed", "approved"]),
            ).order_by(Inspection.scheduled_date.desc())
        )
        if baseline:
            baseline_inspection_id = baseline.id
            # Copy checklist structure — clear conditions/notes/photos for fresh move-out assessment
            checklist_to_use = [
                {
                    "id": item.get("id", str(uuid.uuid4())[:8]),
                    "area": item.get("area", ""),
                    "description": item.get("description", ""),
                    "required": item.get("required", True),
                    "condition": None,
                    "notes": None,
                    "photo_urls": [],
                    # Preserve move-in condition as reference
                    "move_in_condition": item.get("condition"),
                    "move_in_notes": item.get("notes"),
                }
                for item in (baseline.checklist or [])
            ]

    inspection = Inspection(
        organisation_id=org_id,
        property_id=uuid.UUID(body.property_id),
        unit_id=uuid.UUID(body.unit_id) if body.unit_id else None,
        lease_id=resolved_lease_id,
        tenant_id=resolved_tenant_id,
        inspector_id=uuid.UUID(body.inspector_id) if body.inspector_id else None,
        inspector_name=body.inspector_name,
        type=body.type,
        state=InspectionState.scheduled,
        scheduled_date=body.scheduled_date,
        scheduled_time_slot=body.scheduled_time_slot,
        checklist=checklist_to_use,
        photo_urls=[],
        video_urls=[],
        maintenance_issue_ids=[],
        reference=ref,
        baseline_inspection_id=baseline_inspection_id,
    )
    db.add(inspection)
    await db.flush()
    await db.refresh(inspection)
    return _insp_out(inspection)


async def update_inspection(
    inspection_id: uuid.UUID,
    body: InspectionUpdate,
    org_id: uuid.UUID | None,
    db: AsyncSession,
) -> InspectionOut:
    i = await _get_inspection(inspection_id, org_id, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(i, field, value)
    await db.flush()
    await db.refresh(i)
    return _insp_out(i)


async def transition_inspection(
    inspection_id: uuid.UUID,
    event: str,
    org_id: uuid.UUID | None,
    db: AsyncSession,
) -> InspectionOut:
    i = await _get_inspection(inspection_id, org_id, db)
    current = i.state if isinstance(i.state, str) else i.state.value

    new_state = _INSPECTION_EVENT_TO_STATE.get(event)
    if not new_state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown inspection event: {event}",
        )

    allowed = INSPECTION_TRANSITIONS.get(current, [])
    if new_state not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot transition inspection from '{current}' via '{event}'",
        )

    now = datetime.now(timezone.utc)
    i.state = new_state

    if new_state == InspectionState.in_progress:
        i.started_at = now
    elif new_state == InspectionState.completed:
        i.completed_at = now
    elif new_state == InspectionState.approved:
        i.approved_at = now

    await db.flush()
    await db.refresh(i)
    return _insp_out(i)


async def add_inspection_photos(
    inspection_id: uuid.UUID,
    urls: list[str],
    org_id: uuid.UUID | None,
    db: AsyncSession,
) -> InspectionOut:
    i = await _get_inspection(inspection_id, org_id, db)
    existing = list(i.photo_urls or [])
    existing.extend(urls)
    i.photo_urls = existing
    await db.flush()
    await db.refresh(i)
    return _insp_out(i)


# ── Report & signing ───────────────────────────────────────────────────────────

_TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "features", "inspections", "templates")


_CONDITION_RANK = {"excellent": 4, "good": 3, "fair": 2, "poor": 1, "damaged": 0}


def _condition_degraded(before: str | None, after: str | None) -> bool:
    if not before or not after:
        return False
    return _CONDITION_RANK.get(after, 3) < _CONDITION_RANK.get(before, 3)


_KEY_PREFIXES = ("inspections/", "documents/", "signatures/", "properties/", "payment_receipt/")


def _key_from_url(url: str, public_base_url: str | None = None) -> str | None:
    """Extract the storage object key from a stored URL."""
    if not url:
        return None
    # Local dev: /api/v1/upload/local/{key} or /api/upload/local/{key}
    if "/upload/local/" in url:
        return url.split("/upload/local/", 1)[-1]
    # MinIO/S3 with known public_base_url: strip prefix to get key
    if public_base_url:
        prefix = public_base_url.rstrip("/") + "/"
        if url.startswith(prefix):
            return url[len(prefix):]
    # Fallback: find first well-known key prefix in URL path
    for prefix in _KEY_PREFIXES:
        idx = url.find(prefix)
        if idx != -1:
            return url[idx:]
    return None


def _b64_from_url(url: str) -> str | None:
    """Dev-only fallback: read a local upload from the filesystem."""
    try:
        rel = url.split("/upload/local/", 1)[-1]
        abs_path = os.path.join(os.getcwd(), "uploads", rel)
        if not os.path.isfile(abs_path):
            return None
        with open(abs_path, "rb") as f:
            return base64.b64encode(f.read()).decode()
    except Exception:
        return None


async def _b64_from_storage(url: str, provider, public_base_url: str | None = None) -> str | None:
    """Download a stored file via the storage provider and return base64 bytes.

    Works for both local dev (filesystem) and production MinIO/S3 (internal
    credentials) so photos are always embedded in generated PDF reports.
    """
    try:
        key = _key_from_url(url, public_base_url)
        if not key:
            return None
        data = await provider.download(key)
        return base64.b64encode(data).decode()
    except Exception:
        log.debug("inspection.report_pdf.photo_skip url=%s", url)
        return None


async def generate_report_pdf(
    inspection_id: uuid.UUID,
    org_id: uuid.UUID | None,
    db: AsyncSession,
) -> InspectionOut:
    i = await _get_inspection(inspection_id, org_id, db)

    if i.state not in (InspectionState.completed, InspectionState.approved):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Report can only be generated once the inspection is completed or approved",
        )

    try:
        from jinja2 import Environment, FileSystemLoader, select_autoescape
        from weasyprint import HTML as WPHtml

        from app.models.organisation import Organisation
        from app.models.property import Property, Unit
        from app.models.tenant import Tenant

        org  = await db.scalar(select(Organisation).where(Organisation.id == i.organisation_id))
        prop = await db.scalar(select(Property).where(Property.id == i.property_id)) if i.property_id else None
        unit = await db.scalar(select(Unit).where(Unit.id == i.unit_id)) if i.unit_id else None

        tenant = None
        if i.tenant_id:
            from app.models.tenant import Tenant
            tenant = await db.scalar(select(Tenant).where(Tenant.id == i.tenant_id))

        prop_address = ""
        if prop and prop.address:
            addr = prop.address if isinstance(prop.address, dict) else {}
            parts = [addr.get("line1"), addr.get("city"), addr.get("state"), addr.get("country")]
            prop_address = ", ".join(p for p in parts if p)

        tenant_name = "Tenant"
        if tenant:
            tenant_name = f"{tenant.first_name or ''} {tenant.last_name or ''}".strip() or tenant.email

        now_dt = datetime.now(timezone.utc)

        # Initialise storage provider early — needed for photo embedding
        from app.core.config import get_settings as _get_settings
        from app.core.storage import get_storage_provider
        from app.services import settings_service as _ss
        _config = await _ss.get_storage_config(db)
        _provider = get_storage_provider(_config, local_base_url=_get_settings().storage_local_base_url)
        _pub_base = _config.get("public_base_url")

        def _fmt_sig(dt) -> str | None:
            if dt is None:
                return None
            return dt.strftime("%d %B %Y at %H:%M UTC") if hasattr(dt, "strftime") else str(dt)

        async def _photos(urls: list, limit: int) -> list[str]:
            results = []
            for u in urls[:limit]:
                b64 = await _b64_from_storage(u, _provider, _pub_base)
                if b64:
                    results.append(b64)
            return results

        # Build checklist with max 2 photos per item embedded as base64
        checklist_ctx = []
        for item in (i.checklist or []):
            item_photos = item.get("photo_urls") or item.get("photoUrls") or []
            photo_data = await _photos(item_photos, 2)
            checklist_ctx.append({
                "area":        item.get("area", ""),
                "description": item.get("description", ""),
                "condition":   item.get("condition"),
                "notes":       item.get("notes", ""),
                "photo_data":  photo_data,
            })

        # General photos (all), up to 9 shown in PDF
        general_photos = await _photos(i.photo_urls or [], 9)

        ctx = {
            "inspection_ref":    i.reference or str(i.id)[:8].upper(),
            "org_name":          org.name if org else "Property Management",
            "org_address":       "",
            "property_name":     prop.name if prop else "—",
            "unit_name":         unit.name if unit else None,
            "property_address":  prop_address,
            "tenant_name":       tenant_name,
            "tenant_email":      tenant.email if tenant else "",
            "inspector_name":    i.inspector_name or "—",
            "scheduled_date":    str(i.scheduled_date),
            "scheduled_time_slot": i.scheduled_time_slot,
            "overall_condition": i.overall_condition,
            "summary":           i.summary,
            "recommendations":   i.recommendations,
            "checklist":         checklist_ctx,
            "general_photos":    general_photos,
            "landlord_signed_at":  _fmt_sig(i.landlord_signed_at),
            "landlord_signed_by":  i.landlord_signed_by,
            "tenant_signed_at":    _fmt_sig(i.tenant_signed_at),
            "generated_at":      now_dt.strftime("%d %B %Y at %H:%M UTC"),
        }

        jinja = Environment(
            loader=FileSystemLoader(_TEMPLATE_DIR),
            autoescape=select_autoescape(["html"]),
        )
        template_name = "report.html"
        if (i.type == "move_out" or (hasattr(i, "type") and str(i.type) == "move_out")) and i.baseline_inspection_id:
            template_name = "move_out_report.html"
            # Fetch baseline (move-in) inspection for comparison
            baseline = await db.scalar(select(Inspection).where(Inspection.id == i.baseline_inspection_id))
            if baseline:
                # Build comparison checklist
                baseline_map = {item.get("id"): item for item in (baseline.checklist or [])}
                comparison_checklist = []
                for item in (i.checklist or []):
                    base_item = baseline_map.get(item.get("id"), {})
                    item_photos = item.get("photo_urls") or item.get("photoUrls") or []
                    photo_data = await _photos(item_photos, 2)
                    comparison_checklist.append({
                        "area": item.get("area", ""),
                        "description": item.get("description", ""),
                        "move_in_condition": item.get("move_in_condition") or base_item.get("condition"),
                        "move_in_notes": item.get("move_in_notes") or base_item.get("notes", ""),
                        "condition": item.get("condition"),
                        "notes": item.get("notes", ""),
                        "photo_data": photo_data,
                        "degraded": _condition_degraded(
                            item.get("move_in_condition") or base_item.get("condition"),
                            item.get("condition"),
                        ),
                    })
                ctx["checklist"] = comparison_checklist
                ctx["baseline_date"] = str(baseline.scheduled_date)
                ctx["has_comparison"] = True

        html_str = jinja.get_template(template_name).render(**ctx)

        pdf_bytes = WPHtml(string=html_str).write_pdf()

        # Upload to configured storage (MinIO in prod, local filesystem in dev)
        _key = f"documents/inspection_reports/{i.id}/report.pdf"
        pdf_url = await _provider.upload(_key, pdf_bytes, "application/pdf")
        i.report_pdf_url = pdf_url
        await db.flush()
        await db.refresh(i)
        return _insp_out(i)

    except HTTPException:
        raise
    except Exception:
        log.warning("inspection.report_pdf.failed", extra={"inspection_id": str(i.id)}, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate inspection report PDF",
        )


async def download_report_pdf(
    inspection_id: uuid.UUID,
    org_id: uuid.UUID | None,
    db: AsyncSession,
) -> bytes:
    i = await _get_inspection(inspection_id, org_id, db)
    if not i.report_pdf_url:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report has not been generated yet",
        )
    try:
        from app.core.config import get_settings as _get_settings
        from app.core.storage import get_storage_provider
        from app.services import settings_service as _ss
        _config = await _ss.get_storage_config(db)
        _provider = get_storage_provider(_config, local_base_url=_get_settings().storage_local_base_url)
        _key = f"documents/inspection_reports/{i.id}/report.pdf"
        return await _provider.download(_key)
    except HTTPException:
        raise
    except Exception:
        log.warning("inspection.report_pdf.download_failed", extra={"inspection_id": str(i.id)}, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to retrieve inspection report PDF",
        )


async def download_report_pdf_public(
    inspection_id: uuid.UUID,
    db: AsyncSession,
) -> bytes:
    """Public download — only available once the tenant has signed (fully executed report)."""
    i = await db.scalar(select(Inspection).where(Inspection.id == inspection_id))
    if not i:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")
    if not i.tenant_signed_at:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Report is not yet fully signed")
    if not i.report_pdf_url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report PDF not yet generated")
    try:
        from app.core.config import get_settings as _get_settings
        from app.core.storage import get_storage_provider
        from app.services import settings_service as _ss
        _config = await _ss.get_storage_config(db)
        _provider = get_storage_provider(_config, local_base_url=_get_settings().storage_local_base_url)
        _key = f"documents/inspection_reports/{i.id}/report.pdf"
        return await _provider.download(_key)
    except HTTPException:
        raise
    except Exception:
        log.warning("inspection.report_pdf.public_download_failed", extra={"inspection_id": str(i.id)}, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to retrieve inspection report PDF",
        )


async def sign_landlord(
    inspection_id: uuid.UUID,
    signed_by: str,
    org_id: uuid.UUID | None,
    db: AsyncSession,
) -> InspectionOut:
    i = await _get_inspection(inspection_id, org_id, db)

    if i.state not in (InspectionState.completed, InspectionState.approved):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Inspection must be completed or approved before signing",
        )

    i.landlord_signed_at = datetime.now(timezone.utc)
    i.landlord_signed_by = signed_by
    await db.flush()
    await db.refresh(i)

    # Regenerate the PDF to include the landlord's signature block
    try:
        updated = await generate_report_pdf(inspection_id, org_id, db)
        return updated
    except Exception:
        return _insp_out(i)


async def send_for_tenant_signing(
    inspection_id: uuid.UUID,
    org_id: uuid.UUID | None,
    db: AsyncSession,
) -> InspectionOut:
    i = await _get_inspection(inspection_id, org_id, db)

    if not i.landlord_signed_at:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Landlord must sign the report before sending it to the tenant",
        )

    # Resolve tenant entity for email/name.
    # inspection.tenant_id FK → profiles.id; tenants.id is on the lease.
    # Try both paths so inspections with either kind of stored id work.
    from app.models.tenant import Tenant as _Tenant
    tenant = None

    if i.tenant_id:
        # New path: i.tenant_id is a Profile UUID — get Tenant via Profile.tenant_id
        from app.models.profile import Profile as _P
        _prof = await db.scalar(select(_P).where(_P.id == i.tenant_id))
        if _prof and _prof.tenant_id:
            tenant = await db.scalar(select(_Tenant).where(_Tenant.id == _prof.tenant_id))
        if not tenant:
            # Legacy path: i.tenant_id was stored as a Tenant UUID before the FK fix
            tenant = await db.scalar(select(_Tenant).where(_Tenant.id == i.tenant_id))

    if not tenant and i.lease_id:
        # Fallback: look up tenant directly from the lease
        linked_lease = await db.scalar(select(Lease).where(Lease.id == i.lease_id))
        if linked_lease and linked_lease.tenant_id:
            tenant = await db.scalar(select(_Tenant).where(_Tenant.id == linked_lease.tenant_id))
            # Backfill i.tenant_id with the Profile UUID (FK-correct)
            if tenant and not i.tenant_id:
                from app.models.profile import Profile as _P
                _prof = await db.scalar(select(_P).where(_P.tenant_id == linked_lease.tenant_id))
                if _prof:
                    i.tenant_id = _prof.id
                    await db.flush()

    if not tenant or not tenant.email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No tenant is linked to this inspection",
        )

    # Issue a fresh token (or reuse unexpired one)
    now = datetime.now(timezone.utc)
    if not i.sign_token or (i.sign_token_expires_at and i.sign_token_expires_at < now):
        i.sign_token = secrets.token_urlsafe(32)
        i.sign_token_expires_at = now + timedelta(days=14)

    await db.flush()

    tenant_name = f"{tenant.first_name or ''} {tenant.last_name or ''}".strip() or tenant.email

    from app.models.organisation import Organisation
    # If inspection has NULL organisation_id (created by superadmin), derive from lease
    notif_org_id = i.organisation_id
    if notif_org_id is None and i.lease_id:
        _nl = await db.scalar(select(Lease).where(Lease.id == i.lease_id))
        if _nl:
            notif_org_id = _nl.organisation_id
    if notif_org_id is None and i.property_id:
        _np = await db.scalar(select(Property).where(Property.id == i.property_id))
        if _np:
            notif_org_id = _np.organisation_id

    org = await db.scalar(select(Organisation).where(Organisation.id == notif_org_id)) if notif_org_id else None
    from app.models.property import Property
    prop = await db.scalar(select(Property).where(Property.id == i.property_id)) if i.property_id else None

    # Build sign URL — the tenant clicks this to review and sign
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    sign_url = f"{frontend_url}/inspect/sign/{i.sign_token}"
    expires_str = i.sign_token_expires_at.strftime("%d %B %Y")

    insp_label = _insp_type_label(i.type)
    prop_name = prop.name if prop else "your property"
    org_name = org.name if org else "Crib Property Management"

    subject = "Inspection Report Ready — Please Review and Sign"
    body = (
        f"Dear {tenant_name},\n\n"
        f"Your {insp_label} inspection report for {prop_name} is ready for your review and signature.\n\n"
        f"The landlord/property manager has already reviewed and signed the report. "
        f"Please click the link below to view the full report and add your signature:\n\n"
        f"    {sign_url}\n\n"
        f"This link expires on {expires_str}. After that date you will need to contact "
        f"your property manager to request a new link.\n\n"
        f"Once you sign, both parties will have a fully executed copy of the {insp_label} inspection report.\n\n"
        f"Best regards,\n{org_name}"
    )

    # Use a savepoint so notification failures cannot poison the outer transaction
    # that holds the committed sign_token. If the notification INSERT fails (e.g.
    # organisation_id NOT NULL when notif_org_id is None), only the savepoint rolls
    # back; the outer transaction with sign_token remains clean.
    # IDs are collected in a tmp list and only promoted to _notif_ids after the
    # savepoint exits successfully, so we never dispatch for rows that were
    # rolled back by a partial failure inside the savepoint.
    _notif_ids: list[str] = []
    try:
        _pending_ids: list[str] = []
        async with db.begin_nested():
            from app.models.notification import Notification, NotificationState

            notif = Notification(
                organisation_id=notif_org_id,
                channel="email",
                trigger="inspection_sign_request",
                state=NotificationState.queued,
                tenant_id=i.tenant_id,
                recipient_name=tenant_name,
                recipient_email=tenant.email,
                subject=subject,
                body=body,
                queued_at=datetime.now(timezone.utc),
            )
            db.add(notif)
            await db.flush()
            _pending_ids.append(str(notif.id))

            tenant_phone = tenant.whatsapp_number or tenant.phone
            if tenant_phone:
                wa_body = (
                    f"Hi {tenant_name}, your {insp_label} inspection report for {prop_name} "
                    f"is ready for your signature. Please sign it here before {expires_str}: {sign_url}"
                )
                wa_notif = Notification(
                    organisation_id=notif_org_id,
                    channel="whatsapp",
                    trigger="inspection_sign_request",
                    state=NotificationState.queued,
                    tenant_id=i.tenant_id,
                    recipient_name=tenant_name,
                    recipient_phone=tenant_phone,
                    subject=None,
                    body=wa_body,
                    queued_at=datetime.now(timezone.utc),
                )
                db.add(wa_notif)
                await db.flush()
                _pending_ids.append(str(wa_notif.id))
        # Savepoint committed — all notification rows exist in the outer transaction
        _notif_ids = _pending_ids
    except Exception:
        log.warning("inspection.sign_email.failed", extra={"inspection_id": str(i.id)}, exc_info=True)

    # Dispatch Celery tasks after the savepoint is released so the notification
    # rows are guaranteed to exist when the worker picks them up.
    if _notif_ids:
        from app.worker.tasks.notifications import deliver_notification
        for _nid in _notif_ids:
            deliver_notification.delay(_nid)

    await db.refresh(i)
    return _insp_out(i)


import re as _re
_INSPECTION_KEY_RE = _re.compile(r"(inspections/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.+)")


def _to_public_photo_url(url: str, token: str) -> str:
    """Rewrite any stored inspection photo URL to a token-gated /upload/serve-public/ URL.

    Handles three stored formats:
      1. Backend proxy: /api/v1/upload/serve/{key}
      2. MinIO/S3 direct: https://minio.host/bucket/inspections/{id}/...
      3. Local dev: /api/upload/local/{key}  — already public, returned unchanged
    """
    if not url:
        return url
    # Already the backend proxy URL — rewrite to public variant
    if "/upload/serve/" in url:
        key = url.split("/upload/serve/", 1)[1]
        return f"/api/v1/upload/serve-public/{key}?sign_token={token}"
    # Local dev URLs are served without auth — no rewrite needed
    if "/api/upload/local/" in url or "/upload/local/" in url:
        return url
    # MinIO/S3 direct URL: extract the inspection key via UUID pattern
    m = _INSPECTION_KEY_RE.search(url)
    if m:
        key = m.group(1)
        return f"/api/v1/upload/serve-public/{key}?sign_token={token}"
    return url


def _rewrite_checklist_photos(checklist: list, token: str) -> list:
    """Rewrite photo URLs inside checklist items (supports both photo_urls and photoUrls keys)."""
    out = []
    for item in checklist:
        item = dict(item)
        for key in ("photo_urls", "photoUrls"):
            if item.get(key):
                item[key] = [_to_public_photo_url(u, token) for u in item[key]]
        out.append(item)
    return out


async def get_by_sign_token(token: str, db: AsyncSession) -> InspectionPublicOut:
    """Public — no org scope; validates token freshness."""
    i = await db.scalar(select(Inspection).where(Inspection.sign_token == token))
    if not i:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sign link not found")

    now = datetime.now(timezone.utc)
    if i.sign_token_expires_at and i.sign_token_expires_at < now:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="This sign link has expired")

    from app.models.property import Property, Unit
    prop = await db.scalar(select(Property).where(Property.id == i.property_id)) if i.property_id else None
    unit = await db.scalar(select(Unit).where(Unit.id == i.unit_id)) if i.unit_id else None

    def _s(v) -> str | None:
        if v is None:
            return None
        return v.isoformat() if hasattr(v, "isoformat") else str(v)

    _pub_photos = [_to_public_photo_url(u, token) for u in (i.photo_urls or [])]
    _pub_checklist = _rewrite_checklist_photos(i.checklist or [], token)

    return InspectionPublicOut(
        id=str(i.id),
        type=i.type if isinstance(i.type, str) else i.type.value,
        state=i.state if isinstance(i.state, str) else i.state.value,
        scheduled_date=str(i.scheduled_date),
        property_name=prop.name if prop else None,
        unit_name=unit.name if unit else None,
        overall_condition=i.overall_condition,
        summary=i.summary,
        recommendations=i.recommendations,
        checklist=_pub_checklist,
        checklist_count=len(_pub_checklist),
        photo_urls=_pub_photos,
        photo_count=len(_pub_photos),
        landlord_signed_at=_s(i.landlord_signed_at),
        landlord_signed_by=i.landlord_signed_by,
        tenant_signed_at=_s(i.tenant_signed_at),
        sign_token_expires_at=_s(i.sign_token_expires_at),
        report_pdf_url=i.report_pdf_url,
    )


async def sign_tenant(token: str, full_name: str, db: AsyncSession) -> InspectionPublicOut:
    """Public — tenant signs via token link."""
    i = await db.scalar(select(Inspection).where(Inspection.sign_token == token))
    if not i:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sign link not found")

    now = datetime.now(timezone.utc)
    if i.sign_token_expires_at and i.sign_token_expires_at < now:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="This sign link has expired")

    if i.tenant_signed_at:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The tenant has already signed this report",
        )

    i.tenant_signed_at = now
    # Invalidate the token after use
    i.sign_token = None
    i.sign_token_expires_at = None
    await db.flush()

    # Regenerate PDF with both signatures
    try:
        await generate_report_pdf(i.id, None, db)
        await db.refresh(i)
    except Exception:
        log.warning("inspection.sign_tenant_pdf.failed", extra={"inspection_id": str(i.id)}, exc_info=True)

    # Notify all parties that the report is fully executed
    try:
        from app.models.notification import Notification, NotificationState
        from app.models.organisation import Organisation
        from app.models.property import Property as _NotifProp
        from app.models.tenant import Tenant as _NotifTenant
        from app.models.profile import Profile as _NotifProfile
        from app.worker.tasks.notifications import deliver_notification

        org  = await db.scalar(select(Organisation).where(Organisation.id == i.organisation_id)) if i.organisation_id else None
        prop = await db.scalar(select(_NotifProp).where(_NotifProp.id == i.property_id)) if i.property_id else None

        insp_label = _insp_type_label(i.type)
        prop_name  = prop.name if prop else "a property"
        org_name   = org.name if org else "Crib Property Management"
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

        # 1 — Email to org/landlord confirming tenant signed
        if org and org.email and i.organisation_id:
            landlord_body = (
                f"The tenant has signed the {insp_label} inspection report for {prop_name}.\n\n"
                f"Both signatures are now on file."
                + (f"\n\nThe sealed PDF is available at: {i.report_pdf_url}" if i.report_pdf_url else "")
            )
            landlord_notif = Notification(
                organisation_id=i.organisation_id,
                channel="email",
                trigger="inspection_tenant_signed",
                state=NotificationState.queued,
                recipient_name=org.name,
                recipient_email=org.email,
                subject=f"Tenant Signed the {insp_label.title()} Inspection Report",
                body=landlord_body,
                queued_at=datetime.now(timezone.utc),
            )
            db.add(landlord_notif)
            await db.flush()
            deliver_notification.delay(str(landlord_notif.id))

        # 2 — Email + WhatsApp to tenant: report ready for download
        tenant = None
        if i.tenant_id:
            _prof = await db.scalar(select(_NotifProfile).where(_NotifProfile.id == i.tenant_id))
            if _prof and _prof.tenant_id:
                tenant = await db.scalar(select(_NotifTenant).where(_NotifTenant.id == _prof.tenant_id))
            if not tenant:
                tenant = await db.scalar(select(_NotifTenant).where(_NotifTenant.id == i.tenant_id))
        if not tenant and i.lease_id:
            _nl = await db.scalar(select(Lease).where(Lease.id == i.lease_id))
            if _nl and _nl.tenant_id:
                tenant = await db.scalar(select(_NotifTenant).where(_NotifTenant.id == _nl.tenant_id))

        if tenant and tenant.email:
            tenant_name = f"{tenant.first_name or ''} {tenant.last_name or ''}".strip() or tenant.email
            portal_url  = f"{frontend_url}/portal"
            tenant_email_body = (
                f"Dear {tenant_name},\n\n"
                f"Your {insp_label} inspection report for {prop_name} has been fully signed by both parties "
                f"and is now ready.\n\n"
                f"You can view and download your signed copy from the tenant portal:\n\n"
                f"    {portal_url}\n\n"
                f"Log in and navigate to the Inspections section to access the report.\n\n"
                f"Best regards,\n{org_name}"
            )
            email_notif = Notification(
                organisation_id=i.organisation_id,
                channel="email",
                trigger="inspection_report_ready",
                state=NotificationState.queued,
                tenant_id=i.tenant_id,
                recipient_name=tenant_name,
                recipient_email=tenant.email,
                subject=f"Your {insp_label.title()} Inspection Report Is Ready",
                body=tenant_email_body,
                queued_at=datetime.now(timezone.utc),
            )
            db.add(email_notif)
            await db.flush()
            deliver_notification.delay(str(email_notif.id))

            tenant_phone = tenant.whatsapp_number or tenant.phone
            if tenant_phone:
                wa_notif = Notification(
                    organisation_id=i.organisation_id,
                    channel="whatsapp",
                    trigger="inspection_report_ready",
                    state=NotificationState.queued,
                    tenant_id=i.tenant_id,
                    recipient_name=tenant_name,
                    recipient_phone=tenant_phone,
                    subject=None,
                    body=(
                        f"Hi {tenant_name}, your {insp_label} inspection report for {prop_name} "
                        f"is now fully signed by both parties. Log in to your tenant portal to download your copy: "
                        f"{portal_url}"
                    ),
                    queued_at=datetime.now(timezone.utc),
                )
                db.add(wa_notif)
                await db.flush()
                deliver_notification.delay(str(wa_notif.id))
    except Exception:
        log.warning("inspection.sign_tenant_notify.failed", extra={"inspection_id": str(i.id)}, exc_info=True)

    from app.models.property import Property, Unit
    prop = await db.scalar(select(Property).where(Property.id == i.property_id)) if i.property_id else None
    unit = await db.scalar(select(Unit).where(Unit.id == i.unit_id)) if i.unit_id else None

    def _s(v) -> str | None:
        if v is None:
            return None
        return v.isoformat() if hasattr(v, "isoformat") else str(v)

    return InspectionPublicOut(
        id=str(i.id),
        type=i.type if isinstance(i.type, str) else i.type.value,
        state=i.state if isinstance(i.state, str) else i.state.value,
        scheduled_date=str(i.scheduled_date),
        property_name=prop.name if prop else None,
        unit_name=unit.name if unit else None,
        overall_condition=i.overall_condition,
        summary=i.summary,
        recommendations=i.recommendations,
        checklist=i.checklist or [],
        checklist_count=len(i.checklist or []),
        photo_urls=i.photo_urls or [],
        photo_count=len(i.photo_urls or []),
        landlord_signed_at=_s(i.landlord_signed_at),
        landlord_signed_by=i.landlord_signed_by,
        tenant_signed_at=_s(i.tenant_signed_at),
        sign_token_expires_at=None,  # token consumed
        report_pdf_url=i.report_pdf_url,
    )


# ── Maintenance CRUD ───────────────────────────────────────────────────────────

async def list_maintenance(
    org_id: uuid.UUID | None,
    db: AsyncSession,
    property_id: str | None = None,
    states: list[str] | None = None,
    priority: str | None = None,
    category: str | None = None,
    search: str | None = None,
    reported_by: str | None = None,
    page: int = 1,
    page_size: int = 20,
    landlord_profile_id: uuid.UUID | None = None,
) -> dict:
    q = org_scope(select(MaintenanceIssue), MaintenanceIssue.organisation_id, org_id)
    if landlord_profile_id is not None:
        allowed = select(LandlordPropertyAccess.property_id).where(
            LandlordPropertyAccess.landlord_profile_id == landlord_profile_id
        )
        q = q.where(MaintenanceIssue.property_id.in_(allowed))
    if property_id:
        q = q.where(MaintenanceIssue.property_id == uuid.UUID(property_id))
    if states:
        q = q.where(MaintenanceIssue.state.in_(states))
    if priority:
        q = q.where(MaintenanceIssue.priority == priority)
    if category:
        q = q.where(MaintenanceIssue.category == category)
    if search:
        term = f"%{search}%"
        q = q.where(MaintenanceIssue.title.ilike(term))
    if reported_by:
        q = q.where(MaintenanceIssue.reported_by == reported_by)

    total = await db.scalar(select(func.count()).select_from(q.subquery())) or 0
    q = q.order_by(MaintenanceIssue.reported_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    issues = result.scalars().all()

    # Batch-fetch display names to avoid N+1 queries
    unit_ids     = {i.unit_id     for i in issues if i.unit_id}
    property_ids = {i.property_id for i in issues if i.property_id}

    unit_map:     dict[uuid.UUID, str] = {}
    property_map: dict[uuid.UUID, str] = {}

    if unit_ids:
        rows = (await db.execute(select(Unit).where(Unit.id.in_(unit_ids)))).scalars().all()
        unit_map = {u.id: u.name for u in rows}

    if property_ids:
        rows = (await db.execute(select(Property).where(Property.id.in_(property_ids)))).scalars().all()
        property_map = {p.id: p.name for p in rows}

    return {
        "data": [
            _maint_out(
                m,
                property_name=property_map.get(m.property_id) if m.property_id else None,
                unit_name=unit_map.get(m.unit_id) if m.unit_id else None,
            )
            for m in issues
        ],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "hasNext": (page * page_size) < total,
    }


async def _maint_names(m: MaintenanceIssue, db: AsyncSession) -> tuple[str | None, str | None]:
    """Return (property_name, unit_name) for a single maintenance issue."""
    property_name: str | None = None
    unit_name: str | None = None
    if m.property_id:
        p = await db.scalar(select(Property).where(Property.id == m.property_id))
        property_name = p.name if p else None
    if m.unit_id:
        u = await db.scalar(select(Unit).where(Unit.id == m.unit_id))
        unit_name = u.name if u else None
    return property_name, unit_name


async def get_maintenance_issue(
    issue_id: uuid.UUID, org_id: uuid.UUID | None, db: AsyncSession
) -> MaintenanceOut:
    m = await _get_maintenance(issue_id, org_id, db)
    pname, uname = await _maint_names(m, db)
    return _maint_out(m, property_name=pname, unit_name=uname)


async def create_maintenance_issue(
    body: MaintenanceCreate, org_id: uuid.UUID | None, db: AsyncSession
) -> MaintenanceOut:
    now = datetime.now(timezone.utc)
    year = now.year
    seq = await next_seq(db, MaintenanceIssue, year=year)
    ref = build_ref("MNT", seq, str(year))

    issue = MaintenanceIssue(
        organisation_id=org_id,
        property_id=uuid.UUID(body.property_id),
        unit_id=uuid.UUID(body.unit_id) if body.unit_id else None,
        lease_id=uuid.UUID(body.lease_id) if body.lease_id else None,
        inspection_id=uuid.UUID(body.inspection_id) if body.inspection_id else None,
        reported_by=body.reported_by,
        reported_by_id=body.reported_by_id,
        title=body.title,
        description=body.description,
        category=body.category,
        priority=body.priority,
        state=MaintenanceState.reported,
        estimated_cost=body.estimated_cost,
        currency=body.currency,
        reported_at=now,
        photo_urls=body.photo_urls or [],
        notes=body.notes,
        reference=ref,
    )
    db.add(issue)
    await db.flush()
    await db.refresh(issue)

    # Notify org manager of the new maintenance request.
    # Savepoint isolates notification failures from the outer transaction.
    _create_notif_ids: list[str] = []
    try:
        from app.models.notification import Notification, NotificationState
        from app.models.organisation import Organisation
        org = await db.scalar(select(Organisation).where(Organisation.id == org_id))
        if org and org.email:
            prop = await db.scalar(select(Property).where(Property.id == issue.property_id)) if issue.property_id else None
            unit = await db.scalar(select(Unit).where(Unit.id == issue.unit_id)) if issue.unit_id else None
            location = prop.name if prop else "a property"
            if unit:
                location = f"{unit.name}, {location}"
            _pending: list[str] = []
            async with db.begin_nested():
                notif = Notification(
                    organisation_id=org_id,
                    channel="email",
                    trigger="maintenance_new_request",
                    state=NotificationState.queued,
                    recipient_name=org.name,
                    recipient_email=org.email,
                    subject=f"New Maintenance Request: {issue.title}",
                    body=(
                        f"A new [{issue.priority.upper()}] maintenance request has been logged for {location}.\n\n"
                        f"Reference: {issue.reference}\n"
                        f"Category: {issue.category.title()}\n"
                        f"Title: {issue.title}\n\n"
                        f"{('Details: ' + issue.description) if issue.description else ''}\n\n"
                        f"Please review and assign this request in the Crib maintenance queue."
                    ),
                    queued_at=datetime.now(timezone.utc),
                )
                db.add(notif)
                await db.flush()
                _pending.append(str(notif.id))
            _create_notif_ids = _pending
    except Exception:
        log.warning("maintenance.create.notify_manager.failed", extra={"issue_id": str(issue.id)}, exc_info=True)
    if _create_notif_ids:
        from app.worker.tasks.notifications import deliver_notification
        for _nid in _create_notif_ids:
            deliver_notification.delay(_nid)

    pname, uname = await _maint_names(issue, db)
    return _maint_out(issue, property_name=pname, unit_name=uname)


async def update_maintenance_issue(
    issue_id: uuid.UUID,
    body: MaintenanceUpdate,
    org_id: uuid.UUID | None,
    db: AsyncSession,
) -> MaintenanceOut:
    m = await _get_maintenance(issue_id, org_id, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(m, field, value)
    await db.flush()
    await db.refresh(m)
    pname, uname = await _maint_names(m, db)
    return _maint_out(m, property_name=pname, unit_name=uname)


async def transition_maintenance(
    issue_id: uuid.UUID,
    body: MaintenanceTransition,
    org_id: uuid.UUID | None,
    db: AsyncSession,
) -> MaintenanceOut:
    m = await _get_maintenance(issue_id, org_id, db)
    current = m.state if isinstance(m.state, str) else m.state.value

    new_state = _MAINTENANCE_EVENT_TO_STATE.get(body.event)
    if not new_state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown maintenance event: {body.event}",
        )

    allowed = MAINTENANCE_TRANSITIONS.get(current, [])
    if new_state not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot transition maintenance from '{current}' via '{body.event}'",
        )

    now = datetime.now(timezone.utc)
    m.state = new_state

    if new_state == MaintenanceState.assigned:
        # Resolve contractor from directory if contractor_id provided
        contractor_name: str | None = None
        contractor_phone: str | None = None
        contractor_email: str | None = None
        if body.contractor_id:
            from app.models.contractor import Contractor as _Contractor
            _c = await db.scalar(
                select(_Contractor).where(
                    _Contractor.id == uuid.UUID(body.contractor_id),
                    _Contractor.organisation_id == m.organisation_id,
                    _Contractor.is_active.is_(True),
                )
            )
            if not _c:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Contractor not found or inactive",
                )
            m.contractor_id = _c.id
            contractor_name = _c.name
            contractor_phone = _c.phone
            contractor_email = _c.email
            m.assigned_to = _c.name
        elif body.assigned_to:
            m.assigned_to = body.assigned_to
        m.assigned_at = now
    elif new_state == MaintenanceState.in_progress:
        m.started_at = now
    elif new_state == MaintenanceState.resolved:
        m.resolved_at = now
    elif new_state == MaintenanceState.closed:
        m.closed_at = now

    await db.flush()
    await db.refresh(m)

    _transition_notif_ids: list[str] = []
    try:
        from app.models.notification import Notification, NotificationState
        _pending_t: list[str] = []
        async with db.begin_nested():
            # Notify contractor on assignment
            if new_state == MaintenanceState.assigned and (contractor_email or contractor_phone):
                prop_for_notif = await db.scalar(select(Property).where(Property.id == m.property_id)) if m.property_id else None
                location_str = prop_for_notif.name if prop_for_notif else "a property"
                if contractor_email:
                    cn = Notification(
                        organisation_id=m.organisation_id,
                        channel="email",
                        trigger="maintenance_contractor_assigned",
                        state=NotificationState.queued,
                        recipient_name=contractor_name,
                        recipient_email=contractor_email,
                        subject=f"Maintenance Job Assigned: {m.title}",
                        body=(
                            f"Dear {contractor_name},\n\n"
                            f"You have been assigned a maintenance job at {location_str}.\n\n"
                            f"Reference: {m.reference}\n"
                            f"Category: {m.category.title() if isinstance(m.category, str) else m.category.value.title()}\n"
                            f"Priority: {m.priority.upper() if isinstance(m.priority, str) else m.priority.value.upper()}\n"
                            f"Title: {m.title}\n\n"
                            f"{('Details: ' + m.description) if m.description else ''}\n\n"
                            f"Please contact the property manager for access arrangements."
                        ),
                        queued_at=now,
                    )
                    db.add(cn)
                    await db.flush()
                    _pending_t.append(str(cn.id))
                if contractor_phone:
                    wa_body = (
                        f"Hi {contractor_name}, you have been assigned a maintenance job "
                        f"({m.reference}) at {location_str}: {m.title}. "
                        f"Priority: {m.priority.upper() if isinstance(m.priority, str) else m.priority.value.upper()}. "
                        f"Please contact the property manager for details."
                    )
                    wn = Notification(
                        organisation_id=m.organisation_id,
                        channel="whatsapp",
                        trigger="maintenance_contractor_assigned",
                        state=NotificationState.queued,
                        recipient_name=contractor_name,
                        recipient_phone=contractor_phone,
                        subject=None,
                        body=wa_body,
                        queued_at=now,
                    )
                    db.add(wn)
                    await db.flush()
                    _pending_t.append(str(wn.id))

            # Notify tenant of status change when a lease is linked
            if m.lease_id and new_state not in (MaintenanceState.cancelled,):
                from app.models.lease import Lease
                from app.models.tenant import Tenant
                lease = await db.scalar(select(Lease).where(Lease.id == m.lease_id))
                if lease and lease.tenant_id:
                    tenant = await db.scalar(select(Tenant).where(Tenant.id == lease.tenant_id))
                    if tenant and tenant.email:
                        state_labels = {
                            MaintenanceState.assigned:    "assigned to a technician",
                            MaintenanceState.in_progress: "now in progress",
                            MaintenanceState.resolved:    "marked as resolved",
                            MaintenanceState.closed:      "closed",
                        }
                        label = state_labels.get(new_state, new_state)
                        tenant_name = f"{tenant.first_name or ''} {tenant.last_name or ''}".strip() or tenant.email
                        tn = Notification(
                            organisation_id=m.organisation_id,
                            channel="email",
                            trigger="maintenance_status_update",
                            state=NotificationState.queued,
                            recipient_name=tenant_name,
                            recipient_email=tenant.email,
                            subject=f"Maintenance Update: {m.title}",
                            body=(
                                f"Dear {tenant_name},\n\n"
                                f"Your maintenance request '{m.title}' (ref: {m.reference}) has been {label}.\n\n"
                                f"{'Resolution notes: ' + m.notes if m.notes and new_state == MaintenanceState.resolved else ''}"
                                f"\n\nIf you have any questions, please contact your property manager."
                            ),
                            queued_at=now,
                        )
                        db.add(tn)
                        await db.flush()
                        _pending_t.append(str(tn.id))
        _transition_notif_ids = _pending_t
    except Exception:
        log.warning("maintenance.transition.notify.failed", extra={"issue_id": str(m.id)}, exc_info=True)

    if _transition_notif_ids:
        from app.worker.tasks.notifications import deliver_notification
        for _nid in _transition_notif_ids:
            deliver_notification.delay(_nid)

    pname, uname = await _maint_names(m, db)
    return _maint_out(m, property_name=pname, unit_name=uname)
