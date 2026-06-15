"""Contractor directory endpoints.

/contractors            GET list, POST create
/contractors/{id}       GET, PUT update, DELETE deactivate
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, get_org_id
from app.core.database import get_db
from app.schemas.inspection import ContractorCreate, ContractorOut, ContractorUpdate
from app.services import contractor_service

router = APIRouter(tags=["contractors"])


@router.get("/contractors", response_model=dict)
async def list_contractors(
    specialty: str | None = Query(None),
    is_active: bool | None = Query(None, alias="isActive"),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200, alias="pageSize"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = None if current_user.has_role("superadmin") else get_org_id(current_user)
    return await contractor_service.list_contractors(
        org_id=org_id,
        db=db,
        specialty=specialty,
        is_active=is_active,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.post("/contractors", response_model=ContractorOut, status_code=status.HTTP_201_CREATED)
async def create_contractor(
    body: ContractorCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from fastapi import HTTPException
    # Superadmin writes to their own platform org (mirrors properties.py pattern).
    # get_org_id() returns None for superadmin (cross-org read bypass) so we
    # fall back to their profile org for mutations.
    if current_user.has_role("superadmin"):
        org_id = current_user.profile.organisation_id
    else:
        org_id = get_org_id(current_user)
    if org_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No organisation assigned to your account.",
        )
    return await contractor_service.create_contractor(body, org_id, db)


@router.get("/contractors/{contractor_id}", response_model=ContractorOut)
async def get_contractor(
    contractor_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = None if current_user.has_role("superadmin") else get_org_id(current_user)
    return await contractor_service.get_contractor(contractor_id, org_id, db)


@router.put("/contractors/{contractor_id}", response_model=ContractorOut)
async def update_contractor(
    contractor_id: uuid.UUID,
    body: ContractorUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = None if current_user.has_role("superadmin") else get_org_id(current_user)
    return await contractor_service.update_contractor(
        contractor_id, body, org_id, db
    )


@router.delete("/contractors/{contractor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_contractor(
    contractor_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = None if current_user.has_role("superadmin") else get_org_id(current_user)
    await contractor_service.deactivate_contractor(
        contractor_id, org_id, db
    )
