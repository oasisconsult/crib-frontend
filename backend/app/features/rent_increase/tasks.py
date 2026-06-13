"""Celery tasks for rent increase: apply on effective_date, send reminders."""

import asyncio
import logging
import uuid

from app.worker.celery_app import celery_app

log = logging.getLogger(__name__)


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@celery_app.task(
    name="app.features.rent_increase.tasks.apply_rent_increase",
    bind=True,
    max_retries=3,
    default_retry_delay=300,
)
def apply_rent_increase(self, increase_id: str) -> dict:
    """Apply the rent increase to the lease on the effective date."""
    try:
        return _run(_apply_async(uuid.UUID(increase_id)))
    except Exception as exc:
        log.exception("apply_rent_increase.failed", extra={"increase_id": increase_id})
        raise self.retry(exc=exc)


async def _apply_async(increase_id: uuid.UUID) -> dict:
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.pool import NullPool

    from app.core.config import get_settings
    from app.features.rent_increase.service import apply_increase

    settings = get_settings()
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    try:
        async with AsyncSession(engine, expire_on_commit=False) as db:
            async with db.begin():
                await apply_increase(increase_id, db)
        return {"increase_id": str(increase_id), "status": "applied"}
    finally:
        await engine.dispose()


@celery_app.task(
    name="app.features.rent_increase.tasks.send_rent_increase_reminder",
    bind=True,
    max_retries=3,
    default_retry_delay=300,
)
def send_rent_increase_reminder(self, increase_id: str, days_before: int) -> dict:
    """Send a reminder notification to the tenant N days before the effective date."""
    try:
        return _run(_reminder_async(uuid.UUID(increase_id), days_before))
    except Exception as exc:
        log.exception("send_rent_increase_reminder.failed", extra={"increase_id": increase_id})
        raise self.retry(exc=exc)


async def _reminder_async(increase_id: uuid.UUID, days_before: int) -> dict:
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.pool import NullPool

    from app.core.config import get_settings
    from app.features.rent_increase.model import RentIncrease, RentIncreaseStatus

    settings = get_settings()
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    try:
        async with AsyncSession(engine, expire_on_commit=False) as db:
            ri = await db.scalar(select(RentIncrease).where(RentIncrease.id == increase_id))
            if not ri or ri.status in (RentIncreaseStatus.withdrawn, RentIncreaseStatus.applied):
                return {"skipped": True, "reason": "notice no longer active"}

            if not ri.tenant_id:
                return {"skipped": True, "reason": "no tenant linked"}

            from app.models.notification import Notification, NotificationState
            from app.models.tenant import Tenant

            tenant = await db.scalar(select(Tenant).where(Tenant.id == ri.tenant_id))
            if not tenant or not tenant.email:
                return {"skipped": True, "reason": "no tenant email"}

            tenant_name = f"{tenant.first_name or ''} {tenant.last_name or ''}".strip() or tenant.email
            body = (
                f"Dear {tenant_name},\n\n"
                f"This is a reminder that your monthly rent will increase from "
                f"{float(ri.current_rent):,.0f} to {float(ri.new_rent):,.0f} "
                f"in {days_before} days, on {ri.effective_date.strftime('%d %B %Y')}.\n\n"
                f"Please log in to your tenant portal to view the notice."
            )

            notif = Notification(
                organisation_id=ri.organisation_id,
                channel="email",
                state=NotificationState.queued,
                recipient_id=ri.tenant_id,
                recipient_email=tenant.email,
                subject=f"Rent Increase Reminder — {days_before} days to go",
                body=body,
            )
            db.add(notif)
            await db.flush()
            await db.commit()

            from app.worker.tasks.notifications import deliver_notification
            deliver_notification.delay(str(notif.id))

        return {"increase_id": str(increase_id), "reminder_sent": True, "days_before": days_before}
    finally:
        await engine.dispose()
