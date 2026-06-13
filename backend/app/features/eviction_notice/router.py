"""
Eviction Notice REST API

  POST   /leases/{lease_id}/eviction-notices                 issue notice   [manager/owner]
  GET    /leases/{lease_id}/eviction-notices                 list notices   [manager/owner]
  GET    /leases/{lease_id}/eviction-notices/{id}            get notice     [manager/owner]
  PATCH  /leases/{lease_id}/eviction-notices/{id}/serve      mark served    [manager/owner]
  PATCH  /leases/{lease_id}/eviction-notices/{id}/dispute    dispute        [manager/owner]
  PATCH  /leases/{lease_id}/eviction-notices/{id}/withdraw   withdraw       [manager/owner]
  PATCH  /leases/{lease_id}/eviction-notices/{id}/execute    mark executed  [manager/owner]
  GET    /leases/{lease_id}/eviction-notices/{id}/notice.pdf PDF download   [manager/owner]
"""

import uuid

from fastapi import APIRouter, Depends, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_org_id, require_org_access
from app.core.database import get_db
from app.features.eviction_notice import service as svc
from app.features.eviction_notice.schema import (
    EvictionNoticeCreate,
    EvictionNoticeDisputeBody,
    EvictionNoticeListOut,
    EvictionNoticeOut,
    EvictionNoticeWithdrawBody,
)

router = APIRouter(
    prefix="/leases/{lease_id}/eviction-notices",
    tags=["eviction-notices"],
)

_write = Depends(require_org_access(allow_tenant_own=False))


@router.post("", response_model=EvictionNoticeOut, status_code=status.HTTP_201_CREATED)
async def issue_eviction_notice(
    lease_id: uuid.UUID,
    body: EvictionNoticeCreate,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    return await svc.create_notice(lease_id, org_id, body, current_user.sub, db)


@router.get("", response_model=EvictionNoticeListOut)
async def list_eviction_notices(
    lease_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    items = await svc.list_notices(lease_id, org_id, db)
    return EvictionNoticeListOut(data=items, total=len(items))


@router.get("/{notice_id}", response_model=EvictionNoticeOut)
async def get_eviction_notice(
    lease_id: uuid.UUID,
    notice_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    return await svc.get_notice(notice_id, org_id, db)


@router.patch("/{notice_id}/serve", response_model=EvictionNoticeOut)
async def serve_eviction_notice(
    lease_id: uuid.UUID,
    notice_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    return await svc.serve_notice(notice_id, org_id, db)


@router.patch("/{notice_id}/dispute", response_model=EvictionNoticeOut)
async def dispute_eviction_notice(
    lease_id: uuid.UUID,
    notice_id: uuid.UUID,
    body: EvictionNoticeDisputeBody,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    return await svc.dispute_notice(notice_id, org_id, body, db)


@router.patch("/{notice_id}/withdraw", response_model=EvictionNoticeOut)
async def withdraw_eviction_notice(
    lease_id: uuid.UUID,
    notice_id: uuid.UUID,
    body: EvictionNoticeWithdrawBody,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    return await svc.withdraw_notice(notice_id, org_id, body, db)


@router.patch("/{notice_id}/execute", response_model=EvictionNoticeOut)
async def execute_eviction_notice(
    lease_id: uuid.UUID,
    notice_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    return await svc.execute_notice(notice_id, org_id, db)


@router.get("/{notice_id}/notice.pdf")
async def get_eviction_notice_pdf(
    lease_id: uuid.UUID,
    notice_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    import os

    from fastapi import HTTPException

    org_id = get_org_id(current_user)
    await svc.get_notice(notice_id, org_id, db)  # 404 guard

    pdf_path = os.path.join(
        os.getcwd(), "uploads", "documents", "eviction_notices", str(notice_id), "notice.pdf"
    )
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="Notice PDF not yet generated")

    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=f"eviction_notice_{str(notice_id)[:8]}.pdf",
    )
