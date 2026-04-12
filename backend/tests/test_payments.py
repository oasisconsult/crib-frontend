"""
Tests for the payments domain.

Coverage:
  - Rent schedule generation on lease activation
  - Schedule listing and retrieval
  - Schedule waive
  - Payment create / list / get / confirm / refund
  - Payment idempotency
  - Late fee apply / waive
  - Deposit get / return (partial + full)
  - Ledger aggregation
  - CSV export
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers
from tests.factories import (
    make_deposit,
    make_lease,
    make_organisation,
    make_payment,
    make_property,
    make_rent_schedule,
    make_tenant,
    make_unit,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def org(db_session: AsyncSession):
    return await make_organisation(db_session)


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
    """A lease in 'active' status with 12 schedules already generated."""
    from datetime import date
    from app.models.lease import LeaseStatus
    lease = await make_lease(
        db_session, org, unit, tenant,
        status=LeaseStatus.active,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
        monthly_rent=500_000,
        deposit_amount=500_000,
        late_fee_type="flat",
        late_fee_value=25_000,
        rent_day_of_month=1,
    )
    # Manually generate schedules for test isolation (bypasses activate_lease flow)
    from app.services.payment_service import generate_rent_schedules
    await generate_rent_schedules(lease, db_session)
    # Pre-fund deposit — tests assert amountHeld == deposit_amount
    await make_deposit(db_session, org, lease, amount_held=500_000)
    await db_session.flush()
    return lease


@pytest_asyncio.fixture
async def schedule(db_session: AsyncSession, org, active_lease):
    """First schedule for the active lease (January 2026)."""
    from sqlalchemy import select
    from app.models.payment import RentSchedule
    result = await db_session.execute(
        select(RentSchedule)
        .where(RentSchedule.lease_id == active_lease.id)
        .order_by(RentSchedule.due_date.asc())
        .limit(1)
    )
    return result.scalar_one()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _auth(org_id: str) -> dict:
    """Build auth headers for the given org using manager-1 dev fixture."""
    return auth_headers("manager-1")


# ── Schedule tests ────────────────────────────────────────────────────────────

class TestSchedules:
    async def test_list_schedules(self, client: AsyncClient, active_lease, org):
        resp = await client.get(
            f"/api/v1/leases/{active_lease.id}/schedules",
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 12  # Jan–Dec 2026
        assert data["data"][0]["status"] == "pending"

    async def test_get_schedule(self, client: AsyncClient, active_lease, schedule):
        resp = await client.get(
            f"/api/v1/leases/{active_lease.id}/schedules/{schedule.id}",
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == str(schedule.id)
        assert body["amountDue"] == 500_000.0
        assert body["balance"] == 500_000.0

    async def test_waive_schedule(self, client: AsyncClient, active_lease, schedule):
        resp = await client.patch(
            f"/api/v1/leases/{active_lease.id}/schedules/{schedule.id}/waive",
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "waived"

    async def test_waive_paid_schedule_returns_400(
        self, client: AsyncClient, active_lease, schedule, db_session
    ):
        from app.models.payment import RentScheduleStatus
        schedule.status = RentScheduleStatus.paid
        await db_session.flush()

        resp = await client.patch(
            f"/api/v1/leases/{active_lease.id}/schedules/{schedule.id}/waive",
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 400

    async def test_filter_schedules_by_status(self, client: AsyncClient, active_lease, schedule, db_session):
        from app.models.payment import RentScheduleStatus
        schedule.status = RentScheduleStatus.overdue
        await db_session.flush()

        resp = await client.get(
            f"/api/v1/leases/{active_lease.id}/schedules?status=overdue",
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["data"][0]["status"] == "overdue"


# ── Payment tests ─────────────────────────────────────────────────────────────

class TestPayments:
    async def test_create_payment(self, client: AsyncClient, active_lease, schedule):
        resp = await client.post(
            f"/api/v1/leases/{active_lease.id}/payments",
            json={
                "rentScheduleId": str(schedule.id),
                "amount": 500_000,
                "method": "cash",
                "category": "rent",
            },
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["amount"] == 500_000.0
        assert body["status"] == "initiated"  # v4: all payments start at initiated

    async def test_create_payment_idempotency(self, client: AsyncClient, active_lease, schedule):
        payload = {
            "rentScheduleId": str(schedule.id),
            "amount": 500_000,
            "method": "cash",
            "category": "rent",
            "idempotencyKey": "idem-test-001",
        }
        r1 = await client.post(
            f"/api/v1/leases/{active_lease.id}/payments",
            json=payload,
            headers=auth_headers("manager-1"),
        )
        r2 = await client.post(
            f"/api/v1/leases/{active_lease.id}/payments",
            json=payload,
            headers=auth_headers("manager-1"),
        )
        assert r1.status_code == 201
        assert r2.status_code == 201
        assert r1.json()["id"] == r2.json()["id"]

    async def test_list_payments(self, client: AsyncClient, active_lease, schedule, db_session, org):
        await make_payment(db_session, org, active_lease, schedule)
        resp = await client.get(
            f"/api/v1/leases/{active_lease.id}/payments",
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1

    async def test_get_payment(self, client: AsyncClient, active_lease, schedule, db_session, org):
        p = await make_payment(db_session, org, active_lease, schedule)
        resp = await client.get(
            f"/api/v1/leases/{active_lease.id}/payments/{p.id}",
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 200
        assert resp.json()["id"] == str(p.id)

    async def test_confirm_payment_marks_schedule_paid(
        self, client: AsyncClient, active_lease, schedule, db_session, org
    ):
        p = await make_payment(db_session, org, active_lease, schedule, amount=500_000)
        resp = await client.patch(
            f"/api/v1/leases/{active_lease.id}/payments/{p.id}/confirm",
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "completed"  # v4: confirm advances to completed

        # Verify schedule is now paid
        await db_session.refresh(schedule, attribute_names=["status", "amount_paid"])
        assert str(schedule.status) in ("paid", "RentScheduleStatus.paid")

    async def test_confirm_already_confirmed_returns_400(
        self, client: AsyncClient, active_lease, schedule, db_session, org
    ):
        from app.models.payment import PaymentStatus
        p = await make_payment(db_session, org, active_lease, schedule, status=PaymentStatus.confirmed)
        resp = await client.patch(
            f"/api/v1/leases/{active_lease.id}/payments/{p.id}/confirm",
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 400

    async def test_refund_payment(self, client: AsyncClient, active_lease, schedule, db_session, org):
        from app.models.payment import PaymentStatus
        p = await make_payment(db_session, org, active_lease, schedule, status=PaymentStatus.confirmed)
        resp = await client.patch(
            f"/api/v1/leases/{active_lease.id}/payments/{p.id}/refund",
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "refunded"

    async def test_refund_pending_payment_returns_400(
        self, client: AsyncClient, active_lease, schedule, db_session, org
    ):
        p = await make_payment(db_session, org, active_lease, schedule)  # pending
        resp = await client.patch(
            f"/api/v1/leases/{active_lease.id}/payments/{p.id}/refund",
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 400

    async def test_invalid_category_returns_422(self, client: AsyncClient, active_lease, schedule):
        resp = await client.post(
            f"/api/v1/leases/{active_lease.id}/payments",
            json={
                "rentScheduleId": str(schedule.id),
                "amount": 100_000,
                "category": "bribe",
            },
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 422

    async def test_export_csv(self, client: AsyncClient, active_lease, schedule, db_session, org):
        from app.models.payment import PaymentStatus
        await make_payment(db_session, org, active_lease, schedule, status=PaymentStatus.confirmed)
        resp = await client.get(
            f"/api/v1/leases/{active_lease.id}/payments/export",
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]
        lines = resp.text.strip().split("\n")
        assert len(lines) >= 2  # header + at least one row


# ── Late Fee tests ─────────────────────────────────────────────────────────────

class TestLateFees:
    async def test_apply_late_fee(self, client: AsyncClient, active_lease, schedule, db_session):
        from app.models.payment import RentScheduleStatus
        schedule.status = RentScheduleStatus.overdue
        await db_session.flush()

        resp = await client.post(
            f"/api/v1/leases/{active_lease.id}/late-fees/{schedule.id}/apply",
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["calculatedAmount"] == 25_000.0
        assert body["feeType"] == "flat"

    async def test_apply_duplicate_late_fee_returns_409(
        self, client: AsyncClient, active_lease, schedule, db_session
    ):
        from app.models.payment import RentScheduleStatus
        schedule.status = RentScheduleStatus.overdue
        await db_session.flush()

        await client.post(
            f"/api/v1/leases/{active_lease.id}/late-fees/{schedule.id}/apply",
            headers=auth_headers("manager-1"),
        )
        resp = await client.post(
            f"/api/v1/leases/{active_lease.id}/late-fees/{schedule.id}/apply",
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 409

    async def test_waive_late_fee(self, client: AsyncClient, active_lease, schedule, db_session):
        from app.models.payment import RentScheduleStatus
        schedule.status = RentScheduleStatus.overdue
        await db_session.flush()

        apply_resp = await client.post(
            f"/api/v1/leases/{active_lease.id}/late-fees/{schedule.id}/apply",
            headers=auth_headers("manager-1"),
        )
        fee_id = apply_resp.json()["id"]

        resp = await client.patch(
            f"/api/v1/leases/{active_lease.id}/late-fees/{fee_id}/waive",
            json={"reason": "Tenant paid on time but bank was slow"},
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 200
        assert resp.json()["waived"] is True

    async def test_list_late_fees(self, client: AsyncClient, active_lease, schedule, db_session):
        from app.models.payment import RentScheduleStatus
        schedule.status = RentScheduleStatus.overdue
        await db_session.flush()

        await client.post(
            f"/api/v1/leases/{active_lease.id}/late-fees/{schedule.id}/apply",
            headers=auth_headers("manager-1"),
        )
        resp = await client.get(
            f"/api/v1/leases/{active_lease.id}/late-fees",
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1


# ── Deposit tests ─────────────────────────────────────────────────────────────

class TestDeposit:
    async def test_get_deposit(self, client: AsyncClient, active_lease):
        resp = await client.get(
            f"/api/v1/leases/{active_lease.id}/deposit",
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["amountHeld"] == 500_000.0
        assert body["status"] == "held"

    async def test_partial_return(self, client: AsyncClient, active_lease):
        resp = await client.patch(
            f"/api/v1/leases/{active_lease.id}/deposit/return",
            json={"amountReturned": 200_000, "deductions": [], "notes": "Partial return"},
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "partially_returned"
        assert body["amountReturned"] == 200_000.0

    async def test_full_return(self, client: AsyncClient, active_lease):
        resp = await client.patch(
            f"/api/v1/leases/{active_lease.id}/deposit/return",
            json={"amountReturned": 500_000, "deductions": []},
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "fully_returned"

    async def test_return_with_deductions(self, client: AsyncClient, active_lease):
        resp = await client.patch(
            f"/api/v1/leases/{active_lease.id}/deposit/return",
            json={
                "amountReturned": 400_000,
                "deductions": [{"reason": "Broken window", "amount": 100_000}],
            },
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["deductions"]) == 1
        assert body["deductions"][0]["reason"] == "Broken window"

    async def test_return_exceeding_held_returns_422(self, client: AsyncClient, active_lease):
        resp = await client.patch(
            f"/api/v1/leases/{active_lease.id}/deposit/return",
            json={"amountReturned": 999_999},
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 422

    async def test_no_deposit_returns_404(self, client: AsyncClient, active_lease, db_session):
        from sqlalchemy import delete
        from app.models.payment import Deposit
        await db_session.execute(
            delete(Deposit).where(Deposit.lease_id == active_lease.id)
        )
        await db_session.flush()

        resp = await client.get(
            f"/api/v1/leases/{active_lease.id}/deposit",
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 404


# ── Ledger tests ──────────────────────────────────────────────────────────────

class TestLedger:
    async def test_ledger_initial_state(self, client: AsyncClient, active_lease):
        resp = await client.get(
            f"/api/v1/leases/{active_lease.id}/ledger",
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["totalRentDue"] == 6_000_000.0   # 12 × 500,000
        assert body["totalRentPaid"] == 0.0
        assert body["totalRentOutstanding"] == 6_000_000.0
        assert body["overdueSchedules"] == 0
        assert body["depositHeld"] == 500_000.0
        assert body["depositStatus"] == "held"

    async def test_ledger_after_payment(self, client: AsyncClient, active_lease, schedule, db_session, org):
        from app.models.payment import PaymentStatus
        p = await make_payment(db_session, org, active_lease, schedule, status=PaymentStatus.confirmed, amount=500_000)
        # Manually update schedule amount_paid to simulate confirm
        schedule.amount_paid = 500_000
        from app.models.payment import RentScheduleStatus
        schedule.status = RentScheduleStatus.paid
        await db_session.flush()

        resp = await client.get(
            f"/api/v1/leases/{active_lease.id}/ledger",
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["totalRentPaid"] == 500_000.0
        assert body["totalConfirmed"] == 500_000.0
