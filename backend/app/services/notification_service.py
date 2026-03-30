"""
Business logic for the notifications domain.

Public surface:
  Templates : list, get, create, update, delete, preview
  Notifications: list, send (queue + dispatch), get_stats, mark_read
  Dispatch : dispatch_notification(id) — called by Celery worker
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import (
    Notification,
    NotificationChannel,
    NotificationState,
    NotificationTemplate,
)
from app.schemas.notification import (
    NotificationOut,
    NotificationSend,
    NotificationStatsOut,
    TemplateCreate,
    TemplateOut,
    TemplateUpdate,
)


# ── Serialisers ────────────────────────────────────────────────────────────────

def _tmpl_out(t: NotificationTemplate) -> TemplateOut:
    return TemplateOut(
        id=str(t.id),
        organisation_id=str(t.organisation_id),
        name=t.name,
        trigger=t.trigger if isinstance(t.trigger, str) else t.trigger.value,
        channel=t.channel if isinstance(t.channel, str) else t.channel.value,
        subject=t.subject,
        body=t.body,
        variables=t.variables or [],
        is_active=t.is_active,
        created_at=t.created_at.isoformat(),
        updated_at=t.updated_at.isoformat(),
    )


def _notif_out(n: Notification) -> NotificationOut:
    def _s(v) -> str | None:
        return v.isoformat() if v else None

    return NotificationOut(
        id=str(n.id),
        organisation_id=str(n.organisation_id),
        template_id=str(n.template_id) if n.template_id else None,
        tenant_id=str(n.tenant_id) if n.tenant_id else None,
        channel=n.channel if isinstance(n.channel, str) else n.channel.value,
        trigger=n.trigger if isinstance(n.trigger, str) else n.trigger.value,
        recipient_name=n.recipient_name,
        recipient_email=n.recipient_email,
        recipient_phone=n.recipient_phone,
        subject=n.subject,
        body=n.body,
        state=n.state if isinstance(n.state, str) else n.state.value,
        queued_at=n.queued_at.isoformat(),
        sent_at=_s(n.sent_at),
        delivered_at=_s(n.delivered_at),
        read_at=_s(n.read_at),
        failed_at=_s(n.failed_at),
        failure_reason=n.failure_reason,
        retry_count=n.retry_count,
        external_message_id=n.external_message_id,
        property_id=str(n.property_id) if n.property_id else None,
        lease_id=str(n.lease_id) if n.lease_id else None,
        payment_id=str(n.payment_id) if n.payment_id else None,
        created_at=n.created_at.isoformat(),
    )


# ── Template rendering ─────────────────────────────────────────────────────────

def render_template(body: str, variables: dict[str, str]) -> str:
    """Replace {{variable}} placeholders with provided values."""
    def replace(match: re.Match) -> str:
        key = match.group(1)
        return variables.get(key, f"[{key}]")
    return re.sub(r"\{\{(\w+)\}\}", replace, body)


# ── Internal helpers ───────────────────────────────────────────────────────────

async def _get_template(
    template_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession
) -> NotificationTemplate:
    result = await db.execute(
        select(NotificationTemplate).where(
            NotificationTemplate.id == template_id,
            NotificationTemplate.organisation_id == org_id,
            NotificationTemplate.deleted_at.is_(None),
        )
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return t


async def _get_notification(
    notification_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession
) -> Notification:
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.organisation_id == org_id,
        )
    )
    n = result.scalar_one_or_none()
    if not n:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    return n


# ── Templates ──────────────────────────────────────────────────────────────────

async def list_templates(org_id: uuid.UUID, db: AsyncSession) -> list[TemplateOut]:
    result = await db.execute(
        select(NotificationTemplate).where(
            NotificationTemplate.organisation_id == org_id,
            NotificationTemplate.deleted_at.is_(None),
        ).order_by(NotificationTemplate.created_at.desc())
    )
    return [_tmpl_out(t) for t in result.scalars().all()]


async def get_template(
    template_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession
) -> TemplateOut:
    return _tmpl_out(await _get_template(template_id, org_id, db))


async def create_template(
    body: TemplateCreate, org_id: uuid.UUID, db: AsyncSession
) -> TemplateOut:
    tmpl = NotificationTemplate(
        organisation_id=org_id,
        name=body.name,
        trigger=body.trigger,
        channel=body.channel,
        subject=body.subject,
        body=body.body,
        variables=body.variables or [],
        is_active=body.is_active,
    )
    db.add(tmpl)
    await db.flush()
    await db.refresh(tmpl)
    return _tmpl_out(tmpl)


async def update_template(
    template_id: uuid.UUID,
    body: TemplateUpdate,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> TemplateOut:
    tmpl = await _get_template(template_id, org_id, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(tmpl, field, value)
    await db.flush()
    await db.refresh(tmpl)
    return _tmpl_out(tmpl)


async def delete_template(
    template_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession
) -> None:
    tmpl = await _get_template(template_id, org_id, db)
    tmpl.deleted_at = datetime.now(timezone.utc)
    await db.flush()


async def preview_template(
    template_id: uuid.UUID,
    variables: dict[str, str],
    org_id: uuid.UUID,
    db: AsyncSession,
) -> dict:
    tmpl = await _get_template(template_id, org_id, db)
    rendered_body = render_template(tmpl.body, variables)
    result: dict = {"body": rendered_body}
    if tmpl.subject:
        result["subject"] = render_template(tmpl.subject, variables)
    return result


# ── Notifications ──────────────────────────────────────────────────────────────

async def list_notifications(
    org_id: uuid.UUID,
    db: AsyncSession,
    channel: str | None = None,
    state: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    q = select(Notification).where(Notification.organisation_id == org_id)
    if channel:
        q = q.where(Notification.channel == channel)
    if state:
        q = q.where(Notification.state == state)

    total = await db.scalar(select(func.count()).select_from(q.subquery())) or 0
    q = q.order_by(Notification.queued_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)

    return {
        "data": [_notif_out(n) for n in result.scalars().all()],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "hasNext": (page * page_size) < total,
    }


async def send_notification(
    body: NotificationSend,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> NotificationOut:
    """Queue a notification and dispatch it immediately via Celery."""
    now = datetime.now(timezone.utc)
    notif = Notification(
        organisation_id=org_id,
        template_id=uuid.UUID(body.template_id) if body.template_id else None,
        tenant_id=uuid.UUID(body.tenant_id) if body.tenant_id else None,
        channel=body.channel,
        trigger=body.trigger,
        recipient_name=body.recipient_name,
        recipient_email=body.recipient_email,
        recipient_phone=body.recipient_phone,
        subject=body.subject,
        body=body.body,
        state=NotificationState.queued,
        queued_at=now,
        retry_count=0,
        property_id=uuid.UUID(body.property_id) if body.property_id else None,
        lease_id=uuid.UUID(body.lease_id) if body.lease_id else None,
        payment_id=uuid.UUID(body.payment_id) if body.payment_id else None,
        created_at=now,
    )
    db.add(notif)
    await db.flush()
    await db.refresh(notif)

    # Dispatch asynchronously via Celery
    from app.worker.tasks.notifications import deliver_notification
    deliver_notification.delay(str(notif.id))

    return _notif_out(notif)


async def mark_read(
    notification_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession
) -> NotificationOut:
    n = await _get_notification(notification_id, org_id, db)
    if n.state == NotificationState.delivered:
        n.state = NotificationState.read
        n.read_at = datetime.now(timezone.utc)
        await db.flush()
        await db.refresh(n)
    return _notif_out(n)


async def get_stats(org_id: uuid.UUID, db: AsyncSession) -> NotificationStatsOut:
    result = await db.execute(
        select(
            func.count(Notification.id).label("total"),
            func.count(Notification.id).filter(
                Notification.state.in_([NotificationState.sent, NotificationState.delivered, NotificationState.read])
            ).label("sent"),
            func.count(Notification.id).filter(
                Notification.state.in_([NotificationState.delivered, NotificationState.read])
            ).label("delivered"),
            func.count(Notification.id).filter(
                Notification.state == NotificationState.read
            ).label("read_count"),
            func.count(Notification.id).filter(
                Notification.state == NotificationState.failed
            ).label("failed"),
        ).where(Notification.organisation_id == org_id)
    )
    row = result.one()
    total = int(row.total or 0)
    sent = int(row.sent or 0)
    delivered = int(row.delivered or 0)
    read_count = int(row.read_count or 0)
    failed = int(row.failed or 0)

    # Per-channel counts
    channel_result = await db.execute(
        select(Notification.channel, func.count(Notification.id).label("cnt"))
        .where(Notification.organisation_id == org_id)
        .group_by(Notification.channel)
    )
    by_channel = {row.channel: int(row.cnt) for row in channel_result}

    return NotificationStatsOut(
        total=total,
        sent=sent,
        delivered=delivered,
        read=read_count,
        failed=failed,
        delivery_rate=round(delivered / sent * 100, 1) if sent > 0 else 0.0,
        read_rate=round(read_count / delivered * 100, 1) if delivered > 0 else 0.0,
        by_channel=by_channel,
    )


# ── Dispatch (called by Celery) ────────────────────────────────────────────────

async def dispatch_notification(notification_id: uuid.UUID, db: AsyncSession) -> dict:
    """
    Load a queued notification and send it via the appropriate channel adapter.
    Updates state to sent/delivered/failed.
    Called by the Celery worker.
    """
    result = await db.execute(
        select(Notification).where(Notification.id == notification_id)
    )
    notif = result.scalar_one_or_none()
    if not notif:
        return {"error": "not_found", "id": str(notification_id)}

    if notif.state not in (NotificationState.queued, NotificationState.failed):
        return {"skipped": True, "state": notif.state}

    from app.integrations.notifications import get_provider
    provider = get_provider(notif.channel)

    delivery = await provider.send(
        recipient_name=notif.recipient_name,
        recipient_email=notif.recipient_email,
        recipient_phone=notif.recipient_phone,
        subject=notif.subject,
        body=notif.body,
    )

    now = datetime.now(timezone.utc)
    if delivery.success:
        notif.external_message_id = delivery.external_message_id
        notif.sent_at = now
        # in_app → delivered immediately; others stay at sent until webhook
        if notif.channel == NotificationChannel.in_app:
            notif.state = NotificationState.delivered
            notif.delivered_at = now
        else:
            notif.state = NotificationState.sent
    else:
        notif.state = NotificationState.failed
        notif.failed_at = now
        notif.failure_reason = delivery.failure_reason
        notif.retry_count = (notif.retry_count or 0) + 1

    await db.flush()
    return {"success": delivery.success, "channel": notif.channel, "id": str(notif.id)}
