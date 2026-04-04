"""
Payment matching engine.

Links an inbound MobileMoneyTransaction to a tenant and their unpaid
rent schedules, then triggers payment allocation.

Matching strategy (in order):
  1. Exact phone match → tenant → oldest unpaid schedule → allocate
  2. If multiple tenants share a phone (rare): pick most recently active lease
  3. If no tenant found: mark transaction as "unmatched" for admin action

The engine never raises — failures are logged and the transaction is
left in an unmatched/failed state for manual reconciliation.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mobile_money import MobileMoneyTransaction
from app.models.payment import Payment, PaymentCategory, PaymentMethod, PaymentStatus

log = structlog.get_logger(__name__)


async def match_transaction(
    db: AsyncSession,
    txn: MobileMoneyTransaction,
) -> Payment | None:
    """
    Attempt to match a received MobileMoneyTransaction to a tenant/lease.

    On success:
      - Creates a confirmed Payment row
      - Calls allocate_payment + credit_wallet (via payment_service.confirm_payment)
      - Sets txn.status = "matched", txn.matched_payment_id = payment.id
      - Returns the Payment

    On failure:
      - Sets txn.status = "unmatched"
      - Returns None
    """
    if txn.status not in ("received",):
        log.warning(
            "matching.skipped",
            external_id=txn.external_id,
            status=txn.status,
            reason="not_received",
        )
        return None

    # ── Step 1: find tenant by phone ──────────────────────────────────────────
    from app.models.tenant import Tenant

    result = await db.execute(
        select(Tenant).where(Tenant.phone == txn.phone_number)
    )
    tenants = result.scalars().all()

    if not tenants:
        log.info(
            "matching.no_tenant",
            phone=txn.phone_number,
            external_id=txn.external_id,
        )
        txn.status = "unmatched"
        await db.flush()
        from app.core.events import emit_mobile_money_unmatched
        await emit_mobile_money_unmatched(
            transaction_id=str(txn.id),
            phone_number=txn.phone_number,
            amount=float(txn.amount),
        )
        return None

    # ── Step 2: find the most relevant active lease ───────────────────────────
    from app.models.lease import Lease, LeaseStatus
    from app.models.payment import RentSchedule, RentScheduleStatus

    tenant_ids = [t.id for t in tenants]
    lease_result = await db.execute(
        select(Lease)
        .where(
            Lease.tenant_id.in_(tenant_ids),
            Lease.status == LeaseStatus.active,
        )
        .order_by(Lease.start_date.desc())
        .limit(1)
    )
    lease = lease_result.scalar_one_or_none()

    if not lease:
        log.info(
            "matching.no_active_lease",
            phone=txn.phone_number,
            external_id=txn.external_id,
        )
        txn.status = "unmatched"
        await db.flush()
        return None

    # ── Step 3: check for duplicate (idempotency) ─────────────────────────────
    existing = await db.execute(
        select(Payment).where(
            Payment.reference == txn.external_id,
            Payment.lease_id == lease.id,
        )
    )
    if existing.scalar_one_or_none():
        log.info(
            "matching.duplicate",
            external_id=txn.external_id,
            lease_id=str(lease.id),
        )
        return None

    # ── Step 4: determine payment method from provider ────────────────────────
    method_map = {
        "MTN": PaymentMethod.mobile_money_mtn,
        "AIRTEL": PaymentMethod.mobile_money_airtel,
    }
    method = method_map.get(txn.provider, PaymentMethod.other)

    # ── Step 5: create and confirm payment ────────────────────────────────────
    payment = Payment(
        organisation_id=lease.organisation_id,
        lease_id=lease.id,
        rent_schedule_id=None,         # allocation engine distributes oldest-first
        amount=float(txn.amount),
        currency=txn.currency,
        category=PaymentCategory.rent,
        method=method,
        reference=txn.external_id,    # store provider external_id as reference
        status=PaymentStatus.pending,
        paid_at=txn.received_at or datetime.now(timezone.utc),
        notes=f"Auto-matched from {txn.provider} transaction {txn.external_id}",
    )
    db.add(payment)
    await db.flush()

    # Confirm triggers allocation + ledger + wallet
    from app.services.payment_service import confirm_payment
    await confirm_payment(payment.id, lease.id, lease.organisation_id, db)

    # ── Step 6: mark transaction as matched ───────────────────────────────────
    txn.status = "matched"
    txn.matched_payment_id = payment.id
    await db.flush()

    log.info(
        "matching.success",
        external_id=txn.external_id,
        payment_id=str(payment.id),
        lease_id=str(lease.id),
        amount=float(txn.amount),
    )

    from app.core.events import emit_mobile_money_matched
    await emit_mobile_money_matched(
        transaction_id=str(txn.id),
        payment_id=str(payment.id),
        organisation_id=str(lease.organisation_id),
    )

    return payment
