"""
EFRIS Celery task — async URA fiscal receipt issuance.

Fire-and-forget from confirm_payment(). Never blocks the payment confirmation response.

Retry strategy:
  - max_retries=5 with exponential backoff: 60s → 120s → 240s → 480s → 960s
  - EfrisApiError triggers retry (transient URA API failures)
  - EfrisNotConfiguredError silently marks as skipped (no point retrying config errors)
  - All other exceptions mark as permanently failed after max retries

Dead-letter: after max_retries the payment is marked efris_status='failed'
with failure_reason set. Visible in the EFRIS compliance dashboard for manual retry.
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.pool import NullPool

from app.worker.celery_app import celery_app

log = logging.getLogger(__name__)


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@celery_app.task(
    name="app.worker.tasks.efris.issue_efris_receipt",
    bind=True,
    max_retries=5,
    default_retry_delay=60,
    queue="efris",
)
def issue_efris_receipt(self, payment_id: str) -> dict:
    """Issue a URA EFRIS fiscal receipt for a confirmed payment.

    Args:
        payment_id: String UUID of the confirmed Payment row.
    """
    try:
        return _run(_issue_async(payment_id))
    except Exception as exc:
        from app.integrations.efris.client import EfrisApiError, EfrisNotConfiguredError

        if isinstance(exc, EfrisNotConfiguredError):
            log.warning("EFRIS: not configured for payment %s — skipping", payment_id)
            return {"status": "skipped", "payment_id": payment_id}

        if isinstance(exc, EfrisApiError):
            # Exponential backoff: 60s, 120s, 240s, 480s, 960s
            delay = min(60 * (2 ** self.request.retries), 3600)
            log.warning(
                "EFRIS: API error for payment %s (attempt %d/%d) — retrying in %ds: %s",
                payment_id, self.request.retries + 1, self.max_retries + 1, delay, exc,
            )
            raise self.retry(exc=exc, countdown=delay)

        # Unrecoverable error — mark failed and stop retrying
        log.exception("EFRIS: unrecoverable failure for payment %s", payment_id)
        _run(_mark_failed_async(payment_id, str(exc)))
        return {"status": "failed", "payment_id": payment_id, "error": str(exc)}


async def _issue_async(payment_id: str) -> dict:
    from sqlalchemy.ext.asyncio import create_async_engine

    from app.core.config import get_settings
    from app.integrations.efris.service import issue_receipt

    settings = get_settings()
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    redis = await _get_redis(settings)

    try:
        async with AsyncSession(engine) as db:
            async with db.begin():
                await issue_receipt(payment_id, db, redis)
        return {"status": "issued", "payment_id": payment_id}
    finally:
        await engine.dispose()
        await redis.aclose()


async def _mark_failed_async(payment_id: str, reason: str) -> None:
    from sqlalchemy.ext.asyncio import create_async_engine

    from app.core.config import get_settings
    from app.integrations.efris.service import mark_failed

    settings = get_settings()
    engine = create_async_engine(settings.database_url, poolclass=NullPool)

    try:
        async with AsyncSession(engine) as db:
            async with db.begin():
                await mark_failed(payment_id, reason, db)
    finally:
        await engine.dispose()


async def _get_redis(settings):
    """Return an async Redis client from the app's configured Redis URL."""
    import redis.asyncio as aioredis
    return aioredis.from_url(
        settings.redis_url or "redis://localhost:6379/0",
        encoding="utf-8",
        decode_responses=True,
    )
