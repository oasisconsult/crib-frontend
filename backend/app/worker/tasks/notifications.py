"""
Notification delivery Celery task.

Tasks:
  deliver_notification  — triggered per notification; loads row, calls channel adapter,
                          updates state to sent/delivered/failed
"""

import asyncio
import logging

from app.worker.celery_app import celery_app

log = logging.getLogger(__name__)


def _run(coro):
    """Run an async coroutine from a sync Celery task."""
    return asyncio.get_event_loop().run_until_complete(coro)


@celery_app.task(
    name="app.worker.tasks.notifications.deliver_notification",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def deliver_notification(self, notification_id: str) -> dict:
    """
    Deliver a single queued notification via the appropriate channel adapter.
    Retries up to 3 times on failure (60-second backoff).
    """
    try:
        return _run(_deliver_async(notification_id))
    except Exception as exc:
        log.exception("deliver_notification failed", extra={"notification_id": notification_id})
        raise self.retry(exc=exc)


async def _deliver_async(notification_id: str) -> dict:
    import uuid

    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.pool import NullPool

    from app.core.config import get_settings
    from app.services.notification_service import dispatch_notification

    settings = get_settings()
    engine = create_async_engine(settings.database_url, poolclass=NullPool)

    try:
        async with AsyncSession(engine, expire_on_commit=False) as db:
            async with db.begin():
                result = await dispatch_notification(
                    notification_id=uuid.UUID(notification_id), db=db
                )
        return result
    finally:
        await engine.dispose()
