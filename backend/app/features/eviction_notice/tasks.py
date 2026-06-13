"""Celery tasks for eviction notices: send reminders as effective_date approaches."""

import asyncio
import logging
import uuid

from app.worker.celery_app import celery_app

log = logging.getLogger(__name__)


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@celery_app.task(
    name="app.features.eviction_notice.tasks.send_eviction_reminder",
    bind=True,
    max_retries=3,
    default_retry_delay=300,
)
def send_eviction_reminder(self, notice_id: str, days_before: int) -> dict:
    """Remind the tenant N days before the eviction effective date."""
    try:
        return _run(_reminder_async(uuid.UUID(notice_id), days_before))
    except Exception as exc:
        log.exception("send_eviction_reminder.failed", extra={"notice_id": notice_id})
        raise self.retry(exc=exc)


async def _reminder_async(notice_id: uuid.UUID, days_before: int) -> dict:
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.pool import NullPool

    from app.core.config import get_settings
    from app.features.eviction_notice.model import EvictionNotice, EvictionNoticeStatus

    settings = get_settings()
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    try:
        async with AsyncSession(engine, expire_on_commit=False) as db:
            en = await db.scalar(select(EvictionNotice).where(EvictionNotice.id == notice_id))
            if not en or en.status in (
                EvictionNoticeStatus.withdrawn,
                EvictionNoticeStatus.executed,
                EvictionNoticeStatus.disputed,
            ):
                return {"skipped": True, "reason": "notice no longer active"}

            if not en.tenant_id:
                return {"skipped": True, "reason": "no tenant linked"}

            from app.models.notification import Notification, NotificationState
            from app.models.tenant import Tenant

            tenant = await db.scalar(select(Tenant).where(Tenant.id == en.tenant_id))
            if not tenant or not tenant.email:
                return {"skipped": True, "reason": "no tenant email"}

            tenant_name = (
                f"{tenant.first_name or ''} {tenant.last_name or ''}".strip() or tenant.email
            )
            notif = Notification(
                organisation_id=en.organisation_id,
                channel="email",
                state=NotificationState.queued,
                recipient_id=en.tenant_id,
                recipient_email=tenant.email,
                subject=f"Eviction Notice — {days_before} days remaining",
                body=(
                    f"Dear {tenant_name},\n\n"
                    f"This is a reminder that you are required to vacate the premises "
                    f"in {days_before} days, on {en.effective_date.strftime('%d %B %Y')}.\n\n"
                    f"If you believe this notice was issued in error, please contact your landlord "
                    f"or seek legal advice immediately. You have rights under the Uganda Landlord "
                    f"& Tenant Act 2022."
                ),
            )
            db.add(notif)
            await db.flush()
            await db.commit()

            from app.worker.tasks.notifications import deliver_notification
            deliver_notification.delay(str(notif.id))

        return {"notice_id": str(notice_id), "reminder_sent": True, "days_before": days_before}
    finally:
        await engine.dispose()
