"""
Rent Increase REST API

  POST   /leases/{lease_id}/rent-increases               issue notice   [manager/owner]
  GET    /leases/{lease_id}/rent-increases               list notices   [manager/owner]
  GET    /leases/{lease_id}/rent-increases/{id}          get notice     [manager/owner]
  PATCH  /leases/{lease_id}/rent-increases/{id}/acknowledge             [manager/owner]
  PATCH  /leases/{lease_id}/rent-increases/{id}/withdraw                [manager/owner]
  GET    /leases/{lease_id}/rent-increases/{id}/notice.pdf              [manager/owner]
"""

import uuid

from fastapi import APIRouter, Depends, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_org_id, require_org_access
from app.core.database import get_db
from app.features.rent_increase import service as svc
from app.features.rent_increase.schema import (
    RentIncreaseCreate,
    RentIncreaseListOut,
    RentIncreaseOut,
    RentIncreaseWithdraw,
)

router = APIRouter(
    prefix="/leases/{lease_id}/rent-increases",
    tags=["rent-increases"],
)

_write = Depends(require_org_access(allow_tenant_own=False))


@router.post("", response_model=RentIncreaseOut, status_code=status.HTTP_201_CREATED)
async def issue_rent_increase(
    lease_id: uuid.UUID,
    body: RentIncreaseCreate,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    return await svc.create_increase(lease_id, org_id, body, current_user.sub, db)


@router.get("", response_model=RentIncreaseListOut)
async def list_rent_increases(
    lease_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    items = await svc.list_increases(lease_id, org_id, db)
    return RentIncreaseListOut(data=items, total=len(items))


@router.get("/{increase_id}", response_model=RentIncreaseOut)
async def get_rent_increase(
    lease_id: uuid.UUID,
    increase_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    return await svc.get_increase(increase_id, org_id, db)


@router.patch("/{increase_id}/acknowledge", response_model=RentIncreaseOut)
async def acknowledge_rent_increase(
    lease_id: uuid.UUID,
    increase_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    return await svc.acknowledge_increase(increase_id, org_id, db)


@router.patch("/{increase_id}/withdraw", response_model=RentIncreaseOut)
async def withdraw_rent_increase(
    lease_id: uuid.UUID,
    increase_id: uuid.UUID,
    body: RentIncreaseWithdraw,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    return await svc.withdraw_increase(increase_id, org_id, body, db)


@router.get("/{increase_id}/notice.pdf")
async def get_notice_pdf(
    lease_id: uuid.UUID,
    increase_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    import os

    org_id = get_org_id(current_user)
    ri = await svc.get_increase(increase_id, org_id, db)

    pdf_path = os.path.join(
        os.getcwd(), "uploads", "documents", "rent_increases", str(increase_id), "notice.pdf"
    )
    if not os.path.exists(pdf_path):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Notice PDF not yet generated")

    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=f"rent_increase_notice_{str(increase_id)[:8]}.pdf",
    )
