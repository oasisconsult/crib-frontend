"""
Rent ledger engine.

Single source of truth for the questions "how far back should this lease's
rent schedule reach, and what does its ledger say about 'paid through' / 'next
due'?" — covering both freshly-onboarded tenancies (where real payments flow
through the normal allocation engine) and imported/legacy tenancies (where we
must derive an assumed settlement position from the lease's recorded terms).

Two business rules have to be reconciled here:

  1. "Assume rent was settled up until the date the record was entered into
     Crib" — so a tenancy migrated mid-term doesn't surface years of bogus
     overdue history.
  2. "Factor in whatever advance payment was actually agreed at tenancy
     commencement, however many months it covers (1, 3, 6, 12...)".

These combine into one formula:

    paid_through_date = max(
        start_date + advance_months,   # what the advance payment alone covers
        assumed_baseline_date,         # "paid up to system entry" — older tenancies only
    )

`assumed_baseline_date` (= the lease's `created_at` date) only enters the
picture for tenancies that started long before they were entered into Crib —
see `_is_recent_tenancy`. For fresh tenancies the computed advance coverage is
trusted on its own, which is what produces results like:

    started 31 Mar 2026, 3 months advance -> paid through 30 Jun 2026
    started  1 May 2026, 3 months advance -> paid through  1 Aug 2026

Whether the advance is 3 or 6 months changes nothing about *how* this is
computed — `max()` already picks the larger, correct answer either way. The
"recent tenancy" threshold is a *separate* knob: it only decides whether
start_date can be trusted as the schedule-generation anchor, or whether an
older tenancy should be anchored to its system-entry date instead.

Both the live-onboarding path (real Payment -> allocate_payment) and the
import-backfill path (`backfill_import_settlement` below, which fabricates one
clearly-labelled, auditable Payment) ultimately settle schedules through the
exact same `allocate_payment` engine — there is no parallel "mark N schedules
paid" code path to drift out of sync with real payment handling.
"""

from __future__ import annotations

import calendar
from datetime import date, datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lease import Lease
from app.models.payment import Payment, PaymentCategory, PaymentMethod, PaymentStatus, RentSchedule
from app.models.property import Property, Unit
from app.services.ledger_service import create_ledger_entry
from app.services.payment_allocation_service import allocate_payment

DEFAULT_RECENT_TENANCY_THRESHOLD_MONTHS = 3


# ── Date helpers (mirror payment_service._add_months — kept local to avoid a
#    payment_service <-> rent_ledger_engine import cycle, since payment_service
#    calls into this module from generate_rent_schedules) ─────────────────────

def _add_months(d: date, months: int) -> date:
    """Add months to a date, clamping to the last day of the target month."""
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


async def _get_setting(key: str, default: str, db: AsyncSession) -> str:
    from app.models.system_setting import SystemSetting
    row = await db.get(SystemSetting, key)
    return row.value if row else default


# ── Configuration ─────────────────────────────────────────────────────────────

async def recent_tenancy_threshold_months(db: AsyncSession) -> int:
    """
    How many months may separate a tenancy's start_date from the date it was
    entered into Crib before it's treated as "older / migrated" rather than
    "fresh" (i.e. before we stop trusting start_date as the anchor and fall
    back to the system-entry baseline).
    """
    val = await _get_setting(
        "payments.recent_tenancy_threshold_months",
        str(DEFAULT_RECENT_TENANCY_THRESHOLD_MONTHS),
        db,
    )
    try:
        return max(1, int(val))
    except (TypeError, ValueError):
        return DEFAULT_RECENT_TENANCY_THRESHOLD_MONTHS


# ── Advance-months resolution (single canonical resolver) ────────────────────

async def resolve_advance_months(
    lease: Lease,
    unit: Unit | None,
    prop: Property | None,
    db: AsyncSession,
) -> int:
    """
    Effective advance-rent months for a lease.

    Precedence: lease override -> unit rules -> property rules -> system
    setting. Unit rules take priority over property rules — an agency may set
    a building-wide default in the property's rules but override it for a
    specific unit (e.g. a premium unit requiring more upfront).
    """
    if lease.advance_months is not None:
        return max(0, lease.advance_months)
    rules = (unit.rules if unit else None) or (prop.rules if prop else None) or {}
    for key in ("advanceRentMonths", "advancePaymentMonths", "advance_rent_months"):
        if key in rules:
            return max(0, int(rules[key]))
    val = await _get_setting("payments.advance_payment_months", "1", db)
    return max(0, int(val))


# ── Anchor / paid-through computation ─────────────────────────────────────────

def _is_recent_tenancy(lease: Lease, threshold_months: int) -> bool:
    """
    A tenancy is "recent" if it started within `threshold_months` of being
    entered into Crib — meaning we have full visibility of its real history
    and can trust start_date as the calculation anchor without leaning on an
    assumed baseline.
    """
    if not lease.created_at:
        return True
    entry_date = lease.created_at.date()
    return entry_date <= _add_months(lease.start_date, threshold_months)


def _assumed_baseline_date(lease: Lease) -> date:
    """'Rent assumed settled up until the record was entered into Crib.'"""
    return lease.created_at.date() if lease.created_at else lease.start_date


async def compute_paid_through_date(
    lease: Lease, advance_months: int, db: AsyncSession,
) -> date:
    """
    The date through which this lease's rent is considered settled at
    commencement — see module docstring for the reconciling formula.
    """
    advance_covers = _add_months(lease.start_date, advance_months)

    threshold = await recent_tenancy_threshold_months(db)
    if _is_recent_tenancy(lease, threshold):
        return advance_covers

    return max(advance_covers, _assumed_baseline_date(lease))


async def compute_schedule_anchor(lease: Lease, db: AsyncSession) -> date:
    """
    Where rolling-lease schedule generation should start from.

    Replaces the old, implicit `created_at` clamp with an explicit rule:
    fresh tenancies generate their full real history (start_date forward —
    later reconciled against real/assumed payments so nothing looks overdue
    that shouldn't be); older/migrated tenancies anchor to the later of
    start_date and the assumed system-entry baseline, so we never generate
    years of speculative backdated schedules.

    Note: only rolling leases (end_date is None) use this — fixed-term leases
    already generate their full, bounded term from start_date to end_date.
    """
    threshold = await recent_tenancy_threshold_months(db)
    if _is_recent_tenancy(lease, threshold):
        return lease.start_date
    return max(lease.start_date, _assumed_baseline_date(lease))


# ── Query API — single source of truth for "where does this ledger stand" ────

async def get_rent_status(lease: Lease, db: AsyncSession) -> dict:
    """
    Derive paid-through / next-due / overdue figures directly from the
    RentSchedule ledger (the source of truth) — never from advance_months
    math directly, so the result always reflects reality: partial payments,
    late fees, waived schedules, manual adjustments, all included.

    Returns a dict with:
      paid_through_date  — last day of the latest *consecutively* settled
                           period from the start (None if nothing settled yet)
      next_due_date      — due_date of the earliest unsettled schedule
      next_due_amount    — outstanding balance on that schedule
      overdue_amount     — total outstanding balance across all schedules
                           whose due_date has already passed
    """
    schedules = (await db.execute(
        select(RentSchedule)
        .where(RentSchedule.lease_id == lease.id)
        .order_by(RentSchedule.period_start.asc())
    )).scalars().all()

    today = date.today()
    paid_through_date: date | None = None
    next_due: RentSchedule | None = None
    overdue_amount = 0.0
    in_consecutive_run = True

    for s in schedules:
        balance = round(float(s.amount_due) + float(s.late_fee_applied) - float(s.amount_paid), 2)
        settled = balance <= 0

        if settled and in_consecutive_run:
            paid_through_date = s.period_end
            continue

        in_consecutive_run = False
        if settled:
            continue

        if next_due is None:
            next_due = s
        if s.due_date < today:
            overdue_amount = round(overdue_amount + balance, 2)

    next_due_amount = None
    if next_due is not None:
        next_due_amount = round(
            float(next_due.amount_due) + float(next_due.late_fee_applied) - float(next_due.amount_paid), 2
        )

    return {
        "paid_through_date": paid_through_date,
        "next_due_date": next_due.due_date if next_due else None,
        "next_due_amount": next_due_amount,
        "overdue_amount": overdue_amount,
    }


# ── Import backfill — settle imported leases through the real allocation engine ─

async def backfill_import_settlement(
    lease: Lease,
    advance_months: int,
    db: AsyncSession,
) -> Payment | None:
    """
    For an imported/legacy lease with no live payment trail in Crib: fabricate
    one clearly-labelled, auditable Payment representing "rent assumed settled
    through paid_through_date", and route it through the *standard* allocation
    engine — so RentSchedule rows end up marked paid exactly as they would for
    a real payment, with matching PaymentAllocation and LedgerEntry rows.

    The amount is computed as (number of schedule periods between the
    generation anchor and paid_through_date) x monthly_rent — which by
    construction exactly matches what those schedules expect, so the payment
    is fully consumed with no leftover/overpayment to handle.

    Idempotent — guarded by a deterministic idempotency_key, so re-running an
    import (or retrying a failed one) never double-applies the backfill.
    Requires that `generate_rent_schedules` has already run for this lease.
    """
    idem_key = f"import-settlement:{lease.id}"
    existing = await db.scalar(select(Payment).where(Payment.idempotency_key == idem_key))
    if existing:
        return existing

    # Fixed-term leases generate their full bounded term from start_date
    # regardless (see _build_schedules) — only rolling leases use a computed
    # anchor. Matching that here keeps `count` aligned with the schedules that
    # actually exist to be marked paid.
    anchor = await compute_schedule_anchor(lease, db) if lease.end_date is None else lease.start_date
    paid_through = await compute_paid_through_date(lease, advance_months, db)
    if paid_through < anchor:
        return None

    count = await db.scalar(
        select(func.count(RentSchedule.id)).where(
            RentSchedule.lease_id == lease.id,
            RentSchedule.period_start >= anchor,
            RentSchedule.period_start <= paid_through,
        )
    )
    count = int(count or 0)
    if count <= 0:
        return None

    amount = round(count * float(lease.monthly_rent), 2)

    threshold = await recent_tenancy_threshold_months(db)
    if _is_recent_tenancy(lease, threshold):
        description = (
            f"Imported tenancy — {advance_months} month(s) advance rent assumed paid "
            f"per the lease/property/unit terms at commencement, covering {count} "
            f"period(s) through {paid_through.isoformat()}."
        )
    else:
        description = (
            f"Imported tenancy — rent assumed settled through {paid_through.isoformat()} "
            f"({count} period(s)): {advance_months} month(s) advance per the lease terms, "
            f"combined with the assumption that rent was paid up to the date this "
            f"record was entered into Crib ({_assumed_baseline_date(lease).isoformat()})."
        )

    payment = Payment(
        organisation_id=lease.organisation_id,
        lease_id=lease.id,
        amount=amount,
        currency=lease.currency,
        category=PaymentCategory.rent,
        method=PaymentMethod.other,
        reference="System-derived — imported tenancy settlement",
        idempotency_key=idem_key,
        status=PaymentStatus.completed,
        paid_at=datetime.now(timezone.utc),
        notes=description,
    )
    db.add(payment)
    await db.flush()

    await allocate_payment(db, lease.id, payment)

    await create_ledger_entry(
        db,
        organisation_id=lease.organisation_id,
        lease_id=lease.id,
        entry_type="credit",
        amount=amount,
        reference_type="payment",
        reference_id=payment.id,
        description=description,
    )

    return payment
