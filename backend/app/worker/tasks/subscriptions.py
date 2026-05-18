"""
Subscription lifecycle background tasks.

Beat schedule (added to celery_app.py):
  check-subscription-expiry-daily    — midnight UTC
  send-renewal-reminders-daily       — 08:00 UTC
  check-grace-period-expiry-daily    — 06:00 UTC
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import structlog

from app.worker.celery_app import celery_app

log = structlog.get_logger(__name__)


def _run(coro):
    """Run an async coroutine from a sync Celery task."""
    return asyncio.get_event_loop().run_until_complete(coro)


@celery_app.task(name="app.worker.tasks.subscriptions.check_subscription_expiry", queue="default")
def check_subscription_expiry() -> None:
    """
    Mark subscriptions as expired when their period has ended and no pending
    payment exists. Moves them to grace_period first; expires after grace.
    """
    async def _run_async():
        from sqlalchemy import select
        from app.core.database import async_session_factory
        from app.models.subscription import (
            OrganisationSubscription, SubscriptionStatus, SubscriptionPaymentStatus, SubscriptionPayment
        )
        from app.services.subscription_service import start_grace_period

        now = datetime.now(timezone.utc)
        async with async_session_factory() as db:
            # Subscriptions whose period has ended and are still 'active'
            result = await db.execute(
                select(OrganisationSubscription).where(
                    OrganisationSubscription.status == SubscriptionStatus.active,
                    OrganisationSubscription.current_period_end <= now,
                    OrganisationSubscription.billing_cycle != "none",
                )
            )
            subs = result.scalars().all()
            count = 0
            for sub in subs:
                # Check for pending verification payment — give grace
                pending_q = await db.execute(
                    select(SubscriptionPayment).where(
                        SubscriptionPayment.subscription_id == sub.id,
                        SubscriptionPayment.status == SubscriptionPaymentStatus.pending_verification,
                    )
                )
                if pending_q.scalar_one_or_none():
                    continue  # Don't expire if payment is being reviewed
                await start_grace_period(sub, db)
                count += 1
            await db.commit()
            log.info("subscriptions.expiry_check", moved_to_grace=count)

    _run(_run_async())


@celery_app.task(name="app.worker.tasks.subscriptions.check_grace_period_expiry", queue="default")
def check_grace_period_expiry() -> None:
    """Expire subscriptions whose grace period has ended."""
    async def _run_async():
        from sqlalchemy import select
        from app.core.database import async_session_factory
        from app.models.subscription import OrganisationSubscription, SubscriptionStatus
        from app.services.subscription_service import expire_subscription

        now = datetime.now(timezone.utc)
        async with async_session_factory() as db:
            result = await db.execute(
                select(OrganisationSubscription).where(
                    OrganisationSubscription.status == SubscriptionStatus.grace_period,
                    OrganisationSubscription.grace_period_until <= now,
                )
            )
            subs = result.scalars().all()
            count = 0
            for sub in subs:
                await expire_subscription(sub, db)
                count += 1
            await db.commit()
            log.info("subscriptions.grace_expiry", expired=count)

    _run(_run_async())


@celery_app.task(name="app.worker.tasks.subscriptions.send_renewal_reminders", queue="notifications")
def send_renewal_reminders() -> None:
    """Send renewal reminder emails 7, 3, and 1 days before period end."""
    async def _run_async():
        from datetime import timedelta
        from sqlalchemy import select, and_, or_
        from app.core.database import async_session_factory
        from app.models.subscription import OrganisationSubscription, SubscriptionStatus
        from app.models.organisation import Organisation
        from app.integrations.notifications.email import get_email_provider

        now = datetime.now(timezone.utc)
        thresholds = [1, 3, 7]  # days before expiry

        async with async_session_factory() as db:
            for days in thresholds:
                target_start = now + timedelta(days=days)
                target_end = now + timedelta(days=days, hours=1)

                result = await db.execute(
                    select(OrganisationSubscription, Organisation).join(
                        Organisation, OrganisationSubscription.organisation_id == Organisation.id
                    ).where(
                        OrganisationSubscription.status == SubscriptionStatus.active,
                        OrganisationSubscription.current_period_end >= target_start,
                        OrganisationSubscription.current_period_end < target_end,
                        OrganisationSubscription.billing_cycle != "none",
                    )
                )
                rows = result.all()
                provider = get_email_provider()
                for sub, org in rows:
                    if not org.billing_email:
                        continue
                    plan_name = sub.plan.name if sub.plan else "your plan"
                    body = (
                        f"Hi,\n\nYour {plan_name} subscription on Crib expires in {days} day{'s' if days > 1 else ''}.\n\n"
                        f"To keep uninterrupted access, please submit your renewal payment at:\n"
                        f"https://crib.geoboxafrica.com/subscription\n\n"
                        "— The Crib Team"
                    )
                    await provider.send(
                        recipient_name=org.name,
                        recipient_email=org.billing_email,
                        recipient_phone=None,
                        subject=f"[Crib] Subscription renews in {days} day{'s' if days > 1 else ''}",
                        body=body,
                    )
                    log.info("subscriptions.renewal_reminder_sent", org_id=str(org.id), days=days)

    _run(_run_async())
