"""Announcement service — bulk broadcast to active tenants."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.announcement import Announcement
from app.models.tenant import Tenant, TenantStatus
from app.schemas.announcement import AnnouncementCreate, AnnouncementOut
from app.schemas.notification import NotificationSend
from app.services import notification_service


def _out(a: Announcement) -> AnnouncementOut:
    return AnnouncementOut.model_validate(a)


async def create_announcement(
    body: AnnouncementCreate,
    org_id: uuid.UUID,
    created_by_id: uuid.UUID | None,
    db: AsyncSession,
) -> AnnouncementOut:
    """
    Create an announcement and fan out individual Notification records
    to every active tenant in the org via the existing delivery pipeline.
    """
    if not body.channels:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one channel must be specified.",
        )

    # Fetch all active tenants for this org
    tenants = list(
        (
            await db.execute(
                select(Tenant).where(
                    Tenant.organisation_id == org_id,
                    Tenant.status == TenantStatus.active,
                    Tenant.deleted_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )

    # Persist the announcement record first
    announcement = Announcement(
        organisation_id=org_id,
        title=body.title,
        body=body.body,
        channels=body.channels,
        target_audience="active_tenants",
        sent_to_count=0,
        created_by_id=created_by_id,
    )
    db.add(announcement)
    await db.flush()
    await db.refresh(announcement)

    # Fan out: one Notification per tenant per channel
    sent = 0
    for tenant in tenants:
        tenant_name = (
            f"{tenant.first_name or ''} {tenant.last_name or ''}".strip()
            or tenant.email
        )
        for channel in body.channels:
            recipient_email = tenant.email if channel == "email" else None
            recipient_phone = (
                tenant.phone if channel in ("sms", "whatsapp") else None
            )
            # Skip channels that lack the required contact detail
            if channel == "email" and not recipient_email:
                continue
            if channel in ("sms", "whatsapp") and not recipient_phone:
                continue

            await notification_service.send_notification(
                body=NotificationSend(
                    channel=channel,
                    trigger="bulk_announcement",
                    recipient_name=tenant_name,
                    recipient_email=recipient_email,
                    recipient_phone=recipient_phone,
                    subject=body.title,
                    body=body.body,
                    tenant_id=str(tenant.id),
                ),
                org_id=org_id,
                db=db,
            )
        sent += 1

    announcement.sent_to_count = sent
    await db.flush()
    await db.refresh(announcement)

    return _out(announcement)


async def list_announcements(
    org_id: uuid.UUID,
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    q = select(Announcement).where(
        Announcement.organisation_id == org_id,
    )
    total = (await db.scalar(select(func.count()).select_from(q.subquery()))) or 0
    q = q.order_by(Announcement.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = list((await db.execute(q)).scalars().all())
    return {
        "data": [_out(a) for a in rows],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "hasNext": (page * page_size) < total,
    }
