"""Business logic for the Messages domain."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.models.message import Message
from app.schemas.message import MessageCreate, MessageOut


def _msg_out(m: Message) -> MessageOut:
    def _s(v) -> str | None:
        if v is None:
            return None
        return v.isoformat() if hasattr(v, "isoformat") else str(v)

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


async def list_messages(
    lease_id: uuid.UUID,
    org_id: uuid.UUID,
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
        sender_id=current_user.sub,
        sender_name=current_user.profile.display_name or current_user.sub,
        sender_role=current_user.roles[0] if current_user.roles else "unknown",
        content=body.content,
    )
    db.add(msg)
    await db.flush()
    await db.refresh(msg)
    return _msg_out(msg)


async def mark_read(
    lease_id: uuid.UUID,
    message_id: uuid.UUID,
    org_id: uuid.UUID,
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
