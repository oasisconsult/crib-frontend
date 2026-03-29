"""
Payment processing Celery tasks.

Tasks:
  mark_overdue_schedules  — daily cron; marks pending schedules past due_date as overdue
  apply_late_fees_task    — daily cron; applies late fees to newly-overdue schedules
  send_rent_reminders     — daily cron; sends rent reminders N days before due_date

Per-org behaviour is controlled by organisation.settings.payments:
  autoMarkOverdue   (bool, default True)
  autoApplyLateFees (bool, default False)
  lateFeeGraceDays  (int,  default 0)
  reminderDaysBefore (int, default 3)
"""

import asyncio
import logging
from datetime import date, datetime, timezone

from sqlalchemy import select

from app.worker.celery_app import celery_app

log = logging.getLogger(__name__)


def _run(coro):
    """Run an async coroutine from a sync Celery task."""
    return asyncio.get_event_loop().run_until_complete(coro)


# ── mark_overdue_schedules ─────────────────────────────────────────────────────

@celery_app.task(
    name="app.worker.tasks.payments.mark_overdue_schedules",
    bind=True,
    max_retries=3,
    default_retry_delay=300,
)
def mark_overdue_schedules(self) -> dict:
    """
    Daily cron: scan all pending rent schedules whose due_date has passed
    and mark them overdue — per org, only if autoMarkOverdue=True (default).
    """
    try:
        return _run(_mark_overdue_schedules_async())
    except Exception as exc:
        log.exception("mark_overdue_schedules failed")
        raise self.retry(exc=exc)


async def _mark_overdue_schedules_async() -> dict:
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.pool import NullPool

    from app.core.config import get_settings
    from app.models.organisation import Organisation
    from app.models.payment import RentSchedule, RentScheduleStatus

    settings = get_settings()
    engine = create_async_engine(settings.database_url, poolclass=NullPool)

    marked = 0
    skipped_orgs = 0

    try:
        async with AsyncSession(engine, expire_on_commit=False) as db:
            async with db.begin():
                today = date.today()

                # Fetch all pending overdue schedules
                result = await db.execute(
                    select(RentSchedule).where(
                        RentSchedule.status == RentScheduleStatus.pending,
                        RentSchedule.due_date < today,
                    )
                )
                schedules = result.scalars().all()

                # Group by organisation to check per-org settings
                org_cache: dict = {}
                for s in schedules:
                    org_id = str(s.organisation_id)
                    if org_id not in org_cache:
                        org = await db.scalar(
                            select(Organisation).where(Organisation.id == s.organisation_id)
                        )
                        payment_settings = (org.settings or {}).get("payments", {}) if org else {}
                        org_cache[org_id] = payment_settings.get("autoMarkOverdue", True)

                    if not org_cache[org_id]:
                        skipped_orgs += 1
                        continue

                    s.status = RentScheduleStatus.overdue
                    marked += 1

    finally:
        await engine.dispose()

    log.info("mark_overdue_schedules complete", marked=marked, skipped_orgs=skipped_orgs)
    return {"marked": marked, "skipped_orgs": skipped_orgs}


# ── apply_late_fees_task ───────────────────────────────────────────────────────

@celery_app.task(
    name="app.worker.tasks.payments.apply_late_fees_task",
    bind=True,
    max_retries=3,
    default_retry_delay=300,
)
def apply_late_fees_task(self) -> dict:
    """
    Daily cron: apply late fees to overdue schedules that don't have one yet.
    Only runs per org if autoApplyLateFees=True (default False).
    """
    try:
        return _run(_apply_late_fees_async())
    except Exception as exc:
        log.exception("apply_late_fees_task failed")
        raise self.retry(exc=exc)


async def _apply_late_fees_async() -> dict:
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.pool import NullPool

    from app.core.config import get_settings
    from app.models.lease import Lease
    from app.models.organisation import Organisation
    from app.models.payment import LateFee, RentSchedule, RentScheduleStatus

    settings = get_settings()
    engine = create_async_engine(settings.database_url, poolclass=NullPool)

    applied = 0
    skipped = 0

    try:
        async with AsyncSession(engine, expire_on_commit=False) as db:
            async with db.begin():
                # Overdue schedules that have no late fee yet
                existing_fees = select(LateFee.rent_schedule_id)
                result = await db.execute(
                    select(RentSchedule).where(
                        RentSchedule.status == RentScheduleStatus.overdue,
                        RentSchedule.id.notin_(existing_fees),
                    )
                )
                schedules = result.scalars().all()

                org_cache: dict = {}
                lease_cache: dict = {}

                for s in schedules:
                    org_id = str(s.organisation_id)

                    # Check org setting
                    if org_id not in org_cache:
                        org = await db.scalar(
                            select(Organisation).where(Organisation.id == s.organisation_id)
                        )
                        payment_settings = (org.settings or {}).get("payments", {}) if org else {}
                        org_cache[org_id] = payment_settings.get("autoApplyLateFees", False)

                    if not org_cache[org_id]:
                        skipped += 1
                        continue

                    # Load lease for fee config
                    lease_id = str(s.lease_id)
                    if lease_id not in lease_cache:
                        lease = await db.scalar(
                            select(Lease).where(Lease.id == s.lease_id)
                        )
                        lease_cache[lease_id] = lease

                    lease = lease_cache[lease_id]
                    if not lease or not lease.late_fee_value:
                        skipped += 1
                        continue

                    # Calculate amount
                    amount_due = float(s.amount_due)
                    if lease.late_fee_type == "percent":
                        fee_amount = round(float(lease.late_fee_value) / 100 * amount_due, 2)
                    else:
                        fee_amount = float(lease.late_fee_value)

                    now = datetime.now(timezone.utc)
                    fee = LateFee(
                        organisation_id=s.organisation_id,
                        lease_id=s.lease_id,
                        rent_schedule_id=s.id,
                        fee_type=lease.late_fee_type,
                        calculated_amount=fee_amount,
                        applied_at=now,
                        waived=False,
                    )
                    db.add(fee)
                    s.late_fee_applied = float(s.late_fee_applied) + fee_amount
                    applied += 1

    finally:
        await engine.dispose()

    log.info("apply_late_fees_task complete", applied=applied, skipped=skipped)
    return {"applied": applied, "skipped": skipped}


# ── send_rent_reminders ────────────────────────────────────────────────────────

@celery_app.task(
    name="app.worker.tasks.payments.send_rent_reminders",
    bind=True,
    max_retries=3,
    default_retry_delay=300,
)
def send_rent_reminders(self) -> dict:
    """
    Daily cron: send rent reminders to tenants N days before due_date.
    N is configurable per org via settings.payments.reminderDaysBefore (default 3).
    """
    try:
        return _run(_send_rent_reminders_async())
    except Exception as exc:
        log.exception("send_rent_reminders failed")
        raise self.retry(exc=exc)


async def _send_rent_reminders_async() -> dict:
    from datetime import timedelta
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.pool import NullPool

    from app.core.config import get_settings
    from app.models.organisation import Organisation
    from app.models.payment import RentSchedule, RentScheduleStatus

    settings = get_settings()
    engine = create_async_engine(settings.database_url, poolclass=NullPool)

    sent = 0

    try:
        async with AsyncSession(engine, expire_on_commit=False) as db:
            async with db.begin():
                org_cache: dict = {}
                today = date.today()

                result = await db.execute(
                    select(RentSchedule).where(
                        RentSchedule.status == RentScheduleStatus.pending,
                    )
                )
                schedules = result.scalars().all()

                for s in schedules:
                    org_id = str(s.organisation_id)
                    if org_id not in org_cache:
                        org = await db.scalar(
                            select(Organisation).where(Organisation.id == s.organisation_id)
                        )
                        payment_settings = (org.settings or {}).get("payments", {}) if org else {}
                        org_cache[org_id] = payment_settings.get("reminderDaysBefore", 3)

                    days_before = org_cache[org_id]
                    reminder_date = s.due_date - timedelta(days=days_before)

                    if reminder_date == today:
                        # Notification logic will be wired in Sprint 6 (notifications domain)
                        log.info(
                            "rent_reminder_due",
                            lease_id=str(s.lease_id),
                            due_date=str(s.due_date),
                            schedule_id=str(s.id),
                        )
                        sent += 1

    finally:
        await engine.dispose()

    log.info("send_rent_reminders complete", sent=sent)
    return {"sent": sent}
