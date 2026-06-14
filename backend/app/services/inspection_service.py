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
) -> dict:
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
    body: InspectionCreate, org_id: uuid.UUID, db: AsyncSession
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
        checklist=body.checklist or [],
        photo_urls=[],
        video_urls=[],
        maintenance_issue_ids=[],
        reference=ref,
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


def _b64_from_url(url: str) -> str | None:
    """Read a local upload URL and return base64-encoded bytes."""
    try:
        # URL format: /api/v1/upload/local/<path>
        rel = url.split("/upload/local/", 1)[-1]
        abs_path = os.path.join(os.getcwd(), "uploads", rel)
        if not os.path.isfile(abs_path):
            return None
        with open(abs_path, "rb") as f:
            return base64.b64encode(f.read()).decode()
    except Exception:
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

        def _fmt_sig(dt) -> str | None:
            if dt is None:
                return None
            return dt.strftime("%d %B %Y at %H:%M UTC") if hasattr(dt, "strftime") else str(dt)

        # Build checklist with max 3 photos per item embedded as base64
        checklist_ctx = []
        for item in (i.checklist or []):
            item_photos = item.get("photo_urls") or item.get("photoUrls") or []
            photo_data = [d for d in (_b64_from_url(u) for u in item_photos[:3]) if d]
            checklist_ctx.append({
                "area":        item.get("area", ""),
                "description": item.get("description", ""),
                "condition":   item.get("condition"),
                "notes":       item.get("notes", ""),
                "photo_data":  photo_data,
            })

        # General photos (all), up to 9 shown in PDF
        general_photos = [d for d in (_b64_from_url(u) for u in (i.photo_urls or [])[:9]) if d]

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
        html_str = jinja.get_template("report.html").render(**ctx)

        pdf_bytes = WPHtml(string=html_str).write_pdf()

        # Upload to configured storage (MinIO in prod, local filesystem in dev)
        from app.core.database import get_db as _get_db
        from app.core.config import get_settings as _get_settings
        from app.core.storage import get_storage_provider
        from app.services import settings_service as _ss
        _config = await _ss.get_storage_config(db)
        _provider = get_storage_provider(_config, local_base_url=_get_settings().storage_local_base_url)
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
    org = await db.scalar(select(Organisation).where(Organisation.id == i.organisation_id))
    from app.models.property import Property
    prop = await db.scalar(select(Property).where(Property.id == i.property_id)) if i.property_id else None

    # Build sign URL — the tenant clicks this to review and sign
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    sign_url = f"{frontend_url}/inspect/sign/{i.sign_token}"
    expires_str = i.sign_token_expires_at.strftime("%d %B %Y")

    subject = f"Inspection Report Ready — Please Review and Sign"
    body = (
        f"Dear {tenant_name},\n\n"
        f"Your move-in inspection report for "
        f"{prop.name if prop else 'your property'} "
        f"{'(Unit ' + (await db.scalar(select(Property).where(Property.id == i.property_id))).name + ')' if False else ''}"
        f"is ready for your review and signature.\n\n"
        f"The landlord/property manager has already reviewed and signed the report. "
        f"Please click the link below to view the full report and add your signature:\n\n"
        f"    {sign_url}\n\n"
        f"This link expires on {expires_str}. After that date you will need to contact "
        f"your property manager to request a new link.\n\n"
        f"Once you sign, both parties will have a fully executed copy of the move-in inspection report.\n\n"
        f"Best regards,\n{org.name if org else 'Crib Property Management'}"
    )

    try:
        from app.models.notification import Notification, NotificationState
        notif = Notification(
            organisation_id=i.organisation_id,
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

        from app.worker.tasks.notifications import deliver_notification
        deliver_notification.delay(str(notif.id))
    except Exception:
        log.warning("inspection.sign_email.failed", extra={"inspection_id": str(i.id)}, exc_info=True)

    await db.refresh(i)
    return _insp_out(i)


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

    return InspectionPublicOut(
        id=str(i.id),
        type=i.type if isinstance(i.type, str) else i.type.value,
        state=i.state if isinstance(i.state, str) else i.state.value,
        scheduled_date=str(i.scheduled_date),
        property_name=prop.name if prop else None,
        unit_name=unit.name if unit else None,
        overall_condition=i.overall_condition,
        summary=i.summary,
        checklist_count=len(i.checklist or []),
        photo_count=len(i.photo_urls or []),
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

    # Notify the org/landlord that the tenant has signed
    try:
        if i.organisation_id:
            from app.models.notification import Notification, NotificationState
            from app.models.organisation import Organisation
            from app.models.property import Property
            org  = await db.scalar(select(Organisation).where(Organisation.id == i.organisation_id))
            prop = await db.scalar(select(Property).where(Property.id == i.property_id)) if i.property_id else None
            if org and org.email:
                notif = Notification(
                    organisation_id=i.organisation_id,
                    channel="email",
                    trigger="inspection_tenant_signed",
                    state=NotificationState.queued,
                    recipient_name=org.name,
                    recipient_email=org.email,
                    subject="Tenant Signed the Inspection Report",
                    body=(
                        f"The tenant has signed the move-in inspection report for "
                        f"{prop.name if prop else 'a property'}.\n\n"
                        f"Both signatures are now on file. "
                        f"{'The sealed PDF is available at: ' + i.report_pdf_url if i.report_pdf_url else ''}"
                    ),
                    queued_at=datetime.now(timezone.utc),
                )
                db.add(notif)
                await db.flush()
                from app.worker.tasks.notifications import deliver_notification
                deliver_notification.delay(str(notif.id))
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
        checklist_count=len(i.checklist or []),
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
    body: MaintenanceCreate, org_id: uuid.UUID, db: AsyncSession
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

    # Notify org manager of the new maintenance request (non-fatal)
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
            from app.worker.tasks.notifications import deliver_notification
            deliver_notification.delay(str(notif.id))
    except Exception:
        log.warning("maintenance.create.notify_manager.failed", extra={"issue_id": str(issue.id)}, exc_info=True)

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
        if body.assigned_to:
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

    # Notify tenant of status change when lease is linked (non-fatal)
    if m.lease_id and new_state not in (MaintenanceState.cancelled,):
        try:
            from app.models.lease import Lease
            from app.models.notification import Notification, NotificationState
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
                    notif = Notification(
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
                        queued_at=datetime.now(timezone.utc),
                    )
                    db.add(notif)
                    await db.flush()
                    from app.worker.tasks.notifications import deliver_notification
                    deliver_notification.delay(str(notif.id))
        except Exception:
            log.warning("maintenance.transition.notify_tenant.failed", extra={"issue_id": str(m.id)}, exc_info=True)

    pname, uname = await _maint_names(m, db)
    return _maint_out(m, property_name=pname, unit_name=uname)
