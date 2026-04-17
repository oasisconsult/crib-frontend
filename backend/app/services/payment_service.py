"""
Business logic for the payments domain.

Public helpers called by lease_service on activation:
  generate_rent_schedules(lease, db)  — creates one RentSchedule per billing period
  create_deposit_record(lease, db)    — creates one Deposit row if deposit_amount > 0

Endpoint handlers:
  list_schedules / get_schedule / waive_schedule
  create_payment / list_payments / get_payment / confirm_payment / refund_payment
  list_late_fees / apply_late_fee / waive_late_fee
  get_deposit / return_deposit
  get_ledger
  export_payments_csv
"""

from __future__ import annotations

import calendar
import csv
import io
import uuid
from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lease import Lease
from app.models.property import Property, Unit
from app.models.tenant import Tenant as TenantModel
from app.models.payment import (
    Deposit,
    DepositStatus,
    LateFee,
    Payment,
    PaymentCategory,
    PaymentStatus,
    RentSchedule,
    RentScheduleStatus,
)
from app.schemas.payment import (
    DepositOut,
    DepositReturn,
    LateFeeOut,
    LateFeeWaive,
    LedgerOut,
    PaymentCreate,
    PaymentCreateFlat,
    PaymentOut,
    RentScheduleOut,
)
from app.services.ledger_service import create_ledger_entry
from app.services.payment_allocation_service import (
    allocate_payment,
    reverse_allocations,
)
from app.services.wallet_service import credit_wallet, debit_wallet


# ── Serialisers ────────────────────────────────────────────────────────────────

def _schedule_out(s: RentSchedule) -> RentScheduleOut:
    paid = float(s.amount_paid)
    due = float(s.amount_due)
    fee = float(s.late_fee_applied)
    return RentScheduleOut(
        id=str(s.id),
        organisation_id=str(s.organisation_id),
        lease_id=str(s.lease_id),
        period_start=str(s.period_start),
        period_end=str(s.period_end),
        due_date=str(s.due_date),
        amount_due=due,
        amount_paid=paid,
        late_fee_applied=fee,
        balance=round(due + fee - paid, 2),
        status=s.status if isinstance(s.status, str) else s.status.value,
        paid_at=s.paid_at.isoformat() if s.paid_at else None,
        notes=s.notes,
        created_at=s.created_at.isoformat(),
        updated_at=s.updated_at.isoformat(),
    )


def _payment_out(
    p: Payment,
    tenant_name: str | None = None,
    unit_name: str | None = None,
    property_name: str | None = None,
) -> PaymentOut:
    return PaymentOut(
        id=str(p.id),
        organisation_id=str(p.organisation_id),
        lease_id=str(p.lease_id),
        rent_schedule_id=str(p.rent_schedule_id) if p.rent_schedule_id else None,
        amount=float(p.amount),
        currency=p.currency,
        category=p.category if isinstance(p.category, str) else p.category.value,
        method=p.method if isinstance(p.method, str) else p.method.value,
        reference=p.reference,
        idempotency_key=p.idempotency_key,
        status=p.status if isinstance(p.status, str) else p.status.value,
        paid_at=p.paid_at.isoformat() if p.paid_at else None,
        notes=p.notes,
        failure_reason=p.failure_reason,
        retry_count=p.retry_count or 0,
        predicted_failure_score=p.predicted_failure_score,
        recommended_channel=p.recommended_channel,
        created_at=p.created_at.isoformat(),
        updated_at=p.updated_at.isoformat(),
        tenant_name=tenant_name,
        unit_name=unit_name,
        property_name=property_name,
    )


def _late_fee_out(f: LateFee) -> LateFeeOut:
    return LateFeeOut(
        id=str(f.id),
        organisation_id=str(f.organisation_id),
        lease_id=str(f.lease_id),
        rent_schedule_id=str(f.rent_schedule_id),
        fee_type=f.fee_type,
        calculated_amount=float(f.calculated_amount),
        applied_at=f.applied_at.isoformat(),
        waived=f.waived,
        waived_at=f.waived_at.isoformat() if f.waived_at else None,
        waived_reason=f.waived_reason,
        created_at=f.created_at.isoformat(),
        updated_at=f.updated_at.isoformat(),
    )


def _deposit_out(d: Deposit) -> DepositOut:
    return DepositOut(
        id=str(d.id),
        organisation_id=str(d.organisation_id),
        lease_id=str(d.lease_id),
        amount_held=float(d.amount_held),
        amount_returned=float(d.amount_returned),
        deductions=d.deductions or [],
        status=d.status if isinstance(d.status, str) else d.status.value,
        returned_at=d.returned_at.isoformat() if d.returned_at else None,
        notes=d.notes,
        created_at=d.created_at.isoformat(),
        updated_at=d.updated_at.isoformat(),
    )


# ── Internal helpers ───────────────────────────────────────────────────────────

def _add_months(d: date, months: int) -> date:
    """Add months to a date, clamping to the last day of the target month."""
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _due_date_for_month(year: int, month: int, day_of_month: int) -> date:
    """Return the due date for a given year/month, clamped to last day of month."""
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(day_of_month, last))


def _build_schedules(lease: Lease) -> list[RentSchedule]:
    """
    Build RentSchedule objects for a lease.

    For fixed-term leases: one schedule per calendar month from start_date to end_date.
    For rolling leases (end_date=None): generate 12 months forward from start_date.
    """
    start = lease.start_date
    end = lease.end_date  # None = rolling

    # Rolling: generate 12 months
    if end is None:
        end = _add_months(start, 12)

    schedules: list[RentSchedule] = []
    current = date(start.year, start.month, 1)  # align to first of month

    while current <= end:
        month_end_day = calendar.monthrange(current.year, current.month)[1]
        period_start = max(current, start)
        period_end = min(date(current.year, current.month, month_end_day), end)
        due = _due_date_for_month(current.year, current.month, lease.rent_day_of_month)

        schedules.append(RentSchedule(
            organisation_id=lease.organisation_id,
            lease_id=lease.id,
            period_start=period_start,
            period_end=period_end,
            due_date=due,
            amount_due=float(lease.monthly_rent),
            amount_paid=0,
            late_fee_applied=0,
            status=RentScheduleStatus.pending,
        ))

        # Move to first of next month
        current = _add_months(date(current.year, current.month, 1), 1)

    return schedules


async def _get_lease_checked(
    lease_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession
) -> Lease:
    from app.models.lease import Lease as L
    result = await db.execute(
        select(L).where(L.id == lease_id, L.organisation_id == org_id)
    )
    lease = result.scalar_one_or_none()
    if not lease:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lease not found")
    return lease


async def _get_schedule(
    schedule_id: uuid.UUID, lease_id: uuid.UUID, db: AsyncSession
) -> RentSchedule:
    result = await db.execute(
        select(RentSchedule).where(
            RentSchedule.id == schedule_id,
            RentSchedule.lease_id == lease_id,
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")
    return s


async def _get_payment(
    payment_id: uuid.UUID, lease_id: uuid.UUID, db: AsyncSession
) -> Payment:
    result = await db.execute(
        select(Payment).where(
            Payment.id == payment_id,
            Payment.lease_id == lease_id,
        )
    )
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    return p


async def _get_late_fee(
    fee_id: uuid.UUID, lease_id: uuid.UUID, db: AsyncSession
) -> LateFee:
    result = await db.execute(
        select(LateFee).where(
            LateFee.id == fee_id,
            LateFee.lease_id == lease_id,
        )
    )
    f = result.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Late fee not found")
    return f


def _calculate_late_fee_amount(lease: Lease, outstanding: float) -> float:
    """
    Calculate the late fee on the *outstanding* balance (amount_due + existing
    late_fee_applied - amount_paid), not on the original amount_due.

    Using outstanding ensures tenants who have partially paid receive a smaller
    fee proportional to what they actually owe.
    """
    if lease.late_fee_type == "percent":
        return round(float(lease.late_fee_value) / 100 * outstanding, 2)
    return float(lease.late_fee_value)  # flat fee is independent of balance


# ── Called by lease_service on activation ──────────────────────────────────────

async def generate_rent_schedules(lease: Lease, db: AsyncSession) -> None:
    """Auto-generate rent schedules when a lease is activated."""
    schedules = _build_schedules(lease)
    for s in schedules:
        db.add(s)
    # flush happens in the caller (activate_lease) after all side-effects


async def create_deposit_record(lease: Lease, db: AsyncSession) -> None:
    """
    Create a deposit row with amount_held=0 if the lease has a deposit_amount.

    Per design decision: amount_held is built up only when a Payment with
    category=deposit is confirmed, not pre-populated at activation.
    The deposit_amount on the lease tells us the expected total.
    """
    if not lease.deposit_amount or float(lease.deposit_amount) <= 0:
        return
    deposit = Deposit(
        organisation_id=lease.organisation_id,
        lease_id=lease.id,
        amount_held=0,  # starts at zero — funded by confirmed deposit payments
        amount_returned=0,
        deductions=[],
        status=DepositStatus.held,
    )
    db.add(deposit)


# ── Rent Schedules ─────────────────────────────────────────────────────────────

async def list_schedules(
    lease_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
    status_filter: str | None = None,
    page: int = 1,
    page_size: int = 24,
) -> dict:
    await _get_lease_checked(lease_id, org_id, db)

    q = select(RentSchedule).where(RentSchedule.lease_id == lease_id)
    if status_filter:
        q = q.where(RentSchedule.status == status_filter)

    total = await db.scalar(select(func.count()).select_from(q.subquery())) or 0
    q = q.order_by(RentSchedule.due_date.asc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    schedules = result.scalars().all()

    return {
        "data": [_schedule_out(s) for s in schedules],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "hasNext": (page * page_size) < total,
    }


async def get_schedule(
    schedule_id: uuid.UUID,
    lease_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> RentScheduleOut:
    await _get_lease_checked(lease_id, org_id, db)
    s = await _get_schedule(schedule_id, lease_id, db)
    return _schedule_out(s)


async def waive_schedule(
    schedule_id: uuid.UUID,
    lease_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> RentScheduleOut:
    await _get_lease_checked(lease_id, org_id, db)
    s = await _get_schedule(schedule_id, lease_id, db)
    if s.status == RentScheduleStatus.paid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot waive an already-paid schedule",
        )
    s.status = RentScheduleStatus.waived
    await db.flush()
    await db.refresh(s, attribute_names=["status", "updated_at"])
    return _schedule_out(s)


# ── Payments ───────────────────────────────────────────────────────────────────

async def create_payment(
    lease_id: uuid.UUID,
    body: PaymentCreate,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> PaymentOut:
    lease = await _get_lease_checked(lease_id, org_id, db)

    # Idempotency check
    if body.idempotency_key:
        existing = await db.scalar(
            select(Payment).where(Payment.idempotency_key == body.idempotency_key)
        )
        if existing:
            return _payment_out(existing)

    # Optionally validate a specific schedule if one is supplied.
    # Allocation happens at confirm time; this FK is kept for backward compat.
    schedule_id: uuid.UUID | None = None
    if body.rent_schedule_id:
        schedule_id = uuid.UUID(body.rent_schedule_id)
        schedule = await _get_schedule(schedule_id, lease_id, db)
        if schedule.status == RentScheduleStatus.waived:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot record payment against a waived schedule",
            )

    now = datetime.now(timezone.utc)
    payment = Payment(
        organisation_id=org_id,
        lease_id=lease_id,
        rent_schedule_id=schedule_id,
        amount=body.amount,
        currency=body.currency or lease.currency,
        category=body.category,
        method=body.method,
        reference=body.reference,
        idempotency_key=body.idempotency_key,
        status=PaymentStatus.initiated,   # v4: all payments start at initiated
        paid_at=body.paid_at or now,
        notes=body.notes,
    )
    db.add(payment)
    await db.flush()
    await db.refresh(payment, attribute_names=["status", "category", "method", "updated_at", "created_at"])
    return _payment_out(payment)


async def list_payments(
    lease_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
    status_filter: str | None = None,
    category: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    await _get_lease_checked(lease_id, org_id, db)

    q = select(Payment).where(Payment.lease_id == lease_id)
    if status_filter:
        q = q.where(Payment.status == status_filter)
    if category:
        q = q.where(Payment.category == category)

    total = await db.scalar(select(func.count()).select_from(q.subquery())) or 0
    q = q.order_by(Payment.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    payments = result.scalars().all()

    return {
        "data": [_payment_out(p) for p in payments],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "hasNext": (page * page_size) < total,
    }


async def get_payment(
    payment_id: uuid.UUID,
    lease_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> PaymentOut:
    await _get_lease_checked(lease_id, org_id, db)
    p = await _get_payment(payment_id, lease_id, db)
    return _payment_out(p)


async def confirm_payment(
    payment_id: uuid.UUID,
    lease_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> PaymentOut:
    """
    Confirm a pending payment.

    Steps (in order, all in one transaction):
      1. Mark payment as confirmed.
      2. If category == deposit: credit deposit.amount_held.
      3. If category == rent / late_fee / other: run allocation engine
         (distributes across pending/overdue schedules oldest-first).
      4. If there is leftover (overpayment): credit the tenant's wallet
         and write an overpayment ledger entry.
      5. Write a credit ledger entry for the full payment amount.

    The tenant_id is resolved from the lease's current_tenant_id.
    """
    lease = await _get_lease_checked(lease_id, org_id, db)
    p = await _get_payment(payment_id, lease_id, db)

    from app.services.payment_state_machine import can_be_confirmed, advance_to_completed, is_success
    current = p.status if isinstance(p.status, PaymentStatus) else PaymentStatus(p.status)
    if is_success(current):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Payment is already confirmed (status: '{p.status}')",
        )
    if not can_be_confirmed(current):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot confirm a payment with status '{p.status}'",
        )

    # 1. Set paid_at before running state machine transitions
    if not p.paid_at:
        p.paid_at = datetime.now(timezone.utc)
        await db.flush()

    # 2. Handle deposit payments — credit amount_held directly
    if p.category == PaymentCategory.deposit:
        deposit = await db.scalar(
            select(Deposit).where(Deposit.lease_id == lease_id)
        )
        if deposit:
            deposit.amount_held = round(float(deposit.amount_held) + float(p.amount), 2)
            await db.flush()
        await create_ledger_entry(
            db,
            organisation_id=org_id,
            lease_id=lease_id,
            entry_type="credit",
            amount=float(p.amount),
            reference_type="deposit",
            reference_id=p.id,
            description=f"Deposit payment via {p.method}",
        )

    else:
        # 3. Allocate across pending/overdue schedules (oldest-first)
        overpayment = await allocate_payment(db, lease_id, p)

        # 4. Handle overpayment → tenant wallet
        if overpayment > 0 and lease.tenant_id:
            await credit_wallet(
                db,
                tenant_id=lease.tenant_id,
                organisation_id=org_id,
                amount=overpayment,
                reference_type="overpayment",
                reference_id=p.id,
                description=f"Overpayment credit from payment {p.id}",
            )
            await create_ledger_entry(
                db,
                organisation_id=org_id,
                lease_id=lease_id,
                entry_type="credit",
                amount=overpayment,
                reference_type="overpayment",
                reference_id=p.id,
                description=f"Overpayment of {overpayment} credited to wallet",
            )

        # 5. Main credit ledger entry for the full payment
        await create_ledger_entry(
            db,
            organisation_id=org_id,
            lease_id=lease_id,
            entry_type="credit",
            amount=float(p.amount),
            reference_type="payment",
            reference_id=p.id,
            description=f"Payment confirmed via {p.method}",
        )

    # Advance payment through reconciled → allocated → completed via state machine
    await advance_to_completed(p, db)

    await db.refresh(p, attribute_names=["status", "paid_at", "updated_at"])

    # ── Onboarding side-effect: advance lease if all onboarding payments confirmed ──
    # Check if this payment is an onboarding payment; if so, attempt to advance
    # the lease from payment_pending → payment_secured.
    if lease.onboarding_payment_ids and str(p.id) in lease.onboarding_payment_ids:
        from app.services.onboarding_service import _maybe_secure_payment
        await _maybe_secure_payment(lease, db)

    # Publish event (non-fatal — failure is swallowed inside publish_event)
    from app.core.events import emit_payment_confirmed
    await emit_payment_confirmed(
        payment_id=str(p.id),
        lease_id=str(lease_id),
        organisation_id=str(org_id),
        amount=float(p.amount),
        currency=p.currency,
        category=p.category,
        method=p.method,
    )

    return _payment_out(p)


async def refund_payment(
    payment_id: uuid.UUID,
    lease_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> PaymentOut:
    """
    Refund a confirmed payment.

    Steps:
      1. Mark payment as refunded.
      2. Reverse all PaymentAllocation rows (decrement schedule.amount_paid,
         revert paid schedules to pending).
      3. If it was a deposit payment: decrement deposit.amount_held.
      4. Reverse any overpayment wallet credit that was applied at confirm time.
      5. Write a debit ledger entry (reversal).
    """
    lease = await _get_lease_checked(lease_id, org_id, db)
    p = await _get_payment(payment_id, lease_id, db)

    from app.services.payment_state_machine import can_be_refunded, transition as sm_transition
    current = p.status if isinstance(p.status, PaymentStatus) else PaymentStatus(p.status)
    if not can_be_refunded(current):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only completed payments can be refunded (current: '{p.status}')",
        )

    # 1. Mark refunded via state machine
    await sm_transition(p, PaymentStatus.refunded, db, reason="Refund requested", actor="refund_payment")

    # 2. Reverse schedule allocations; returns how much was NOT allocated
    #    (i.e. the overpayment that was credited to the wallet at confirm time)
    from app.services.payment_allocation_service import get_overpayment_for_payment
    overpayment = await get_overpayment_for_payment(db, payment_id=p.id)

    await reverse_allocations(db, payment_id=p.id, lease_id=lease_id)

    # 3. Reverse deposit credit
    if p.category == PaymentCategory.deposit:
        deposit = await db.scalar(
            select(Deposit).where(Deposit.lease_id == lease_id)
        )
        if deposit:
            deposit.amount_held = max(0.0, float(deposit.amount_held) - float(p.amount))
            await db.flush()

    # 4. Reverse wallet overpayment credit (if any was applied at confirm time)
    if overpayment > 0 and lease.tenant_id:
        from app.models.wallet import TenantWallet
        wallet = await db.scalar(
            select(TenantWallet).where(TenantWallet.tenant_id == lease.tenant_id)
        )
        if wallet and float(wallet.balance) >= overpayment:
            await debit_wallet(
                db,
                tenant_id=lease.tenant_id,
                organisation_id=org_id,
                amount=overpayment,
                reference_type="refund_reversal",
                reference_id=p.id,
                description=f"Wallet overpayment reversal for refunded payment {p.id}",
            )
            await create_ledger_entry(
                db,
                organisation_id=org_id,
                lease_id=lease_id,
                entry_type="debit",
                amount=overpayment,
                reference_type="refund_reversal",
                reference_id=p.id,
                description=f"Wallet overpayment reversed on refund of payment {p.id}",
            )

    # 5. Debit ledger entry (full payment reversal)
    await create_ledger_entry(
        db,
        organisation_id=org_id,
        lease_id=lease_id,
        entry_type="debit",
        amount=float(p.amount),
        reference_type="refund",
        reference_id=p.id,
        description=f"Refund of payment {p.id}",
    )

    await db.flush()
    await db.refresh(p, attribute_names=["status", "updated_at"])

    # Publish event (non-fatal)
    from app.core.events import emit_payment_refunded
    await emit_payment_refunded(
        payment_id=str(p.id),
        lease_id=str(lease_id),
        organisation_id=str(org_id),
        amount=float(p.amount),
    )

    return _payment_out(p)


# ── Late Fees ─────────────────────────────────────────────��────────────────────

async def list_late_fees(
    lease_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> list[LateFeeOut]:
    await _get_lease_checked(lease_id, org_id, db)
    result = await db.execute(
        select(LateFee).where(LateFee.lease_id == lease_id).order_by(LateFee.applied_at.asc())
    )
    return [_late_fee_out(f) for f in result.scalars().all()]


async def apply_late_fee(
    schedule_id: uuid.UUID,
    lease_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> LateFeeOut:
    lease = await _get_lease_checked(lease_id, org_id, db)
    schedule = await _get_schedule(schedule_id, lease_id, db)

    if schedule.status not in (RentScheduleStatus.overdue, RentScheduleStatus.pending):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Late fee can only be applied to pending or overdue schedules",
        )

    # Check not already applied
    existing = await db.scalar(
        select(LateFee).where(LateFee.rent_schedule_id == schedule_id)
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Late fee already applied to this schedule",
        )

    outstanding = (
        float(schedule.amount_due)
        + float(schedule.late_fee_applied)
        - float(schedule.amount_paid)
    )
    amount = _calculate_late_fee_amount(lease, outstanding)
    now = datetime.now(timezone.utc)

    fee = LateFee(
        organisation_id=org_id,
        lease_id=lease_id,
        rent_schedule_id=schedule_id,
        fee_type=lease.late_fee_type,
        calculated_amount=amount,
        applied_at=now,
        waived=False,
    )
    db.add(fee)

    # Reflect on schedule
    schedule.late_fee_applied = float(schedule.late_fee_applied) + amount
    if schedule.status == RentScheduleStatus.pending:
        schedule.status = RentScheduleStatus.overdue

    await db.flush()
    await db.refresh(fee, attribute_names=["updated_at", "created_at"])
    return _late_fee_out(fee)


async def waive_late_fee(
    fee_id: uuid.UUID,
    lease_id: uuid.UUID,
    org_id: uuid.UUID,
    body: LateFeeWaive,
    db: AsyncSession,
) -> LateFeeOut:
    await _get_lease_checked(lease_id, org_id, db)
    fee = await _get_late_fee(fee_id, lease_id, db)

    if fee.waived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Late fee is already waived",
        )

    now = datetime.now(timezone.utc)
    fee.waived = True
    fee.waived_at = now
    fee.waived_reason = body.reason

    # Remove late fee from schedule total
    schedule = await _get_schedule(fee.rent_schedule_id, lease_id, db)
    schedule.late_fee_applied = max(0.0, float(schedule.late_fee_applied) - float(fee.calculated_amount))

    await db.flush()
    await db.refresh(fee, attribute_names=["waived", "waived_at", "updated_at"])
    return _late_fee_out(fee)


# ── Deposit ────────────────────────────────────────────────────────────────────

async def get_deposit(
    lease_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> DepositOut:
    await _get_lease_checked(lease_id, org_id, db)
    result = await db.scalar(
        select(Deposit).where(Deposit.lease_id == lease_id)
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No deposit for this lease")
    return _deposit_out(result)


async def return_deposit(
    lease_id: uuid.UUID,
    body: DepositReturn,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> DepositOut:
    await _get_lease_checked(lease_id, org_id, db)
    deposit = await db.scalar(
        select(Deposit).where(Deposit.lease_id == lease_id)
    )
    if not deposit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No deposit for this lease")

    if deposit.status in (DepositStatus.fully_returned, DepositStatus.forfeited):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Deposit is already {deposit.status}",
        )

    total_deducted = sum(d.amount for d in (body.deductions or []))
    net_return = body.amount_returned

    if net_return + total_deducted > float(deposit.amount_held):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Return amount + deductions cannot exceed amount held",
        )

    deposit.amount_returned = float(deposit.amount_returned) + net_return
    if body.deductions:
        existing = list(deposit.deductions or [])
        existing.extend([d.model_dump() for d in body.deductions])
        deposit.deductions = existing
    if body.notes:
        deposit.notes = body.notes

    if deposit.amount_returned >= float(deposit.amount_held):
        deposit.status = DepositStatus.fully_returned
        deposit.returned_at = datetime.now(timezone.utc)
    else:
        deposit.status = DepositStatus.partially_returned

    await db.flush()
    await db.refresh(deposit, attribute_names=["status", "amount_returned", "returned_at", "updated_at"])
    return _deposit_out(deposit)


# ── Ledger ─────────────────────────────────────────────────────────────────────

async def get_ledger(
    lease_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> LedgerOut:
    lease = await _get_lease_checked(lease_id, org_id, db)

    # Schedule aggregates
    sched_result = await db.execute(
        select(
            func.sum(RentSchedule.amount_due).label("total_due"),
            func.sum(RentSchedule.amount_paid).label("total_paid"),
            func.sum(RentSchedule.late_fee_applied).label("total_fees"),
            func.count(RentSchedule.id).filter(
                RentSchedule.status == RentScheduleStatus.overdue
            ).label("overdue_count"),
        ).where(RentSchedule.lease_id == lease_id)
    )
    row = sched_result.one()
    total_due = float(row.total_due or 0)
    total_paid = float(row.total_paid or 0)
    total_fees = float(row.total_fees or 0)
    overdue_count = int(row.overdue_count or 0)

    # Late fee waived total
    fee_result = await db.execute(
        select(func.sum(LateFee.calculated_amount)).where(
            LateFee.lease_id == lease_id, LateFee.waived.is_(True)
        )
    )
    fees_waived = float(fee_result.scalar() or 0)

    # Payment confirmed total
    pay_result = await db.execute(
        select(
            func.count(Payment.id).label("total"),
            func.sum(Payment.amount).filter(
                Payment.status == PaymentStatus.confirmed
            ).label("confirmed_total"),
        ).where(Payment.lease_id == lease_id)
    )
    pay_row = pay_result.one()

    # Deposit
    deposit = await db.scalar(select(Deposit).where(Deposit.lease_id == lease_id))

    return LedgerOut(
        lease_id=str(lease_id),
        currency=lease.currency,
        total_rent_due=total_due,
        total_rent_paid=total_paid,
        total_rent_outstanding=round(total_due - total_paid, 2),
        overdue_schedules=overdue_count,
        total_late_fees=total_fees,
        total_late_fees_waived=fees_waived,
        deposit_held=float(deposit.amount_held) if deposit else None,
        deposit_returned=float(deposit.amount_returned) if deposit else None,
        deposit_status=deposit.status if deposit else None,
        total_payments=int(pay_row.total or 0),
        total_confirmed=float(pay_row.confirmed_total or 0),
    )


# ── CSV Export ─────────────────────────────────────────────────────────────────

async def export_payments_csv(
    lease_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> str:
    """Return a CSV string of all confirmed payments for a lease.

    Admin can configure included columns via organisation.settings.payments.statementColumns.
    Defaults to all columns if not configured.
    """
    from app.models.organisation import Organisation
    lease = await _get_lease_checked(lease_id, org_id, db)

    org = await db.scalar(select(Organisation).where(Organisation.id == org_id))
    payment_settings = (org.settings or {}).get("payments", {}) if org else {}
    default_cols = ["period", "due_date", "amount_due", "amount_paid", "late_fee",
                    "balance", "schedule_status", "payment_id", "payment_amount",
                    "method", "reference", "payment_status", "paid_at"]
    columns = payment_settings.get("statementColumns", default_cols)

    # Fetch schedules with their payments
    sched_result = await db.execute(
        select(RentSchedule)
        .where(RentSchedule.lease_id == lease_id)
        .order_by(RentSchedule.due_date.asc())
    )
    schedules = sched_result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(columns)

    for s in schedules:
        # Fetch confirmed payments for this schedule
        pay_result = await db.execute(
            select(Payment).where(
                Payment.rent_schedule_id == s.id,
                Payment.status == PaymentStatus.confirmed,
            ).order_by(Payment.paid_at.asc())
        )
        payments = pay_result.scalars().all()

        if payments:
            for p in payments:
                row = _build_csv_row(s, p, columns, lease.currency)
                writer.writerow(row)
        else:
            row = _build_csv_row(s, None, columns, lease.currency)
            writer.writerow(row)

    return output.getvalue()


# ── Flat (org-level) queries ───────────────────────────────────────────────────

async def list_payments_org(
    org_id: uuid.UUID,
    db: AsyncSession,
    status_filters: list[str] | None = None,
    category: str | None = None,
    search: str | None = None,
    lease_id_filter: uuid.UUID | None = None,
    tenant_id_filter: uuid.UUID | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    from app.models.lease import Lease
    q = select(Payment).where(Payment.organisation_id == org_id)
    if status_filters:
        q = q.where(Payment.status.in_(status_filters))
    if category:
        q = q.where(Payment.category == category)
    if search:
        term = f"%{search}%"
        q = q.where(Payment.reference.ilike(term))
    if lease_id_filter:
        q = q.where(Payment.lease_id == lease_id_filter)
    if tenant_id_filter:
        # from app.models.lease import Lease
        q = q.join(Lease, Lease.id == Payment.lease_id).where(
            Lease.tenant_id == tenant_id_filter
        )

    total = await db.scalar(select(func.count()).select_from(q.subquery())) or 0
    q = q.order_by(Payment.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    payments = result.scalars().all()

    # Batch-fetch tenant/unit/property names via lease join
    lease_ids = {p.lease_id for p in payments}
    lease_map: dict[uuid.UUID, Lease] = {}
    tenant_map: dict[uuid.UUID, str] = {}
    unit_map: dict[uuid.UUID, str] = {}
    property_map: dict[uuid.UUID, str] = {}

    if lease_ids:
        leases = (await db.execute(select(Lease).where(Lease.id.in_(lease_ids)))).scalars().all()
        lease_map = {l.id: l for l in leases}

        tenant_ids  = {l.tenant_id for l in leases if l.tenant_id}
        unit_ids    = {l.unit_id   for l in leases if l.unit_id}
        prop_ids    = {l.property_id for l in leases if l.property_id}

        if tenant_ids:
            tenants = (await db.execute(select(TenantModel).where(TenantModel.id.in_(tenant_ids)))).scalars().all()
            tenant_map = {t.id: f"{t.first_name} {t.last_name}" for t in tenants}
        if unit_ids:
            units = (await db.execute(select(Unit).where(Unit.id.in_(unit_ids)))).scalars().all()
            unit_map = {u.id: u.name for u in units}
        if prop_ids:
            props = (await db.execute(select(Property).where(Property.id.in_(prop_ids)))).scalars().all()
            property_map = {pr.id: pr.name for pr in props}

    def _enrich(p: Payment) -> PaymentOut:
        lease = lease_map.get(p.lease_id)
        tenant_name = tenant_map.get(lease.tenant_id) if lease and lease.tenant_id else None
        unit_name   = unit_map.get(lease.unit_id)     if lease and lease.unit_id   else None
        prop_name   = property_map.get(lease.property_id) if lease and lease.property_id else None
        return _payment_out(p, tenant_name=tenant_name, unit_name=unit_name, property_name=prop_name)

    return {
        "data": [_enrich(p) for p in payments],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "hasNext": (page * page_size) < total,
        "totalPages": (total + page_size - 1) // page_size if page_size > 0 else 0,
    }


async def get_payment_by_org(
    payment_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> PaymentOut:
    p = await db.scalar(
        select(Payment).where(Payment.id == payment_id, Payment.organisation_id == org_id)
    )
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    tenant_name: str | None = None
    unit_name: str | None = None
    property_name: str | None = None
    lease = await db.scalar(select(Lease).where(Lease.id == p.lease_id))
    if lease:
        if lease.tenant_id:
            t = await db.scalar(select(TenantModel).where(TenantModel.id == lease.tenant_id))
            tenant_name = f"{t.first_name} {t.last_name}" if t else None
        if lease.unit_id:
            u = await db.scalar(select(Unit).where(Unit.id == lease.unit_id))
            unit_name = u.name if u else None
        if lease.property_id:
            pr = await db.scalar(select(Property).where(Property.id == lease.property_id))
            property_name = pr.name if pr else None
    return _payment_out(p, tenant_name=tenant_name, unit_name=unit_name, property_name=property_name)


async def create_payment_flat(
    body: PaymentCreateFlat,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> PaymentOut:
    """Create a payment with lease_id supplied in the request body."""
    lease_id = uuid.UUID(body.lease_id)
    nested = PaymentCreate(
        rent_schedule_id=body.rent_schedule_id,
        amount=body.amount,
        currency=body.currency,
        category=body.category,
        method=body.method,
        reference=body.reference,
        idempotency_key=body.idempotency_key,
        paid_at=body.paid_at,
        notes=body.notes,
    )
    return await create_payment(lease_id, nested, org_id, db)


async def confirm_payment_by_org(
    payment_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> PaymentOut:
    p = await db.scalar(
        select(Payment).where(Payment.id == payment_id, Payment.organisation_id == org_id)
    )
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")

    from app.services.payment_state_machine import can_be_confirmed, advance_to_completed, is_success as _is_success
    _current = p.status if isinstance(p.status, PaymentStatus) else PaymentStatus(p.status)
    if _is_success(_current):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Payment is already confirmed (status: '{p.status}')",
        )
    if not can_be_confirmed(_current):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot confirm a payment with status '{p.status}'",
        )

    if not p.paid_at:
        p.paid_at = datetime.now(timezone.utc)
        await db.flush()

    if p.rent_schedule_id:
        schedule = await _get_schedule(p.rent_schedule_id, p.lease_id, db)
        schedule.amount_paid = float(schedule.amount_paid) + float(p.amount)
        if float(schedule.amount_paid) >= float(schedule.amount_due) + float(schedule.late_fee_applied):
            schedule.status = RentScheduleStatus.paid
            schedule.paid_at = datetime.now(timezone.utc)

    await advance_to_completed(p, db)
    await db.refresh(p, attribute_names=["status", "updated_at"])
    return _payment_out(p)


async def refund_payment_by_org(
    payment_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> PaymentOut:
    p = await db.scalar(
        select(Payment).where(Payment.id == payment_id, Payment.organisation_id == org_id)
    )
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")

    from app.services.payment_state_machine import can_be_refunded as _can_refund, transition as _sm_transition
    _cur = p.status if isinstance(p.status, PaymentStatus) else PaymentStatus(p.status)
    if not _can_refund(_cur):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only completed payments can be refunded (current: '{p.status}')",
        )
    await _sm_transition(p, PaymentStatus.refunded, db, reason="Refund requested", actor="refund_payment_by_org")

    if p.rent_schedule_id:
        schedule = await _get_schedule(p.rent_schedule_id, p.lease_id, db)
        schedule.amount_paid = max(0.0, float(schedule.amount_paid) - float(p.amount))
        if schedule.status == RentScheduleStatus.paid:
            schedule.status = RentScheduleStatus.pending
            schedule.paid_at = None
    await db.flush()
    await db.refresh(p, attribute_names=["status", "updated_at"])
    return _payment_out(p)


async def list_schedules_org(
    org_id: uuid.UUID,
    db: AsyncSession,
    status_filter: str | None = None,
    lease_id_filter: uuid.UUID | None = None,
    page: int = 1,
    page_size: int = 24,
) -> dict:
    q = select(RentSchedule).where(RentSchedule.organisation_id == org_id)
    if status_filter:
        q = q.where(RentSchedule.status == status_filter)
    if lease_id_filter:
        q = q.where(RentSchedule.lease_id == lease_id_filter)

    total = await db.scalar(select(func.count()).select_from(q.subquery())) or 0
    q = q.order_by(RentSchedule.due_date.asc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)

    return {
        "data": [_schedule_out(s) for s in result.scalars().all()],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "hasNext": (page * page_size) < total,
        "totalPages": (total + page_size - 1) // page_size if page_size > 0 else 0,
    }


async def list_late_fees_org(
    org_id: uuid.UUID,
    db: AsyncSession,
    lease_id_filter: uuid.UUID | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    q = select(LateFee).where(LateFee.organisation_id == org_id)
    if lease_id_filter:
        q = q.where(LateFee.lease_id == lease_id_filter)

    total = await db.scalar(select(func.count()).select_from(q.subquery())) or 0
    q = q.order_by(LateFee.applied_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)

    return {
        "data": [_late_fee_out(f) for f in result.scalars().all()],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "hasNext": (page * page_size) < total,
        "totalPages": (total + page_size - 1) // page_size if page_size > 0 else 0,
    }


def _build_csv_row(
    s: RentSchedule,
    p: Payment | None,
    columns: list[str],
    currency: str,
) -> list:
    balance = round(float(s.amount_due) + float(s.late_fee_applied) - float(s.amount_paid), 2)
    mapping = {
        "period": f"{s.period_start} – {s.period_end}",
        "due_date": str(s.due_date),
        "amount_due": float(s.amount_due),
        "amount_paid": float(s.amount_paid),
        "late_fee": float(s.late_fee_applied),
        "balance": balance,
        "schedule_status": s.status,
        "payment_id": str(p.id) if p else "",
        "payment_amount": float(p.amount) if p else "",
        "method": p.method if p else "",
        "reference": p.reference if p else "",
        "payment_status": p.status if p else "",
        "paid_at": p.paid_at.isoformat() if p and p.paid_at else "",
        "currency": currency,
    }
    return [mapping.get(col, "") for col in columns]
