"""
Tenant screening endpoints.

All endpoints are org-scoped (manager/owner only — tenants cannot see screening data).

  POST   /screenings                    — create a screening
  GET    /screenings                    — list screenings (filter by unit_id, status)
  GET    /screenings/{id}               — get single screening
  PATCH  /screenings/{id}               — update checklist/notes
  POST   /screenings/{id}/decide        — approve or reject
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_org_id, require_org_access
from app.core.database import get_db
from app.schemas.screening import ScreeningCreate, ScreeningDecide, ScreeningOut, ScreeningUpdate
from app.services import screening_service

router = APIRouter(prefix="/screenings", tags=["screenings"])

_write = Depends(require_org_access(allow_tenant_own=False))


@router.post("", response_model=ScreeningOut, status_code=201)
async def create_screening(
    body: ScreeningCreate,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
) -> ScreeningOut:
    org_id = get_org_id(current_user)
    screening = await screening_service.create_screening(
        org_id=org_id,
        body=body,
        created_by_id=current_user.id,
        db=db,
    )
    return ScreeningOut.model_validate(screening)


@router.get("", response_model=dict)
async def list_screenings(
    unit_id: uuid.UUID | None = Query(None),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
) -> dict:
    org_id = get_org_id(current_user)
    result = await screening_service.list_screenings(
        org_id=org_id,
        db=db,
        unit_id=unit_id,
        status=status,
        page=page,
        page_size=page_size,
    )
    return {
        **result,
        "data": [ScreeningOut.model_validate(s) for s in result["data"]],
    }


@router.get("/{screening_id}", response_model=ScreeningOut)
async def get_screening(
    screening_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
) -> ScreeningOut:
    org_id = get_org_id(current_user)
    screening = await screening_service.get_screening(screening_id, org_id, db)
    if not screening:
        raise HTTPException(status_code=404, detail="Screening not found")
    return ScreeningOut.model_validate(screening)


@router.patch("/{screening_id}", response_model=ScreeningOut)
async def update_screening(
    screening_id: uuid.UUID,
    body: ScreeningUpdate,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
) -> ScreeningOut:
    org_id = get_org_id(current_user)
    screening = await screening_service.get_screening(screening_id, org_id, db)
    if not screening:
        raise HTTPException(status_code=404, detail="Screening not found")
    if screening.status != "pending":
        raise HTTPException(status_code=409, detail="Cannot edit a decided screening")
    screening = await screening_service.update_screening(screening, body, db)
    return ScreeningOut.model_validate(screening)


@router.post("/{screening_id}/decide", response_model=ScreeningOut)
async def decide_screening(
    screening_id: uuid.UUID,
    body: ScreeningDecide,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
) -> ScreeningOut:
    org_id = get_org_id(current_user)
    screening = await screening_service.get_screening(screening_id, org_id, db)
    if not screening:
        raise HTTPException(status_code=404, detail="Screening not found")
    if screening.status != "pending":
        raise HTTPException(status_code=409, detail="Screening already decided")
    screening = await screening_service.decide_screening(
        screening=screening,
        body=body,
        decided_by_id=current_user.id,
        db=db,
    )
    return ScreeningOut.model_validate(screening)
