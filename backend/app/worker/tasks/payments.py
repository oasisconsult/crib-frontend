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

    log.info("mark_overdue_schedules complete: marked=%s skipped_orgs=%s", marked, skipped_orgs)
    return {"marked": marked, "skipped_orgs": skipped_orgs}


# ── extend_rolling_schedules ──────────────────────────────────────────────────

@celery_app.task(
    name="app.worker.tasks.payments.extend_rolling_schedules",
    bind=True,
    max_retries=3,
    default_retry_delay=300,
)
def extend_rolling_schedules(self) -> dict:
    """
    Daily cron: backfill missing rent schedules for active rolling leases
    and extend them 3 months ahead. Safe to run multiple times (idempotent).
    """
    try:
        return _run(_extend_rolling_schedules_async())
    except Exception as exc:
        log.exception("extend_rolling_schedules failed")
        raise self.retry(exc=exc)


async def _extend_rolling_schedules_async() -> dict:
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.pool import NullPool

    from app.core.config import get_settings
    from app.models.lease import Lease, LeaseStatus
    from app.services.payment_service import generate_rent_schedules

    settings = get_settings()
    engine = create_async_engine(settings.database_url, poolclass=NullPool)

    total_added = 0
    leases_processed = 0

    try:
        async with AsyncSession(engine, expire_on_commit=False) as db:
            async with db.begin():
                # All active rolling leases (end_date is NULL)
                result = await db.execute(
                    select(Lease).where(
                        Lease.status == LeaseStatus.active,
                        Lease.end_date.is_(None),
                    )
                )
                leases = result.scalars().all()

                for lease in leases:
                    added = await generate_rent_schedules(lease, db)
                    total_added += added
                    leases_processed += 1

    finally:
        await engine.dispose()

    log.info(
        "extend_rolling_schedules complete: leases=%s added=%s",
        leases_processed, total_added,
    )
    return {"leases_processed": leases_processed, "schedules_added": total_added}


# ── waive_pre_system_schedules ────────────────────────────────────────────────

@celery_app.task(
    name="app.worker.tasks.payments.waive_pre_system_schedules",
    bind=True,
    max_retries=1,
)
def waive_pre_system_schedules(self) -> dict:
    """
    One-time cleanup: waive overdue/pending schedules whose due_date falls
    before the lease was entered into Crib (lease.created_at). These are
    historical backdated periods that were never tracked in the system.
    """
    try:
        return _run(_waive_pre_system_schedules_async())
    except Exception as exc:
        log.exception("waive_pre_system_schedules failed")
        raise self.retry(exc=exc)


async def _waive_pre_system_schedules_async() -> dict:
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.pool import NullPool
    from sqlalchemy import cast, Date as SADate

    from app.core.config import get_settings
    from app.models.lease import Lease
    from app.models.payment import RentSchedule, RentScheduleStatus

    settings = get_settings()
    engine = create_async_engine(settings.database_url, poolclass=NullPool)

    waived = 0

    try:
        async with AsyncSession(engine, expire_on_commit=False) as db:
            async with db.begin():
                result = await db.execute(
                    select(RentSchedule)
                    .join(Lease, Lease.id == RentSchedule.lease_id)
                    .where(
                        RentSchedule.status.in_([RentScheduleStatus.overdue, RentScheduleStatus.pending]),
                        RentSchedule.due_date < cast(Lease.created_at, SADate),
                        Lease.end_date.is_(None),
                    )
                )
                for s in result.scalars().all():
                    s.status = RentScheduleStatus.waived
                    waived += 1
    finally:
        await engine.dispose()

    log.info("waive_pre_system_schedules complete: waived=%s", waived)
    return {"waived": waived}


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
    Runs per org unless autoApplyLateFees=False. Respects lease.grace_period_days.
    """
    try:
        return _run(_apply_late_fees_async())
    except Exception as exc:
        log.exception("apply_late_fees_task failed")
        raise self.retry(exc=exc)


async def _apply_late_fees_async() -> dict:
    from datetime import timedelta
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
                today = date.today()

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

                    # Check org setting — default True so fees apply automatically
                    if org_id not in org_cache:
                        org = await db.scalar(
                            select(Organisation).where(Organisation.id == s.organisation_id)
                        )
                        payment_settings = (org.settings or {}).get("payments", {}) if org else {}
                        org_cache[org_id] = payment_settings.get("autoApplyLateFees", True)

                    if not org_cache[org_id]:
                        skipped += 1
                        continue

                    # Load lease for fee config and grace period
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

                    # Respect the lease's grace period — don't charge until it has elapsed
                    grace_days = int(lease.grace_period_days or 0)
                    if today < s.due_date + timedelta(days=grace_days):
                        skipped += 1
                        continue

                    # Calculate amount
                    amount_due = float(s.amount_due)
                    if lease.late_fee_type in ("percent", "percentage"):
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

    log.info("apply_late_fees_task complete: applied=%s skipped=%s", applied, skipped)
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
                    org_id_str = str(s.organisation_id)
                    if org_id_str not in org_cache:
                        org = await db.scalar(
                            select(Organisation).where(Organisation.id == s.organisation_id)
                        )
                        payment_settings = (org.settings or {}).get("payments", {}) if org else {}
                        org_cache[org_id_str] = payment_settings.get("reminderDaysBefore", 3)

                    days_before = org_cache[org_id_str]
                    reminder_date = s.due_date - timedelta(days=days_before)

                    if reminder_date == today:
                        log.info(
                            "rent_reminder_due: lease_id=%s due_date=%s schedule_id=%s",
                            s.lease_id, s.due_date, s.id,
                        )
                        # Resolve tenant details for the notification
                        from app.models.lease import Lease
                        from app.models.tenant import Tenant
                        from app.models.notification import Notification, NotificationState

                        lease = await db.scalar(
                            select(Lease).where(Lease.id == s.lease_id)
                        )
                        tenant = None
                        if lease and lease.tenant_id:
                            tenant = await db.scalar(
                                select(Tenant).where(Tenant.id == lease.tenant_id)
                            )

                        now_utc = datetime.now(timezone.utc)
                        notif = Notification(
                            organisation_id=s.organisation_id,
                            tenant_id=lease.tenant_id if lease else None,
                            channel="in_app",
                            trigger="rent_due",
                            recipient_name=f"{tenant.first_name} {tenant.last_name}" if tenant else "Tenant",
                            recipient_email=tenant.email if tenant else None,
                            recipient_phone=tenant.phone if tenant else None,
                            subject="Rent due reminder",
                            body=(
                                f"Your rent of {float(s.amount_due):,.0f} is due on {s.due_date}. "
                                f"Please ensure payment is made on time to avoid late fees."
                            ),
                            state=NotificationState.queued,
                            queued_at=now_utc,
                            lease_id=s.lease_id,
                            created_at=now_utc,
                        )
                        db.add(notif)
                        sent += 1

                await db.flush()

    finally:
        await engine.dispose()

    log.info("send_rent_reminders complete: sent=%s", sent)
    return {"sent": sent}


# ── Mobile money polling tasks ─────────────────────────────────────────────────
# Fallback for missed webhooks. Runs every 5 minutes per provider.
# Polls for all pending MobileMoneyTransaction rows and checks their status
# with the provider API, then triggers matching for any newly-received ones.

@celery_app.task(
    name="app.worker.tasks.payments.poll_mtn_transactions",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def poll_mtn_transactions(self) -> dict:
    """Every 5 min: poll MTN for pending transactions, trigger matching on received."""
    try:
        return _run(_poll_mobile_money_async("MTN"))
    except Exception as exc:
        log.exception("poll_mtn_transactions failed")
        raise self.retry(exc=exc)


@celery_app.task(
    name="app.worker.tasks.payments.poll_airtel_transactions",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def poll_airtel_transactions(self) -> dict:
    """Every 5 min: poll Airtel for pending transactions, trigger matching on received."""
    try:
        return _run(_poll_mobile_money_async("AIRTEL"))
    except Exception as exc:
        log.exception("poll_airtel_transactions failed")
        raise self.retry(exc=exc)


async def _poll_mobile_money_async(provider_name: str) -> dict:
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.pool import NullPool

    from app.core.config import get_settings
    from app.integrations.payments.base import ProviderName
    from app.integrations.payments.service import sync_pending_transactions
    from app.models.mobile_money import MobileMoneyTransaction
    from app.services.matching_service import match_transaction

    settings = get_settings()
    engine = create_async_engine(settings.database_url, poolclass=NullPool)

    updated = 0
    matched = 0

    try:
        async with AsyncSession(engine, expire_on_commit=False) as db:
            async with db.begin():
                pname = ProviderName(provider_name)
                updated = await sync_pending_transactions(db, provider_name=pname)

                # Match any newly-received transactions
                from sqlalchemy import select
                result = await db.execute(
                    select(MobileMoneyTransaction).where(
                        MobileMoneyTransaction.provider == provider_name,
                        MobileMoneyTransaction.status == "received",
                    )
                )
                received = result.scalars().all()
                for txn in received:
                    payment = await match_transaction(db, txn)
                    if payment:
                        matched += 1

                # Propagate failed/expired provider status → Payment.failed
                from app.integrations.payments.service import _propagate_provider_failure
                failed_result = await db.execute(
                    select(MobileMoneyTransaction).where(
                        MobileMoneyTransaction.provider == provider_name,
                        MobileMoneyTransaction.status.in_(["failed", "expired"]),
                        MobileMoneyTransaction.reference_id.isnot(None),
                    )
                )
                for txn in failed_result.scalars().all():
                    await _propagate_provider_failure(
                        db, txn, reason=f"{provider_name} transaction {txn.status}"
                    )
    finally:
        await engine.dispose()

    log.info(
        "poll_%s_complete updated=%s matched=%s",
        provider_name.lower(),
        updated,
        matched,
    )
    return {"provider": provider_name, "updated": updated, "matched": matched}
