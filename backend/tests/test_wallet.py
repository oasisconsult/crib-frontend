"""
Tests for the tenant wallet service and API endpoints.

Coverage:
  - get_or_create_wallet creates a wallet on first call, returns same on second
  - credit_wallet adds to balance and creates WalletTransaction
  - debit_wallet subtracts from balance and creates WalletTransaction
  - debit_wallet raises 400 when balance insufficient
  - Overpayment via confirm_payment credits the wallet automatically
  - GET /tenants/{id}/wallet returns 404 when no wallet exists
  - GET /tenants/{id}/wallet returns balance
  - GET /tenants/{id}/wallet/transactions returns paginated history
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers
from tests.factories import (
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

class TestWalletService:
    async def test_get_or_create_creates_wallet(
        self, db_session: AsyncSession, org, tenant
    ):
        from app.services.wallet_service import get_or_create_wallet

        wallet = await get_or_create_wallet(db_session, tenant.id, org.id)

        assert wallet.tenant_id == tenant.id
        assert float(wallet.balance) == 0.0

    async def test_get_or_create_is_idempotent(
        self, db_session: AsyncSession, org, tenant
    ):
        from app.services.wallet_service import get_or_create_wallet

        w1 = await get_or_create_wallet(db_session, tenant.id, org.id)
        w2 = await get_or_create_wallet(db_session, tenant.id, org.id)

        assert w1.id == w2.id

    async def test_credit_wallet_increases_balance(
        self, db_session: AsyncSession, org, tenant
    ):
        import uuid
        from app.services.wallet_service import credit_wallet, get_wallet

        await credit_wallet(
            db_session, tenant.id, org.id,
            amount=200_000,
            reference_type="overpayment",
            reference_id=uuid.uuid4(),
            description="Test credit",
        )

        wallet = await get_wallet(db_session, tenant.id)
        assert float(wallet.balance) == 200_000.0

    async def test_credit_wallet_creates_transaction_row(
        self, db_session: AsyncSession, org, tenant
    ):
        import uuid
        from sqlalchemy import select
        from app.models.wallet import WalletTransaction
        from app.services.wallet_service import credit_wallet

        await credit_wallet(
            db_session, tenant.id, org.id,
            amount=100_000,
            reference_type="overpayment",
            reference_id=uuid.uuid4(),
        )

        result = await db_session.execute(
            select(WalletTransaction).where(WalletTransaction.tenant_id == tenant.id)
        )
        txns = result.scalars().all()
        assert len(txns) == 1
        assert txns[0].transaction_type == "credit"
        assert float(txns[0].amount) == 100_000.0
        assert float(txns[0].balance_after) == 100_000.0

    async def test_debit_wallet_decreases_balance(
        self, db_session: AsyncSession, org, tenant
    ):
        import uuid
        from app.services.wallet_service import credit_wallet, debit_wallet, get_wallet

        await credit_wallet(db_session, tenant.id, org.id, amount=300_000,
                            reference_type="overpayment", reference_id=uuid.uuid4())
        await debit_wallet(db_session, tenant.id, org.id, amount=100_000,
                           reference_type="rent_application", reference_id=uuid.uuid4())

        wallet = await get_wallet(db_session, tenant.id)
        assert float(wallet.balance) == 200_000.0

    async def test_debit_wallet_insufficient_balance_raises_400(
        self, db_session: AsyncSession, org, tenant
    ):
        import uuid
        from fastapi import HTTPException
        from app.services.wallet_service import debit_wallet

        with pytest.raises(HTTPException) as exc_info:
            await debit_wallet(db_session, tenant.id, org.id, amount=999_999_999,
                               reference_type="rent_application", reference_id=uuid.uuid4())

        assert exc_info.value.status_code == 400

    async def test_get_wallet_transactions_paginated(
        self, db_session: AsyncSession, org, tenant
    ):
        import uuid
        from app.services.wallet_service import credit_wallet, get_wallet_transactions

        for i in range(5):
            await credit_wallet(
                db_session, tenant.id, org.id,
                amount=10_000,
                reference_type="overpayment",
                reference_id=uuid.uuid4(),
            )

        page1 = await get_wallet_transactions(db_session, tenant.id, page=1, page_size=3)
        assert page1["total"] == 5
        assert len(page1["data"]) == 3
        assert page1["has_next"] is True

        page2 = await get_wallet_transactions(db_session, tenant.id, page=2, page_size=3)
        assert len(page2["data"]) == 2
        assert page2["has_next"] is False


class TestWalletViaPaymentService:
    """Verify overpayment during confirm_payment credits wallet automatically."""

    async def test_overpayment_credited_to_wallet(
        self, db_session: AsyncSession, org, active_lease, tenant
    ):
        from datetime import date
        from app.services.payment_service import confirm_payment
        from app.services.wallet_service import get_wallet

        s = await make_rent_schedule(
            db_session, org, active_lease,
            due_date=date(2026, 1, 1), amount_due=500_000,
        )
        # Pay 700k against a 500k schedule → 200k should go to wallet
        p = await make_payment(db_session, org, active_lease, s, amount=700_000)
        await confirm_payment(p.id, active_lease.id, org.id, db_session)

        wallet = await get_wallet(db_session, tenant.id)
        assert wallet is not None
        assert float(wallet.balance) == 200_000.0

    async def test_no_wallet_created_when_no_overpayment(
        self, db_session: AsyncSession, org, active_lease, tenant
    ):
        from datetime import date
        from app.services.payment_service import confirm_payment
        from app.services.wallet_service import get_wallet

        s = await make_rent_schedule(
            db_session, org, active_lease,
            due_date=date(2026, 1, 1), amount_due=500_000,
        )
        p = await make_payment(db_session, org, active_lease, s, amount=500_000)
        await confirm_payment(p.id, active_lease.id, org.id, db_session)

        wallet = await get_wallet(db_session, tenant.id)
        # Either no wallet at all, or wallet with zero balance
        assert wallet is None or float(wallet.balance) == 0.0


# ── HTTP-level tests ──────────────────────────────────────────────────────────

class TestWalletEndpoints:
    async def test_get_wallet_404_when_none(
        self, client: AsyncClient, tenant
    ):
        resp = await client.get(
            f"/api/v1/tenants/{tenant.id}/wallet",
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 404

    async def test_get_wallet_returns_balance(
        self, client: AsyncClient, db_session: AsyncSession, org, active_lease, tenant
    ):
        from datetime import date

        s = await make_rent_schedule(
            db_session, org, active_lease,
            due_date=date(2026, 1, 1), amount_due=500_000,
        )
        p = await make_payment(db_session, org, active_lease, s, amount=600_000)
        await db_session.flush()

        # Confirm via API to trigger wallet credit
        await client.patch(
            f"/api/v1/leases/{active_lease.id}/payments/{p.id}/confirm",
            headers=auth_headers("manager-1"),
        )

        resp = await client.get(
            f"/api/v1/tenants/{tenant.id}/wallet",
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["balance"] == 100_000.0
        assert body["tenantId"] == str(tenant.id)

    async def test_get_wallet_transactions(
        self, client: AsyncClient, db_session: AsyncSession, org, active_lease, tenant
    ):
        from datetime import date

        s = await make_rent_schedule(
            db_session, org, active_lease,
            due_date=date(2026, 1, 1), amount_due=500_000,
        )
        p = await make_payment(db_session, org, active_lease, s, amount=600_000)
        await db_session.flush()

        await client.patch(
            f"/api/v1/leases/{active_lease.id}/payments/{p.id}/confirm",
            headers=auth_headers("manager-1"),
        )

        resp = await client.get(
            f"/api/v1/tenants/{tenant.id}/wallet/transactions",
            headers=auth_headers("manager-1"),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] >= 1
        txn = body["data"][0]
        assert txn["transactionType"] == "credit"
        assert txn["amount"] == 100_000.0
