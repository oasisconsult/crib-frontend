"""
Messages REST API — nested under /leases/{lease_id}.

Endpoints:
  GET   /leases/{lease_id}/messages                    — list messages
  POST  /leases/{lease_id}/messages                    — send a message
  PATCH /leases/{lease_id}/messages/{message_id}/read  — mark as read
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_org_access
from app.core.database import get_db
from app.schemas.message import MessageCreate, MessageOut
from app.services import message_service as svc

router = APIRouter(prefix="/leases", tags=["messages"])

_access = Depends(require_org_access(allow_tenant_own=True))


@router.get("/{lease_id}/messages", response_model=dict)
async def list_messages(
    lease_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200, alias="pageSize"),
    current_user: CurrentUser = _access,
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_messages(lease_id, current_user.org_id, db, page, page_size)


@router.post("/{lease_id}/messages", response_model=MessageOut, status_code=201)
async def send_message(
    lease_id: uuid.UUID,
    body: MessageCreate,
    current_user: CurrentUser = _access,
    db: AsyncSession = Depends(get_db),
):
    return await svc.create_message(lease_id, body, current_user, db)


@router.patch("/{lease_id}/messages/{message_id}/read", response_model=MessageOut)
async def mark_message_read(
    lease_id: uuid.UUID,
    message_id: uuid.UUID,
    current_user: CurrentUser = _access,
    db: AsyncSession = Depends(get_db),
):
    return await svc.mark_read(lease_id, message_id, current_user.org_id, db)
