"""
Utility billing endpoints (lease-scoped).

POST /leases/{lease_id}/utilities          — record reading + auto-bill
GET  /leases/{lease_id}/utilities          — paginated reading history
POST /leases/{lease_id}/utilities/{id}/bill — convert unbilled reading to payment
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_org_id, require_org_access
from app.core.database import get_db
from app.schemas.utility import UtilityReadingCreate, UtilityReadingOut
from app.services import utility_service

router = APIRouter(prefix="/leases/{lease_id}", tags=["utilities"])

_write = Depends(require_org_access(allow_tenant_own=False))


@router.post("/utilities", response_model=UtilityReadingOut, status_code=201)
async def record_utility_reading(
    lease_id: uuid.UUID,
    body: UtilityReadingCreate,
    current_user=_write,
    db: AsyncSession = Depends(get_db),
):
    """Record a utility meter reading or fixed charge and optionally create a payment."""
    return await utility_service.record_reading(
        lease_id=lease_id,
        body=body,
        org_id=get_org_id(current_user),
        created_by_id=current_user.id,
        db=db,
    )


@router.get("/utilities", response_model=dict)
async def list_utility_readings(
    lease_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user=_write,
    db: AsyncSession = Depends(get_db),
):
    """Return paginated utility reading history for a lease."""
    return await utility_service.list_readings(
        lease_id=lease_id,
        org_id=get_org_id(current_user),
        db=db,
        page=page,
        page_size=page_size,
    )


@router.post("/utilities/{reading_id}/bill", response_model=UtilityReadingOut)
async def bill_utility_reading(
    lease_id: uuid.UUID,
    reading_id: uuid.UUID,
    current_user=_write,
    db: AsyncSession = Depends(get_db),
):
    """Convert a previously unbilled utility reading into a payment."""
    return await utility_service.bill_reading(
        reading_id=reading_id,
        org_id=get_org_id(current_user),
        db=db,
    )
