"""
Analytics queries for the dashboard.

Endpoints served:
  GET /analytics/dashboard  — DashboardStats
  GET /analytics/occupancy  — OccupancyDataPoint[] (monthly)
  GET /analytics/revenue    — RevenueDataPoint[] (monthly)
  GET /analytics/cashflow   — CashFlowDataPoint[] (monthly)
"""

from __future__ import annotations

import uuid
from calendar import month_abbr, monthrange
from datetime import date, datetime, timezone  # date used in occupancy/revenue helpers

from sqlalchemy import func, or_, select, true as sql_true
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inspection import Inspection, InspectionState, MaintenanceIssue, MaintenanceState
from app.models.landlord_invite import LandlordPropertyAccess
from app.models.lease import Lease, LeaseStatus
from app.models.payment import Payment, PaymentStatus, RentSchedule, RentScheduleStatus
from app.models.property import Property, Unit, UnitStatus
from app.models.tenant import OnboardingState, Tenant, TenantStatus  # OnboardingState used for pending count


# ── Helpers ────────────────────────────────────────────────────────────────────

def _month_label(year: int, month: int) -> str:
    return f"{month_abbr[month]} {year}"


def _months_back(n: int) -> list[tuple[int, int]]:
    """Return list of (year, month) tuples for the last n months, oldest first."""
    now = datetime.now(timezone.utc)
    result = []
    year, month = now.year, now.month
    for _ in range(n):
        result.append((year, month))
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    return list(reversed(result))


# ── Dashboard stats ────────────────────────────────────────────────────────────

async def get_property_ids_for_profile(
    profile_id: uuid.UUID, db: AsyncSession
) -> list[uuid.UUID]:
    """
    Return the property IDs a profile has been granted explicit access to via
    LandlordPropertyAccess.  Used for both read-only landlords and caretakers.
    """
    rows = await db.execute(
        select(LandlordPropertyAccess.property_id).where(
            LandlordPropertyAccess.landlord_profile_id == profile_id
        )
    )
    return [r[0] for r in rows]


# Keep the old private name as an alias so existing callers still work.
_landlord_property_ids = get_property_ids_for_profile


async def get_dashboard_stats(
    org_id: uuid.UUID | None,
    db: AsyncSession,
    landlord_profile_id: uuid.UUID | None = None,
) -> dict:
    # For landlords, scope all queries to their allowed properties
    prop_ids: list[uuid.UUID] | None = None
    if landlord_profile_id is not None:
        prop_ids = await _landlord_property_ids(landlord_profile_id, db)

    # Properties / Units
    unit_q = (
        select(
            func.count(Unit.id).label("total"),
            func.count(Unit.id).filter(Unit.status == UnitStatus.occupied).label("occupied"),
            func.count(Unit.id).filter(Unit.status == UnitStatus.available).label("available"),
        ).join(Unit.property).where(
            Unit.property.has(organisation_id=org_id) if org_id is not None else sql_true(),
        )
    )
    if prop_ids is not None:
        unit_q = unit_q.where(Unit.property_id.in_(prop_ids))
    units_row = (await db.execute(unit_q)).one()
    total_units = int(units_row.total or 0)
    occupied_units = int(units_row.occupied or 0)

    # ── Whole properties (no DB units) — include in occupancy ────────────────
    # Properties created as isSingleUnit (or any property with 0 units) are
    # invisible to the unit-based occupancy query. Count each as 1 unit and
    # treat it as "occupied" if it has an active lease.
    whole_prop_q = (
        select(
            func.count(Property.id).label("total"),
            func.count(Property.id).filter(
                Property.id.in_(
                    select(Lease.property_id).where(
                        Lease.status == LeaseStatus.active,
                        Lease.property_id.isnot(None),
                    )
                )
            ).label("occupied"),
        ).where(
            Property.deleted_at.is_(None),
            # Only properties that have NO units at all
            ~Property.id.in_(
                select(Unit.property_id).where(Unit.property_id.isnot(None)).distinct()
            ),
        )
    )
    if org_id is not None:
        whole_prop_q = whole_prop_q.where(Property.organisation_id == org_id)
    if prop_ids is not None:
        whole_prop_q = whole_prop_q.where(Property.id.in_(prop_ids))
    whole_row = (await db.execute(whole_prop_q)).one()
    # Add whole-property "virtual units" to the totals
    total_units += int(whole_row.total or 0)
    occupied_units += int(whole_row.occupied or 0)

    occupancy_rate = round(occupied_units / total_units * 100, 1) if total_units > 0 else 0.0

    # Count properties directly from the properties table — NOT via units.
    # Counting via units misses properties that have no units yet (e.g. freshly
    # created properties or isSingleUnit properties before their unit is added).
    prop_count_q = select(func.count(Property.id)).where(
        Property.deleted_at.is_(None),
    )
    if org_id is not None:
        prop_count_q = prop_count_q.where(Property.organisation_id == org_id)
    if prop_ids is not None:
        prop_count_q = prop_count_q.where(Property.id.in_(prop_ids))
    prop_count = await db.scalar(prop_count_q) or 0

    # Tenants — scoped to landlord's properties via their current lease's property
    tenant_q = select(
        func.count(Tenant.id).label("total"),
        func.count(Tenant.id).filter(Tenant.status == TenantStatus.active).label("active"),
        func.count(Tenant.id).filter(
            Tenant.onboarding_state.in_([
                OnboardingState.invited,
                OnboardingState.started,
                OnboardingState.submitted,
            ])
        ).label("pending"),
    ).where(Tenant.organisation_id == org_id if org_id is not None else sql_true())
    if prop_ids is not None:
        tenant_q = tenant_q.where(
            Tenant.id.in_(
                select(Lease.tenant_id).where(
                    Lease.property_id.in_(prop_ids),
                    Lease.tenant_id.isnot(None),
                )
            )
        )
    tenants_row = (await db.execute(tenant_q)).one()

    # Monthly revenue (confirmed/completed payments this calendar month)
    _success_statuses = [PaymentStatus.confirmed, PaymentStatus.completed]
    rev_q = select(func.sum(Payment.amount)).where(
        Payment.organisation_id == org_id if org_id is not None else sql_true(),
        Payment.status.in_(_success_statuses),
        func.date_trunc("month", Payment.paid_at) == func.date_trunc("month", func.now()),
    )
    if prop_ids is not None:
        rev_q = rev_q.where(
            Payment.lease_id.in_(
                select(Lease.id).where(Lease.property_id.in_(prop_ids))
            )
        )
    monthly_rev = await db.scalar(rev_q) or 0

    # Expected rent this month (sum of amount_due for schedules due in current calendar month)
    expected_q = select(
        func.coalesce(func.sum(RentSchedule.amount_due), 0).label("expected"),
    ).where(
        RentSchedule.organisation_id == org_id if org_id is not None else sql_true(),
        func.date_trunc("month", RentSchedule.due_date) == func.date_trunc("month", func.current_date()),
    )
    if prop_ids is not None:
        expected_q = expected_q.where(
            RentSchedule.lease_id.in_(
                select(Lease.id).where(Lease.property_id.in_(prop_ids))
            )
        )
    expected_row = (await db.execute(expected_q)).one()
    expected_monthly = float(expected_row.expected or 0)

    # Overdue schedules
    overdue_q = select(
        func.count(RentSchedule.id).label("count"),
        func.coalesce(func.sum(
            RentSchedule.amount_due + RentSchedule.late_fee_applied - RentSchedule.amount_paid
        ), 0).label("overdue_amount"),
    ).where(
        RentSchedule.organisation_id == org_id if org_id is not None else sql_true(),
        or_(
            RentSchedule.status == RentScheduleStatus.overdue,
            (RentSchedule.status == RentScheduleStatus.pending) & (RentSchedule.due_date < date.today()),
        ),
    )
    if prop_ids is not None:
        overdue_q = overdue_q.where(
            RentSchedule.lease_id.in_(
                select(Lease.id).where(Lease.property_id.in_(prop_ids))
            )
        )
    overdue_row = (await db.execute(overdue_q)).one()

    # Collection rate: confirmed / (confirmed + overdue amounts) this month
    confirmed_mtd = float(monthly_rev)
    overdue_total = float(overdue_row.overdue_amount or 0)
    collection_rate = (
        round(confirmed_mtd / (confirmed_mtd + overdue_total) * 100, 1)
        if (confirmed_mtd + overdue_total) > 0 else 100.0
    )

    # In-progress payments (all non-terminal states)
    _in_progress_statuses = [
        PaymentStatus.initiated,
        PaymentStatus.predicted,
        PaymentStatus.routed,
        PaymentStatus.pending,
        PaymentStatus.reconciled,
        PaymentStatus.allocated,
        PaymentStatus.retry_scheduled,
    ]
    pending_q = select(func.count(Payment.id)).where(
        Payment.organisation_id == org_id if org_id is not None else sql_true(),
        Payment.status.in_(_in_progress_statuses),
    )
    if prop_ids is not None:
        pending_q = pending_q.where(
            Payment.lease_id.in_(
                select(Lease.id).where(Lease.property_id.in_(prop_ids))
            )
        )
    pending_payments = await db.scalar(pending_q) or 0

    # Open maintenance
    maint_q = select(func.count(MaintenanceIssue.id)).where(
        MaintenanceIssue.organisation_id == org_id if org_id is not None else sql_true(),
        MaintenanceIssue.state.in_([
            MaintenanceState.reported,
            MaintenanceState.assigned,
            MaintenanceState.in_progress,
        ]),
    )
    if prop_ids is not None:
        maint_q = maint_q.where(MaintenanceIssue.property_id.in_(prop_ids))
    open_maintenance = await db.scalar(maint_q) or 0

    # Scheduled inspections
    insp_q = select(func.count(Inspection.id)).where(
        Inspection.organisation_id == org_id if org_id is not None else sql_true(),
        Inspection.state == InspectionState.scheduled,
    )
    if prop_ids is not None:
        insp_q = insp_q.where(Inspection.property_id.in_(prop_ids))
    scheduled_inspections = await db.scalar(insp_q) or 0

    return {
        "totalProperties": int(prop_count),
        "totalUnits": total_units,
        "occupiedUnits": occupied_units,
        "occupancyRate": occupancy_rate,
        "totalTenants": int(tenants_row.total or 0),
        "activeTenants": int(tenants_row.active or 0),
        "pendingOnboarding": int(tenants_row.pending or 0),
        "monthlyRevenue": float(monthly_rev),
        "expectedMonthlyRent": expected_monthly,
        "pendingPayments": int(pending_payments),
        "overduePayments": int(overdue_row.count or 0),
        "overdueAmount": overdue_total,
        "collectionRate": collection_rate,
        "openMaintenanceIssues": int(open_maintenance),
        "scheduledInspections": int(scheduled_inspections),
    }


# ── Occupancy series ───────────────────────────────────────────────────────────

async def get_occupancy_series(
    org_id: uuid.UUID | None,
    db: AsyncSession,
    months: int = 12,
    prop_ids: list[uuid.UUID] | None = None,
) -> list[dict]:
    """
    For each month: count units with an active lease that overlaps that month
    vs total units at that time (approximated as current total).

    When prop_ids is provided (caretakers, read-only landlords) queries are
    restricted to those properties only.
    """
    unit_count_q = select(func.count(Unit.id)).where(
        Unit.property.has(organisation_id=org_id) if org_id is not None else sql_true(),
    )
    if prop_ids is not None:
        unit_count_q = unit_count_q.where(Unit.property_id.in_(prop_ids))

    total_units = await db.scalar(unit_count_q) or 1  # avoid div by zero

    result = []
    for year, month in _months_back(months):
        month_start = date(year, month, 1)
        month_end = date(year, month, monthrange(year, month)[1])

        lease_q = select(func.count(Lease.id)).where(
            Lease.organisation_id == org_id if org_id is not None else sql_true(),
            Lease.status == LeaseStatus.active,
            Lease.start_date <= month_end,
            (Lease.end_date >= month_start) | (Lease.end_date.is_(None)),
        )
        if prop_ids is not None:
            lease_q = lease_q.where(Lease.property_id.in_(prop_ids))

        occupied = await db.scalar(lease_q) or 0
        occupied = min(int(occupied), int(total_units))
        available = int(total_units) - occupied
        rate = round(occupied / int(total_units) * 100, 1)

        result.append({
            "month": _month_label(year, month),
            "occupied": occupied,
            "available": available,
            "rate": rate,
        })

    return result


# ── Revenue series ─────────────────────────────────────────────────────────────

async def get_revenue_series(
    org_id: uuid.UUID | None,
    db: AsyncSession,
    months: int = 12,
    prop_ids: list[uuid.UUID] | None = None,
) -> list[dict]:
    # Sub-query used when scoping to specific properties
    _lease_ids_for_props = (
        select(Lease.id).where(Lease.property_id.in_(prop_ids))
        if prop_ids is not None else None
    )

    result = []
    for year, month in _months_back(months):
        # Expected = all scheduled rent amounts for that month
        expected_q = select(func.coalesce(func.sum(RentSchedule.amount_due), 0)).where(
            RentSchedule.organisation_id == org_id if org_id is not None else sql_true(),
            func.extract("year", RentSchedule.due_date) == year,
            func.extract("month", RentSchedule.due_date) == month,
        )
        if _lease_ids_for_props is not None:
            expected_q = expected_q.where(RentSchedule.lease_id.in_(_lease_ids_for_props))
        expected = await db.scalar(expected_q) or 0

        # Collected = confirmed/completed payments in that month
        collected_q = select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.organisation_id == org_id if org_id is not None else sql_true(),
            Payment.status.in_([PaymentStatus.confirmed, PaymentStatus.completed]),
            func.extract("year", Payment.paid_at) == year,
            func.extract("month", Payment.paid_at) == month,
        )
        if _lease_ids_for_props is not None:
            collected_q = collected_q.where(Payment.lease_id.in_(_lease_ids_for_props))
        collected = await db.scalar(collected_q) or 0

        # Late fees applied that month
        late_fees_q = select(func.coalesce(func.sum(RentSchedule.late_fee_applied), 0)).where(
            RentSchedule.organisation_id == org_id if org_id is not None else sql_true(),
            func.extract("year", RentSchedule.due_date) == year,
            func.extract("month", RentSchedule.due_date) == month,
            RentSchedule.late_fee_applied > 0,
        )
        if _lease_ids_for_props is not None:
            late_fees_q = late_fees_q.where(RentSchedule.lease_id.in_(_lease_ids_for_props))
        late_fees = await db.scalar(late_fees_q) or 0

        result.append({
            "month": _month_label(year, month),
            "collected": float(collected),
            "expected": float(expected),
            "lateFees": float(late_fees),
        })

    return result


# ── Cash flow series ───────────────────────────────────────────────────────────

async def get_cashflow_series(
    org_id: uuid.UUID | None,
    db: AsyncSession,
    months: int = 12,
    prop_ids: list[uuid.UUID] | None = None,
) -> list[dict]:
    """
    Inflow  = confirmed payments received.
    Outflow = maintenance actual costs recorded that month (proxy for expenses).

    When prop_ids is provided queries are restricted to those properties only.
    """
    _lease_ids_for_props = (
        select(Lease.id).where(Lease.property_id.in_(prop_ids))
        if prop_ids is not None else None
    )

    result = []
    for year, month in _months_back(months):
        inflow_q = select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.organisation_id == org_id if org_id is not None else sql_true(),
            Payment.status.in_([PaymentStatus.confirmed, PaymentStatus.completed]),
            func.extract("year", Payment.paid_at) == year,
            func.extract("month", Payment.paid_at) == month,
        )
        if _lease_ids_for_props is not None:
            inflow_q = inflow_q.where(Payment.lease_id.in_(_lease_ids_for_props))
        inflow = await db.scalar(inflow_q) or 0

        outflow_q = select(func.coalesce(func.sum(MaintenanceIssue.actual_cost), 0)).where(
            MaintenanceIssue.organisation_id == org_id if org_id is not None else sql_true(),
            MaintenanceIssue.actual_cost.isnot(None),
            func.extract("year", MaintenanceIssue.resolved_at) == year,
            func.extract("month", MaintenanceIssue.resolved_at) == month,
        )
        if prop_ids is not None:
            outflow_q = outflow_q.where(MaintenanceIssue.property_id.in_(prop_ids))
        outflow = await db.scalar(outflow_q) or 0

        inflow = float(inflow)
        outflow = float(outflow)
        result.append({
            "month": _month_label(year, month),
            "inflow": inflow,
            "outflow": outflow,
            "net": round(inflow - outflow, 2),
        })

    return result
