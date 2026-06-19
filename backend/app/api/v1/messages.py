"""
Messages REST API.

Lease-nested endpoints:
  GET   /leases/{lease_id}/messages                    — list messages for a lease
  POST  /leases/{lease_id}/messages                    — send a message
  PATCH /leases/{lease_id}/messages/{message_id}/read  — mark as read

Flat (org-level) endpoints:
  GET   /messages                  — list all messages across org (managers)
  GET   /messages/unread-count     — count of unread messages for current user
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_org_id, require_org_access
from app.core.database import get_db
from app.schemas.message import MessageCreate, MessageOut, UnreadCountOut
from app.services import message_service as svc
from app.services.subscription_limits import check_feature_access

router = APIRouter(prefix="/leases", tags=["messages"])
flat_router = APIRouter(prefix="/messages", tags=["messages"])

_access = Depends(require_org_access(allow_tenant_own=True))


@router.get("/{lease_id}/messages", response_model=dict)
async def list_messages(
    lease_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200, alias="pageSize"),
    current_user: CurrentUser = _access,
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_messages(lease_id, get_org_id(current_user), db, page, page_size)


@router.post("/{lease_id}/messages", response_model=MessageOut, status_code=201)
async def send_message(
    lease_id: uuid.UUID,
    body: MessageCreate,
    current_user: CurrentUser = _access,
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    if org_id is not None:
        await check_feature_access(org_id, "tenant_messaging", db)
    return await svc.create_message(lease_id, body, current_user, db)


@router.patch("/{lease_id}/messages/{message_id}/read", response_model=MessageOut)
async def mark_message_read(
    lease_id: uuid.UUID,
    message_id: uuid.UUID,
    current_user: CurrentUser = _access,
    db: AsyncSession = Depends(get_db),
):
    return await svc.mark_read(lease_id, message_id, get_org_id(current_user), db)


# ── Flat (org-level) endpoints ────────────────────────────────────────────────

@flat_router.get("/unread-count", response_model=UnreadCountOut)
async def get_unread_count(
    current_user: CurrentUser = _access,
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    count = await svc.unread_count(org_id, str(current_user.profile.id), db)
    return UnreadCountOut(count=count)


@flat_router.get("", response_model=dict)
async def list_all_messages(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    unread_only: bool = Query(False, alias="unreadOnly"),
    current_user: CurrentUser = _access,
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    return await svc.list_messages_flat(
        org_id, db, page, page_size,
        unread_only=unread_only,
        profile_id=str(current_user.profile.id),
    )
