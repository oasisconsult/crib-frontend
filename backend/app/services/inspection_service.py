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

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inspection import (
    Inspection,
    InspectionState,
    MaintenanceIssue,
    MaintenanceState,
    INSPECTION_TRANSITIONS,
    MAINTENANCE_TRANSITIONS,
)
from app.models.property import Property, Unit
from app.schemas.inspection import (
    InspectionCreate,
    InspectionOut,
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
    inspection_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession
) -> Inspection:
    result = await db.execute(
        select(Inspection).where(
            Inspection.id == inspection_id,
            Inspection.organisation_id == org_id,
        )
    )
    i = result.scalar_one_or_none()
    if not i:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")
    return i


async def _get_maintenance(
    issue_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession
) -> MaintenanceIssue:
    result = await db.execute(
        select(MaintenanceIssue).where(
            MaintenanceIssue.id == issue_id,
            MaintenanceIssue.organisation_id == org_id,
        )
    )
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
    org_id: uuid.UUID,
    db: AsyncSession,
    property_id: str | None = None,
    state: str | None = None,
    type_filter: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    q = select(Inspection).where(
        Inspection.organisation_id == org_id,
    )
    if property_id:
        q = q.where(Inspection.property_id == uuid.UUID(property_id))
    if state:
        q = q.where(Inspection.state == state)
    if type_filter:
        q = q.where(Inspection.type == type_filter)

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
    inspection_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession
) -> InspectionOut:
    return _insp_out(await _get_inspection(inspection_id, org_id, db))


async def create_inspection(
    body: InspectionCreate, org_id: uuid.UUID, db: AsyncSession
) -> InspectionOut:
    inspection = Inspection(
        organisation_id=org_id,
        property_id=uuid.UUID(body.property_id),
        unit_id=uuid.UUID(body.unit_id) if body.unit_id else None,
        lease_id=uuid.UUID(body.lease_id) if body.lease_id else None,
        tenant_id=uuid.UUID(body.tenant_id) if body.tenant_id else None,
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
    )
    db.add(inspection)
    await db.flush()
    await db.refresh(inspection)
    return _insp_out(inspection)


async def update_inspection(
    inspection_id: uuid.UUID,
    body: InspectionUpdate,
    org_id: uuid.UUID,
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
    org_id: uuid.UUID,
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
    org_id: uuid.UUID,
    db: AsyncSession,
) -> InspectionOut:
    i = await _get_inspection(inspection_id, org_id, db)
    existing = list(i.photo_urls or [])
    existing.extend(urls)
    i.photo_urls = existing
    await db.flush()
    await db.refresh(i)
    return _insp_out(i)


# ── Maintenance CRUD ───────────────────────────────────────────────────────────

async def list_maintenance(
    org_id: uuid.UUID,
    db: AsyncSession,
    property_id: str | None = None,
    state: str | None = None,
    priority: str | None = None,
    reported_by: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    q = select(MaintenanceIssue).where(
        MaintenanceIssue.organisation_id == org_id,
    )
    if property_id:
        q = q.where(MaintenanceIssue.property_id == uuid.UUID(property_id))
    if state:
        q = q.where(MaintenanceIssue.state == state)
    if priority:
        q = q.where(MaintenanceIssue.priority == priority)
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
    issue_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession
) -> MaintenanceOut:
    m = await _get_maintenance(issue_id, org_id, db)
    pname, uname = await _maint_names(m, db)
    return _maint_out(m, property_name=pname, unit_name=uname)


async def create_maintenance_issue(
    body: MaintenanceCreate, org_id: uuid.UUID, db: AsyncSession
) -> MaintenanceOut:
    now = datetime.now(timezone.utc)
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
    )
    db.add(issue)
    await db.flush()
    await db.refresh(issue)
    pname, uname = await _maint_names(issue, db)
    return _maint_out(issue, property_name=pname, unit_name=uname)


async def update_maintenance_issue(
    issue_id: uuid.UUID,
    body: MaintenanceUpdate,
    org_id: uuid.UUID,
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
    org_id: uuid.UUID,
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
    pname, uname = await _maint_names(m, db)
    return _maint_out(m, property_name=pname, unit_name=uname)
