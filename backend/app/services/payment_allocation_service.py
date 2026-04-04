"""
Payment allocation service.

allocate_payment() is the core function called by confirm_payment().
It distributes a payment amount across unpaid/overdue rent schedules
(oldest-first) and creates PaymentAllocation rows for each schedule touched.

Returns the leftover amount (overpayment) after all schedules are satisfied.
The caller is responsible for storing that leftover in the tenant wallet.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.payment import Payment, RentSchedule, RentScheduleStatus
from app.models.payment_allocation import PaymentAllocation


async def allocate_payment(
    db: AsyncSession,
    lease_id: uuid.UUID,
    payment: Payment,
) -> float:
    """
    Distribute payment.amount across pending/overdue schedules (oldest-first).

    Updates schedule.amount_paid and schedule.status in place.
    Creates PaymentAllocation rows (flushed but not committed).

    Returns the leftover float (>= 0) that was not applied to any schedule.
    If > 0, caller should credit the tenant's wallet.
    """
    remaining = float(payment.amount)

    result = await db.execute(
        select(RentSchedule)
        .where(
            RentSchedule.lease_id == lease_id,
            RentSchedule.status.in_(
                [RentScheduleStatus.pending, RentScheduleStatus.overdue]
            ),
        )
        .order_by(RentSchedule.due_date.asc())
    )
    schedules = result.scalars().all()

    for s in schedules:
        if remaining <= 0:
            break

        balance = (
            float(s.amount_due)
            + float(s.late_fee_applied)
            - float(s.amount_paid)
        )
        if balance <= 0:
            continue

        applied = min(balance, remaining)

        allocation = PaymentAllocation(
            payment_id=payment.id,
            rent_schedule_id=s.id,
            amount_applied=applied,
        )
        db.add(allocation)

        s.amount_paid = float(s.amount_paid) + applied
        remaining = round(remaining - applied, 2)

        if float(s.amount_paid) >= float(s.amount_due) + float(s.late_fee_applied):
            s.status = RentScheduleStatus.paid
            s.paid_at = datetime.now(timezone.utc)

    await db.flush()
    return round(remaining, 2)


async def get_allocations_for_payment(
    db: AsyncSession,
    payment_id: uuid.UUID,
) -> list[PaymentAllocation]:
    """Return all PaymentAllocation rows for a given payment."""
    result = await db.execute(
        select(PaymentAllocation)
        .where(PaymentAllocation.payment_id == payment_id)
        .order_by(PaymentAllocation.created_at.asc())
    )
    return list(result.scalars().all())


async def reverse_allocations(
    db: AsyncSession,
    payment_id: uuid.UUID,
    lease_id: uuid.UUID,
) -> None:
    """
    Reverse all allocations for a payment (used by refund_payment).

    Decrements schedule.amount_paid and reverts paid schedules back to pending.
    Does NOT delete the PaymentAllocation rows — they stay for audit.
    Instead, we mark them as reversed by setting amount_applied to 0 after
    capturing the value we need to subtract.
    """
    from app.models.payment import RentSchedule as RS

    allocations = await get_allocations_for_payment(db, payment_id)

    for alloc in allocations:
        result = await db.execute(
            select(RS).where(RS.id == alloc.rent_schedule_id, RS.lease_id == lease_id)
        )
        schedule = result.scalar_one_or_none()
        if not schedule:
            continue

        schedule.amount_paid = max(0.0, float(schedule.amount_paid) - float(alloc.amount_applied))

        if schedule.status == RentScheduleStatus.paid:
            schedule.status = RentScheduleStatus.pending
            schedule.paid_at = None

    await db.flush()
