"""
Mobile money reconciliation Celery tasks.

Tasks:
  reconcile_unmatched_transactions — daily cron; flags received mobile money
      transactions that have been sitting unmatched for more than 24 hours so
      that an admin can investigate and manually link them.

A transaction is "unmatched" when the matching engine could not automatically
tie a received payment to a tenant/lease (status="received" and no
matched_payment_id after 24 h). These are flagged to status="unmatched" so
they surface in admin dashboards and don't silently age out.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from app.worker.celery_app import celery_app

log = logging.getLogger(__name__)


def _run(coro):
    """Run an async coroutine from a sync Celery task."""
    return asyncio.get_event_loop().run_until_complete(coro)


@celery_app.task(
    name="app.worker.tasks.mobile_money.reconcile_unmatched_transactions",
    bind=True,
    max_retries=3,
    default_retry_delay=300,
)
def reconcile_unmatched_transactions(self) -> dict:
    """
    Daily cron: find mobile money transactions that arrived more than 24 hours
    ago, were never matched to a payment, and are still in 'received' status.
    Transition them to 'unmatched' so admins can investigate.
    """
    try:
        return _run(_reconcile_unmatched_async())
    except Exception as exc:
        log.exception("reconcile_unmatched_transactions failed")
        raise self.retry(exc=exc)


async def _reconcile_unmatched_async() -> dict:
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.pool import NullPool

    from app.core.config import get_settings
    from app.models.mobile_money import MobileMoneyTransaction

    settings = get_settings()
    engine = create_async_engine(settings.database_url, poolclass=NullPool)

    flagged = 0
    cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=24)

    try:
        async with AsyncSession(engine, expire_on_commit=False) as db:
            async with db.begin():
                result = await db.execute(
                    select(MobileMoneyTransaction).where(
                        MobileMoneyTransaction.status == "received",
                        MobileMoneyTransaction.matched_payment_id.is_(None),
                        MobileMoneyTransaction.received_at <= cutoff,
                    )
                )
                stale = result.scalars().all()

                for txn in stale:
                    txn.status = "unmatched"
                    flagged += 1
                    log.warning(
                        "mobile_money.unmatched provider=%s external_id=%s amount=%s org=%s",
                        txn.provider,
                        txn.external_id,
                        txn.amount,
                        txn.organisation_id,
                    )

    finally:
        await engine.dispose()

    log.info("reconcile_unmatched_transactions complete: flagged=%s", flagged)
    return {"flagged": flagged, "cutoff_utc": cutoff.isoformat()}
