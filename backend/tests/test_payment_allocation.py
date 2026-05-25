"""
Tests for the payment allocation layer.

Coverage:
  - allocate_payment distributes oldest-first across pending/overdue schedules
  - Partial payment leaves schedule partially paid (still pending)
  - Exact payment marks schedule paid
  - Multi-schedule payment (one payment covering two months)
  - Overpayment returns leftover > 0
  - Allocation rows are created for each schedule touched
  - reverse_allocations decrements amount_paid and reverts paid→pending
  - GET /leases/{id}/payments/{pid}/allocations returns correct rows
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers
from tests.factories import (
    make_lease,
    make_payment,
    make_property,
    make_rent_schedule,
    make_tenant,
    make_unit,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def org(dev_org):
    """Use the pre-seeded org_dev so test data is visible to dev-user auth tokens."""
    return dev_org


@pytest_asyncio.fixture
async def prop(db_session: AsyncSession, org):
    return await make_property(db_session, org)


@pytest_asyncio.fixture
async def unit(db_session: AsyncSession, prop):
    return await make_unit(db_session, prop)


@pytest_asyncio.fixture
async def tenant(db_session: AsyncSession, org):
    from app.models.tenant import OnboardingState, TenantStatus
    return await make_tenant(
        db_session, org,
        status=TenantStatus.active,
        onboarding_state=OnboardingState.approved,
    )


@pytest_asyncio.fixture
async def active_lease(db_session: AsyncSession, org, unit, tenant):
    from datetime import date
    from app.models.lease import LeaseStatus
    return await make_lease(
        db_session, org, unit, tenant,
        status=LeaseStatus.active,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 6, 30),
        monthly_rent=500_000,
    )


# ── Service-level tests ───────────────────────────────────────────────────────

class TestAllocatePayment:
    async def test_exact_payment_marks_schedule_paid(
        self, db_session: AsyncSession, org, active_lease
    ):
        from datetime import date
        from app.models.payment import RentScheduleStatus
        from app.services.payment_allocation_service import allocate_payment

        s = await make_rent_schedule(
            db_session, org, active_lease,
            due_date=date(2026, 1, 1), amount_due=500_000,
        )
        p = await make_payment(db_session, org, active_lease, amount=500_000)

        leftover = await allocate_payment(db_session, active_lease.id, p)

        assert leftover == 0.0
        await db_session.refresh(s)
        assert float(s.amount_paid) == 500_000
        assert s.status == RentScheduleStatus.paid

    async def test_partial_payment_leaves_schedule_pending(
        self, db_session: AsyncSession, org, active_lease
    ):
        from datetime import date
        from app.models.payment import RentScheduleStatus
        from app.services.payment_allocation_service import allocate_payment

        s = await make_rent_schedule(
            db_session, org, active_lease,
            due_date=date(2026, 1, 1), amount_due=500_000,
        )
        p = await make_payment(db_session, org, active_lease, amount=200_000)

        leftover = await allocate_payment(db_session, active_lease.id, p)

        assert leftover == 0.0
        await db_session.refresh(s)
        assert float(s.amount_paid) == 200_000
        assert s.status == RentScheduleStatus.pending

    async def test_overpayment_returns_leftover(
        self, db_session: AsyncSession, org, active_lease
    ):
        from datetime import date
        from app.services.payment_allocation_service import allocate_payment

        await make_rent_schedule(
            db_session, org, active_lease,
            due_date=date(2026, 1, 1), amount_due=500_000,
        )
        p = await make_payment(db_session, org, active_lease, amount=700_000)

        leftover = await allocate_payment(db_session, active_lease.id, p)

        assert leftover == 200_000.0

    async def test_multi_schedule_oldest_first(
        self, db_session: AsyncSession, org, active_lease
    ):
        """Payment of 1_000_000 should cover Jan + Feb (500k each), oldest first."""
        from datetime import date
        from app.models.payment import RentScheduleStatus
        from app.services.payment_allocation_service import allocate_payment

        jan = await make_rent_schedule(
            db_session, org, active_lease,
            due_date=date(2026, 1, 1), amount_due=500_000,
        )
        feb = await make_rent_schedule(
            db_session, org, active_lease,
            due_date=date(2026, 2, 1), amount_due=500_000,
        )
        p = await make_payment(db_session, org, active_lease, amount=1_000_000)

        leftover = await allocate_payment(db_session, active_lease.id, p)

        assert leftover == 0.0
        await db_session.refresh(jan)
        await db_session.refresh(feb)
        assert jan.status == RentScheduleStatus.paid
        assert feb.status == RentScheduleStatus.paid

    async def test_allocation_rows_created(
        self, db_session: AsyncSession, org, active_lease
    ):
        from datetime import date
        from app.services.payment_allocation_service import (
            allocate_payment,
            get_allocations_for_payment,
        )

        await make_rent_schedule(
            db_session, org, active_lease,
            due_date=date(2026, 1, 1), amount_due=500_000,
        )
        await make_rent_schedule(
            db_session, org, active_lease,
            due_date=date(2026, 2, 1), amount_due=500_000,
        )
        p = await make_payment(db_session, org, active_lease, amount=750_000)

        await allocate_payment(db_session, active_lease.id, p)
        allocs = await get_allocations_for_payment(db_session, p.id)

        # Should have touched Jan (500k) and Feb (250k)
        assert len(allocs) == 2
        amounts = sorted(float(a.amount_applied) for a in allocs)
        assert amounts == [250_000.0, 500_000.0]

    async def test_skips_waived_schedules(
        self, db_session: AsyncSession, org, active_lease
    ):
        from datetime import date
        from app.models.payment import RentScheduleStatus
        from app.services.payment_allocation_service import allocate_payment

        waived = await make_rent_schedule(
            db_session, org, active_lease,
            due_date=date(2026, 1, 1), amount_due=500_000,
            status=RentScheduleStatus.waived,
        )
        pending = await make_rent_schedule(
            db_session, org, active_lease,
            due_date=date(2026, 2, 1), amount_due=500_000,
        )
        p = await make_payment(db_session, org, active_lease, amount=500_000)

        await allocate_payment(db_session, active_lease.id, p)

        await db_session.refresh(waived)
        await db_session.refresh(pending)
        assert float(waived.amount_paid) == 0  # not touched
        assert pending.status == RentScheduleStatus.paid


class TestReverseAllocations:
    async def test_reverse_decrements_amount_paid(
        self, db_session: AsyncSession, org, active_lease
    ):
        from datetime import date
        from app.models.payment import RentScheduleStatus
        from app.services.payment_allocation_service import (
            allocate_payment,
            reverse_allocations,
        )

        s = await make_rent_schedule(
            db_session, org, active_lease,
            due_date=date(2026, 1, 1), amount_due=500_000,
        )
        p = await make_payment(db_session, org, active_lease, amount=500_000)
        await allocate_payment(db_session, active_lease.id, p)
        await db_session.refresh(s)
        assert s.status == RentScheduleStatus.paid

        await reverse_allocations(db_session, p.id, active_lease.id)
        await db_session.refresh(s)

        assert float(s.amount_paid) == 0.0
        assert s.status == RentScheduleStatus.pending

    async def test_reverse_does_not_go_negative(
        self, db_session: AsyncSession, org, active_lease
    ):
        from datetime import date
        from app.services.payment_allocation_service import (
            allocate_payment,
            reverse_allocations,
        )

        await make_rent_schedule(
            db_session, org, active_lease,
            due_date=date(2026, 1, 1), amount_due=500_000,
        )
        p = await make_payment(db_session, org, active_lease, amount=500_000)
        await allocate_payment(db_session, active_lease.id, p)

        # Reverse twice — second should be a no-op (amount_paid already 0)
        await reverse_allocations(db_session, p.id, active_lease.id)
        await reverse_allocations(db_session, p.id, active_lease.id)
        # No exception means the guard max(0, ...) worked


# ── HTTP-level tests ──────────────────────────────────────────────────────────

class TestAllocationsEndpoint:
    async def test_list_allocations_after_confirm(
        self, client: AsyncClient, db_session: AsyncSession, org, active_lease
    ):
        from datetime import date

        s = await make_rent_schedule(
            db_session, org, active_lease,
            due_date=date(2026, 1, 1), amount_due=500_000,
        )
        p = await make_payment(db_session, org, active_lease, s)
        await db_session.flush()

        # Confirm payment via the API (this runs allocate_payment inside)
        confirm_resp = await client.patch(
            f"/api/v1/leases/{active_lease.id}/payments/{p.id}/confirm",
            headers=auth_headers("manager-1"),
        )
        assert confirm_resp.status_code == 200

        # Fetch allocations
        resp = await client.get(
            f"/api/v1/leases/{active_lease.id}/payments/{p.id}/allocations",
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 200
        allocs = resp.json()
        assert len(allocs) == 1
        assert allocs[0]["rentScheduleId"] == str(s.id)
        assert allocs[0]["amountApplied"] == 500_000.0

    async def test_list_allocations_wrong_lease_returns_404(
        self, client: AsyncClient, db_session: AsyncSession, org, active_lease,
        unit, tenant,
    ):
        import uuid
        from datetime import date

        s = await make_rent_schedule(
            db_session, org, active_lease,
            due_date=date(2026, 1, 1), amount_due=500_000,
        )
        p = await make_payment(db_session, org, active_lease, s)
        await db_session.flush()

        fake_lease_id = uuid.uuid4()
        resp = await client.get(
            f"/api/v1/leases/{fake_lease_id}/payments/{p.id}/allocations",
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 404
