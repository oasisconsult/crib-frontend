"""Daily exchange rate refresh task."""

from __future__ import annotations

import asyncio
import structlog

from app.worker.celery_app import celery_app

log = structlog.get_logger(__name__)


@celery_app.task(
    name="app.worker.tasks.exchange_rate.refresh_ugx_rate",
    bind=True,
    max_retries=3,
    default_retry_delay=300,
)
def refresh_ugx_rate(self) -> dict:
    """Fetch USD→UGX rate from Frankfurter and store in system_settings."""
    async def _run():
        from app.core.database import AsyncSessionLocal
        from app.services.exchange_rate_service import refresh_ugx_rate as _refresh

        async with AsyncSessionLocal() as db:
            return await _refresh(db)

    try:
        return asyncio.get_event_loop().run_until_complete(_run())
    except Exception as exc:
        log.warning("exchange_rate.task_failed", attempt=self.request.retries, error=str(exc))
        raise self.retry(exc=exc)
