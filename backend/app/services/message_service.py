"""Business logic for the Messages domain."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.models.message import Message
from app.schemas.message import MessageCreate, MessageOut, MessageWithLeaseOut


def _s(v) -> str | None:
    if v is None:
        return None
    return v.isoformat() if hasattr(v, "isoformat") else str(v)


def _msg_out(m: Message) -> MessageOut:
    return MessageOut(
        id=str(m.id),
        organisation_id=str(m.organisation_id),
        lease_id=str(m.lease_id) if m.lease_id else None,
        sender_id=m.sender_id,
        sender_name=m.sender_name,
        sender_role=m.sender_role,
        content=m.content,
        read_at=_s(m.read_at),
        created_at=_s(m.created_at),
        updated_at=_s(m.updated_at),
    )


def _msg_with_lease_out(m: Message) -> MessageWithLeaseOut:
    return MessageWithLeaseOut(
        id=str(m.id),
        organisation_id=str(m.organisation_id),
        lease_id=str(m.lease_id) if m.lease_id else None,
        sender_id=m.sender_id,
        sender_name=m.sender_name,
        sender_role=m.sender_role,
        content=m.content,
        read_at=_s(m.read_at),
        created_at=_s(m.created_at),
        updated_at=_s(m.updated_at),
    )


async def list_messages(
    lease_id: uuid.UUID,
    org_id: uuid.UUID | None,
    db: AsyncSession,
    page: int = 1,
    page_size: int = 50,
) -> dict:
    q = select(Message).where(
        Message.organisation_id == org_id,
        Message.lease_id == lease_id,
    )
    total = await db.scalar(select(func.count()).select_from(q.subquery())) or 0
    q = q.order_by(Message.created_at.asc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    messages = result.scalars().all()
    return {
        "data": [_msg_out(m) for m in messages],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "hasNext": (page * page_size) < total,
    }


async def create_message(
    lease_id: uuid.UUID,
    body: MessageCreate,
    current_user: CurrentUser,
    db: AsyncSession,
) -> MessageOut:
    if current_user.org_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No organisation context")

    msg = Message(
        organisation_id=current_user.org_id,
        lease_id=lease_id,
        # Use profile UUID so frontend user.id matches msg.senderId directly
        sender_id=str(current_user.profile.id),
        sender_name=current_user.profile.display_name or current_user.profile.email or current_user.sub,
        # Use primary role (highest-priority, already resolved by _upsert_profile)
        sender_role=current_user.role,
        content=body.content,
    )
    db.add(msg)
    await db.flush()
    await db.refresh(msg)
    return _msg_out(msg)


async def unread_count(
    org_id: uuid.UUID | None,
    profile_id: str,
    db: AsyncSession,
) -> int:
    """Count unread messages in the org not sent by the current user."""
    q = select(func.count()).select_from(Message).where(
        Message.organisation_id == org_id,
        Message.read_at.is_(None),
        Message.sender_id != profile_id,
    )
    return await db.scalar(q) or 0


async def list_messages_flat(
    org_id: uuid.UUID | None,
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    unread_only: bool = False,
    profile_id: str | None = None,
) -> dict:
    """List all messages across all leases in the org, newest first.
    Managers see all; pass profile_id to filter to unread-by-user only.
    """
    q = select(Message).where(Message.organisation_id == org_id)
    if unread_only and profile_id:
        q = q.where(Message.read_at.is_(None), Message.sender_id != profile_id)
    total = await db.scalar(select(func.count()).select_from(q.subquery())) or 0
    q = q.order_by(Message.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    messages = result.scalars().all()
    return {
        "data": [_msg_with_lease_out(m) for m in messages],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "hasNext": (page * page_size) < total,
    }


async def mark_read(
    lease_id: uuid.UUID,
    message_id: uuid.UUID,
    org_id: uuid.UUID | None,
    db: AsyncSession,
) -> MessageOut:
    result = await db.execute(
        select(Message).where(
            Message.id == message_id,
            Message.lease_id == lease_id,
            Message.organisation_id == org_id,
        )
    )
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    if msg.read_at is None:
        msg.read_at = datetime.now(timezone.utc)
        await db.flush()
        await db.refresh(msg)
    return _msg_out(msg)
