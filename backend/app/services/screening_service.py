"""Tenant screening service."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.screening import DEFAULT_CHECKLIST, TenantScreening
from app.schemas.screening import ScreeningCreate, ScreeningDecide, ScreeningUpdate


async def create_screening(
    org_id: uuid.UUID,
    body: ScreeningCreate,
    created_by_id: uuid.UUID | None,
    db: AsyncSession,
) -> TenantScreening:
    screening = TenantScreening(
        organisation_id=org_id,
        unit_id=body.unit_id,
        tenant_id=body.tenant_id,
        applicant_name=body.applicant_name,
        applicant_phone=body.applicant_phone,
        applicant_email=str(body.applicant_email) if body.applicant_email else None,
        status="pending",
        checklist=[dict(item) for item in DEFAULT_CHECKLIST],
        notes=body.notes,
        created_by_id=created_by_id,
    )
    db.add(screening)
    await db.flush()
    await db.refresh(screening)
    return screening


async def list_screenings(
    org_id: uuid.UUID,
    db: AsyncSession,
    unit_id: uuid.UUID | None = None,
    status: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    q = select(TenantScreening).where(TenantScreening.organisation_id == org_id)
    if unit_id:
        q = q.where(TenantScreening.unit_id == unit_id)
    if status:
        q = q.where(TenantScreening.status == status)
    q = q.order_by(TenantScreening.created_at.desc())

    total_result = await db.execute(q)
    all_rows = total_result.scalars().all()
    total = len(all_rows)
    start = (page - 1) * page_size
    items = all_rows[start : start + page_size]
    return {"data": items, "total": total, "page": page, "page_size": page_size}


async def get_screening(
    screening_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> TenantScreening | None:
    result = await db.execute(
        select(TenantScreening).where(
            TenantScreening.id == screening_id,
            TenantScreening.organisation_id == org_id,
        )
    )
    return result.scalar_one_or_none()


async def update_screening(
    screening: TenantScreening,
    body: ScreeningUpdate,
    db: AsyncSession,
) -> TenantScreening:
    if body.applicant_name is not None:
        screening.applicant_name = body.applicant_name.strip()
    if body.applicant_phone is not None:
        screening.applicant_phone = body.applicant_phone
    if body.applicant_email is not None:
        screening.applicant_email = str(body.applicant_email)
    if body.notes is not None:
        screening.notes = body.notes

    if body.checklist is not None:
        # Merge updates into existing checklist items, preserving order and labels
        updated = {item.key: item for item in body.checklist}
        new_list = []
        for item in (screening.checklist or []):
            if item["key"] in updated:
                u = updated[item["key"]]
                new_list.append({
                    "key": item["key"],
                    "label": item["label"],
                    "checked": u.checked,
                    "notes": u.notes,
                })
            else:
                new_list.append(item)
        screening.checklist = new_list

    await db.flush()
    await db.refresh(screening)
    return screening


async def decide_screening(
    screening: TenantScreening,
    body: ScreeningDecide,
    decided_by_id: uuid.UUID | None,
    db: AsyncSession,
) -> TenantScreening:
    screening.status = body.decision
    screening.decision_notes = body.notes
    screening.decided_by_id = decided_by_id
    screening.decided_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(screening)
    return screening
