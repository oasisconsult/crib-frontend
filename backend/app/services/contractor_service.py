"""Contractor directory service.

Manages the per-org directory of trusted contractors/tradespeople used
in the maintenance workflow. All queries are org-scoped to prevent
cross-tenant data leakage.
"""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.contractor import Contractor
from app.schemas.inspection import ContractorCreate, ContractorOut, ContractorUpdate
from app.utils.db_filters import org_scope


# ── Output serialiser ──────────────────────────────────────────────────────────

def _contractor_out(c: Contractor) -> ContractorOut:
    return ContractorOut(
        id=str(c.id),
        organisation_id=str(c.organisation_id),
        name=c.name,
        phone=c.phone,
        email=c.email,
        specialty=c.specialty,
        notes=c.notes,
        is_active=c.is_active,
        is_inspector=c.is_inspector,
        created_at=c.created_at.isoformat(),
        updated_at=c.updated_at.isoformat(),
    )


# ── Internal helper ────────────────────────────────────────────────────────────

async def _get_contractor(
    contractor_id: uuid.UUID,
    org_id: uuid.UUID | None,
    db: AsyncSession,
) -> Contractor:
    filters = [Contractor.id == contractor_id]
    if org_id is not None:
        filters.append(Contractor.organisation_id == org_id)
    c = await db.scalar(select(Contractor).where(*filters))
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contractor not found")
    return c


# ── Public API ─────────────────────────────────────────────────────────────────

async def list_contractors(
    org_id: uuid.UUID | None,
    db: AsyncSession,
    specialty: str | None = None,
    is_active: bool | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> dict:
    q = org_scope(select(Contractor), Contractor.organisation_id, org_id)
    if specialty:
        q = q.where(Contractor.specialty == specialty)
    if is_active is not None:
        q = q.where(Contractor.is_active == is_active)
    if search:
        term = f"%{search}%"
        q = q.where(Contractor.name.ilike(term))

    total = await db.scalar(select(func.count()).select_from(q.subquery())) or 0
    q = q.order_by(Contractor.name.asc()).offset((page - 1) * page_size).limit(page_size)
    contractors = (await db.execute(q)).scalars().all()

    return {
        "data": [_contractor_out(c) for c in contractors],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "hasNext": (page * page_size) < total,
    }


async def create_contractor(
    body: ContractorCreate,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> ContractorOut:
    c = Contractor(
        organisation_id=org_id,
        name=body.name.strip(),
        phone=body.phone,
        email=body.email,
        specialty=body.specialty,
        notes=body.notes,
        is_active=True,
        is_inspector=body.is_inspector,
    )
    db.add(c)
    await db.flush()
    await db.refresh(c)
    return _contractor_out(c)


async def get_contractor(
    contractor_id: uuid.UUID,
    org_id: uuid.UUID | None,
    db: AsyncSession,
) -> ContractorOut:
    c = await _get_contractor(contractor_id, org_id, db)
    return _contractor_out(c)


async def update_contractor(
    contractor_id: uuid.UUID,
    body: ContractorUpdate,
    org_id: uuid.UUID | None,
    db: AsyncSession,
) -> ContractorOut:
    c = await _get_contractor(contractor_id, org_id, db)
    updates = body.model_dump(exclude_none=True)
    if "name" in updates:
        updates["name"] = updates["name"].strip()
    for field, value in updates.items():
        setattr(c, field, value)
    await db.flush()
    await db.refresh(c)
    return _contractor_out(c)


async def deactivate_contractor(
    contractor_id: uuid.UUID,
    org_id: uuid.UUID | None,
    db: AsyncSession,
) -> None:
    c = await _get_contractor(contractor_id, org_id, db)
    c.is_active = False
    await db.flush()
