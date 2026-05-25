"""
Tests for the ledger service and entries endpoint.

Coverage:
  - create_ledger_entry appends a row with correct balance_after
  - get_last_balance returns 0.0 for empty lease
  - Running balance tracks debit/credit correctly
  - get_ledger_entries returns paginated rows newest-first with current_balance
  - Confirming a payment writes a credit ledger entry (via payment_service)
  - Refunding a payment writes a debit ledger entry (via payment_service)
  - GET /leases/{id}/ledger/entries returns rows with correct fields
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

class TestLedgerService:
    async def test_get_last_balance_empty_returns_zero(
        self, db_session: AsyncSession, active_lease
    ):
        from app.services.ledger_service import get_last_balance
        balance = await get_last_balance(db_session, active_lease.id)
        assert balance == 0.0

    async def test_debit_increases_balance(
        self, db_session: AsyncSession, org, active_lease
    ):
        """A debit entry (tenant owes more) should increase balance_after."""
        import uuid
        from app.services.ledger_service import create_ledger_entry, get_last_balance

        entry = await create_ledger_entry(
            db_session,
            organisation_id=org.id,
            lease_id=active_lease.id,
            entry_type="debit",
            amount=500_000,
            reference_type="payment",
            reference_id=uuid.uuid4(),
            description="Rent due Jan 2026",
        )

        assert float(entry.balance_after) == 500_000.0
        balance = await get_last_balance(db_session, active_lease.id)
        assert balance == 500_000.0

    async def test_credit_decreases_balance(
        self, db_session: AsyncSession, org, active_lease
    ):
        """A credit entry (payment received) should decrease balance_after."""
        import uuid
        from app.services.ledger_service import create_ledger_entry

        # First build up a debit
        await create_ledger_entry(
            db_session,
            organisation_id=org.id,
            lease_id=active_lease.id,
            entry_type="debit",
            amount=500_000,
            reference_type="payment",
            reference_id=uuid.uuid4(),
        )
        # Now credit (payment confirmed)
        credit = await create_ledger_entry(
            db_session,
            organisation_id=org.id,
            lease_id=active_lease.id,
            entry_type="credit",
            amount=500_000,
            reference_type="payment",
            reference_id=uuid.uuid4(),
        )
        assert float(credit.balance_after) == 0.0

    async def test_running_balance_across_multiple_entries(
        self, db_session: AsyncSession, org, active_lease
    ):
        import uuid
        from app.services.ledger_service import create_ledger_entry, get_last_balance

        await create_ledger_entry(
            db_session, organisation_id=org.id, lease_id=active_lease.id,
            entry_type="debit", amount=500_000, reference_type="rent",
            reference_id=uuid.uuid4(),
        )
        await create_ledger_entry(
            db_session, organisation_id=org.id, lease_id=active_lease.id,
            entry_type="debit", amount=500_000, reference_type="rent",
            reference_id=uuid.uuid4(),
        )
        await create_ledger_entry(
            db_session, organisation_id=org.id, lease_id=active_lease.id,
            entry_type="credit", amount=300_000, reference_type="payment",
            reference_id=uuid.uuid4(),
        )
        balance = await get_last_balance(db_session, active_lease.id)
        # 500k + 500k - 300k = 700k
        assert balance == 700_000.0

    async def test_get_ledger_entries_pagination(
        self, db_session: AsyncSession, org, active_lease
    ):
        import uuid
        from app.services.ledger_service import create_ledger_entry, get_ledger_entries

        for i in range(5):
            await create_ledger_entry(
                db_session, organisation_id=org.id, lease_id=active_lease.id,
                entry_type="debit", amount=100_000 * (i + 1),
                reference_type="rent", reference_id=uuid.uuid4(),
            )

        page1 = await get_ledger_entries(db_session, active_lease.id, page=1, page_size=3)
        page2 = await get_ledger_entries(db_session, active_lease.id, page=2, page_size=3)

        assert page1["total"] == 5
        assert len(page1["data"]) == 3
        assert page1["has_next"] is True
        assert len(page2["data"]) == 2
        assert page2["has_next"] is False

    async def test_get_ledger_entries_returns_current_balance(
        self, db_session: AsyncSession, org, active_lease
    ):
        import uuid
        from app.services.ledger_service import create_ledger_entry, get_ledger_entries

        await create_ledger_entry(
            db_session, organisation_id=org.id, lease_id=active_lease.id,
            entry_type="debit", amount=500_000,
            reference_type="rent", reference_id=uuid.uuid4(),
        )
        result = await get_ledger_entries(db_session, active_lease.id)
        assert result["current_balance"] == 500_000.0


class TestLedgerViaPaymentService:
    """Verify that confirm/refund writes ledger entries end-to-end."""

    async def test_confirm_payment_creates_credit_ledger_entry(
        self, db_session: AsyncSession, org, active_lease
    ):
        from datetime import date
        from sqlalchemy import select
        from app.models.ledger import LedgerEntry
        from app.services.payment_service import confirm_payment

        s = await make_rent_schedule(
            db_session, org, active_lease,
            due_date=date(2026, 1, 1), amount_due=500_000,
        )
        p = await make_payment(db_session, org, active_lease, s, amount=500_000)

        await confirm_payment(p.id, active_lease.id, org.id, db_session)

        result = await db_session.execute(
            select(LedgerEntry).where(LedgerEntry.lease_id == active_lease.id)
        )
        entries = result.scalars().all()
        assert len(entries) == 1
        assert entries[0].entry_type == "credit"
        assert float(entries[0].amount) == 500_000.0

    async def test_refund_payment_creates_debit_ledger_entry(
        self, db_session: AsyncSession, org, active_lease
    ):
        from datetime import date
        from sqlalchemy import select
        from app.models.ledger import LedgerEntry
        from app.models.payment import PaymentStatus
        from app.services.payment_service import confirm_payment, refund_payment

        s = await make_rent_schedule(
            db_session, org, active_lease,
            due_date=date(2026, 1, 1), amount_due=500_000,
        )
        p = await make_payment(db_session, org, active_lease, s, amount=500_000)
        await confirm_payment(p.id, active_lease.id, org.id, db_session)
        await refund_payment(p.id, active_lease.id, org.id, db_session)

        result = await db_session.execute(
            select(LedgerEntry)
            .where(LedgerEntry.lease_id == active_lease.id)
            .order_by(LedgerEntry.created_at.asc())
        )
        entries = result.scalars().all()
        assert len(entries) == 2
        assert entries[0].entry_type == "credit"
        assert entries[1].entry_type == "debit"


# ── HTTP-level tests ──────────────────────────────────────────────────────────

class TestLedgerEntriesEndpoint:
    async def test_list_ledger_entries_empty(
        self, client: AsyncClient, active_lease
    ):
        resp = await client.get(
            f"/api/v1/leases/{active_lease.id}/ledger/entries",
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 0
        assert body["data"] == []
        assert body["currentBalance"] == 0.0

    async def test_list_ledger_entries_after_confirm(
        self, client: AsyncClient, db_session: AsyncSession, org, active_lease
    ):
        from datetime import date

        s = await make_rent_schedule(
            db_session, org, active_lease,
            due_date=date(2026, 1, 1), amount_due=500_000,
        )
        p = await make_payment(db_session, org, active_lease, s, amount=500_000)
        await db_session.flush()

        await client.patch(
            f"/api/v1/leases/{active_lease.id}/payments/{p.id}/confirm",
            headers=auth_headers("manager-1"),
        )

        resp = await client.get(
            f"/api/v1/leases/{active_lease.id}/ledger/entries",
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] >= 1
        entry = body["data"][0]
        assert entry["entryType"] == "credit"
        assert entry["amount"] == 500_000.0
        assert "balanceAfter" in entry

    async def test_ledger_entries_pagination(
        self, client: AsyncClient, db_session: AsyncSession, org, active_lease
    ):
        import uuid
        from app.services.ledger_service import create_ledger_entry

        for _ in range(6):
            await create_ledger_entry(
                db_session, organisation_id=org.id, lease_id=active_lease.id,
                entry_type="debit", amount=10_000,
                reference_type="rent", reference_id=uuid.uuid4(),
            )
        await db_session.flush()

        resp = await client.get(
            f"/api/v1/leases/{active_lease.id}/ledger/entries?pageSize=4",
            headers=auth_headers("manager-1"),
        )
        body = resp.json()
        assert body["total"] == 6
        assert len(body["data"]) == 4
        assert body["hasNext"] is True
