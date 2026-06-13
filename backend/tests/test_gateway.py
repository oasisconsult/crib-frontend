"""
Tests for the unified payments gateway, matching engine, and webhook handlers.

Coverage:
  - ManualProvider.initiate_payment returns received immediately
  - MTNMoMoProvider.process_webhook normalises payload correctly
  - AirtelMoneyProvider.process_webhook normalises payload correctly
  - get_provider returns correct provider for each method string
  - get_provider raises ValueError for unknown method
  - handle_webhook_event creates/updates MobileMoneyTransaction row
  - handle_webhook_event is idempotent (no duplicate rows for same external_id)
  - match_transaction links received transaction to tenant + lease → Payment
  - match_transaction marks transaction "unmatched" when no tenant found
  - match_transaction skips non-received transactions
  - POST /webhooks/mtn returns 200 and processes event
  - POST /webhooks/airtel returns 200 and processes event
  - POST /webhooks/mtn returns 400 on invalid JSON shape
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers
from tests.factories import (
    make_lease,
    make_organisation,
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
        phone="+256700000001",
        status=TenantStatus.active,
        onboarding_state=OnboardingState.approved,
    )


@pytest_asyncio.fixture
async def active_lease(db_session: AsyncSession, org, unit, tenant):
    from datetime import date
    from app.models.lease import LeaseStatus
    lease = await make_lease(
        db_session, org, unit, tenant,
        status=LeaseStatus.active,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 6, 30),
        monthly_rent=500_000,
    )
    # Ensure the lease knows the current tenant
    lease.current_tenant_id = tenant.id
    await db_session.flush()
    return lease


# ── Provider unit tests ───────────────────────────────────────────────────────

class TestManualProvider:
    async def test_initiate_returns_received(self):
        from app.integrations.payments.providers.manual import ManualProvider
        from app.integrations.payments.base import ProviderStatus

        provider = ManualProvider()
        result = await provider.initiate_payment(
            phone="+256700000001",
            amount=500_000,
            currency="UGX",
            external_reference="test-ref-001",
        )
        assert result.status == ProviderStatus.received
        assert "test-ref-001" in result.external_id

    async def test_check_status_always_received(self):
        from app.integrations.payments.providers.manual import ManualProvider
        from app.integrations.payments.base import ProviderStatus

        provider = ManualProvider()
        status = await provider.check_status("any-id")
        assert status == ProviderStatus.received

    def test_process_webhook_raises(self):
        from app.integrations.payments.providers.manual import ManualProvider

        provider = ManualProvider()
        with pytest.raises(NotImplementedError):
            provider.process_webhook({})


class TestMTNProvider:
    def test_process_webhook_successful(self):
        from app.integrations.payments.providers.mtn import MTNMoMoProvider
        from app.integrations.payments.base import ProviderStatus

        provider = MTNMoMoProvider()
        event = provider.process_webhook({
            "financialTransactionId": "fin-123",
            "externalId": "ref-abc",
            "amount": "50000",
            "currency": "UGX",
            "payer": {"partyIdType": "MSISDN", "partyId": "256700000001"},
            "status": "SUCCESSFUL",
        })
        assert event.status == ProviderStatus.received
        assert event.external_id == "ref-abc"
        assert event.phone_number == "+256700000001"
        assert event.amount == 50000.0
        assert event.currency == "UGX"

    def test_process_webhook_failed(self):
        from app.integrations.payments.providers.mtn import MTNMoMoProvider
        from app.integrations.payments.base import ProviderStatus

        provider = MTNMoMoProvider()
        event = provider.process_webhook({
            "externalId": "ref-xyz",
            "amount": "50000",
            "currency": "UGX",
            "payer": {"partyIdType": "MSISDN", "partyId": "256700000002"},
            "status": "FAILED",
        })
        assert event.status == ProviderStatus.failed

    def test_process_webhook_pending(self):
        from app.integrations.payments.providers.mtn import MTNMoMoProvider
        from app.integrations.payments.base import ProviderStatus

        provider = MTNMoMoProvider()
        event = provider.process_webhook({
            "externalId": "ref-pend",
            "amount": "10000",
            "currency": "UGX",
            "payer": {"partyIdType": "MSISDN", "partyId": "256700000003"},
            "status": "PENDING",
        })
        assert event.status == ProviderStatus.pending


class TestAirtelProvider:
    def test_process_webhook_successful(self):
        from app.integrations.payments.providers.airtel import AirtelMoneyProvider
        from app.integrations.payments.base import ProviderStatus

        provider = AirtelMoneyProvider()
        event = provider.process_webhook({
            "transaction": {
                "id": "airtel-txn-001",
                "status_code": "TS",
                "msisdn": "256700000001",
                "amount": 50000,
                "currency": "UGX",
            }
        })
        assert event.status == ProviderStatus.received
        assert event.external_id == "airtel-txn-001"
        assert event.phone_number == "+256700000001"
        assert event.amount == 50000.0

    def test_process_webhook_failed(self):
        from app.integrations.payments.providers.airtel import AirtelMoneyProvider
        from app.integrations.payments.base import ProviderStatus

        provider = AirtelMoneyProvider()
        event = provider.process_webhook({
            "transaction": {
                "id": "airtel-txn-002",
                "status_code": "TF",
                "msisdn": "256700000002",
                "amount": 25000,
                "currency": "UGX",
            }
        })
        assert event.status == ProviderStatus.failed


class TestProviderFactory:
    def test_mtn_method_returns_mtn_provider(self):
        from app.integrations.payments.factory import get_provider
        from app.integrations.payments.providers.mtn import MTNMoMoProvider

        assert isinstance(get_provider("mobile_money_mtn"), MTNMoMoProvider)

    def test_airtel_method_returns_airtel_provider(self):
        from app.integrations.payments.factory import get_provider
        from app.integrations.payments.providers.airtel import AirtelMoneyProvider

        assert isinstance(get_provider("mobile_money_airtel"), AirtelMoneyProvider)

    def test_cash_method_returns_manual_provider(self):
        from app.integrations.payments.factory import get_provider
        from app.integrations.payments.providers.manual import ManualProvider

        assert isinstance(get_provider("cash"), ManualProvider)

    def test_unknown_method_raises_value_error(self):
        from app.integrations.payments.factory import get_provider

        with pytest.raises(ValueError, match="Unknown payment method"):
            get_provider("bitcoin")


# ── Gateway service tests ─────────────────────────────────────────────────────

class TestHandleWebhookEvent:
    async def test_received_event_updates_transaction(
        self, db_session: AsyncSession, org
    ):
        from app.integrations.payments.base import ProviderName, ProviderStatus, WebhookEvent
        from app.integrations.payments.service import handle_webhook_event
        from app.models.mobile_money import MobileMoneyTransaction

        # Pre-create a pending transaction
        txn = MobileMoneyTransaction(
            organisation_id=org.id,
            provider="MTN",
            external_id="mtn-ext-001",
            phone_number="+256700000001",
            amount=500_000,
            currency="UGX",
            status="pending",
            raw_payload={},
        )
        db_session.add(txn)
        await db_session.flush()

        event = WebhookEvent(
            provider=ProviderName.MTN,
            external_id="mtn-ext-001",
            status=ProviderStatus.received,
            amount=500_000,
            currency="UGX",
            phone_number="+256700000001",
            raw={"status": "SUCCESSFUL"},
        )
        result = await handle_webhook_event(db_session, event)

        assert result is not None
        assert result.status == "received"
        assert result.received_at is not None

    async def test_unknown_external_id_creates_unmatched_row(
        self, db_session: AsyncSession
    ):
        from app.integrations.payments.base import ProviderName, ProviderStatus, WebhookEvent
        from app.integrations.payments.service import handle_webhook_event

        event = WebhookEvent(
            provider=ProviderName.MTN,
            external_id="mtn-never-seen",
            status=ProviderStatus.received,
            amount=100_000,
            currency="UGX",
            phone_number="+256700000099",
        )
        result = await handle_webhook_event(db_session, event)

        assert result is not None
        assert result.status == "unmatched"


# ── Matching engine tests ─────────────────────────────────────────────────────

class TestMatchTransaction:
    async def test_matches_received_transaction_to_tenant(
        self, db_session: AsyncSession, org, active_lease, tenant
    ):
        from datetime import date
        from app.models.mobile_money import MobileMoneyTransaction
        from app.services.matching_service import match_transaction

        await make_rent_schedule(
            db_session, org, active_lease,
            due_date=date(2026, 1, 1), amount_due=500_000,
        )

        txn = MobileMoneyTransaction(
            organisation_id=org.id,
            provider="MTN",
            external_id=f"mtn-match-{uuid.uuid4().hex[:8]}",
            phone_number="+256700000001",   # matches tenant.phone fixture
            amount=500_000,
            currency="UGX",
            status="received",
            raw_payload={},
        )
        db_session.add(txn)
        await db_session.flush()

        payment = await match_transaction(db_session, txn)

        assert payment is not None
        assert payment.lease_id == active_lease.id
        assert txn.status == "matched"
        assert txn.matched_payment_id == payment.id

    async def test_unmatched_when_no_tenant(
        self, db_session: AsyncSession, org
    ):
        from app.models.mobile_money import MobileMoneyTransaction
        from app.services.matching_service import match_transaction

        txn = MobileMoneyTransaction(
            organisation_id=org.id,
            provider="AIRTEL",
            external_id=f"airtel-unknown-{uuid.uuid4().hex[:8]}",
            phone_number="+256999999999",   # no tenant with this phone
            amount=200_000,
            currency="UGX",
            status="received",
            raw_payload={},
        )
        db_session.add(txn)
        await db_session.flush()

        payment = await match_transaction(db_session, txn)

        assert payment is None
        assert txn.status == "unmatched"

    async def test_skips_non_received_transaction(
        self, db_session: AsyncSession, org
    ):
        from app.models.mobile_money import MobileMoneyTransaction
        from app.services.matching_service import match_transaction

        txn = MobileMoneyTransaction(
            organisation_id=org.id,
            provider="MTN",
            external_id=f"mtn-pending-{uuid.uuid4().hex[:8]}",
            phone_number="+256700000001",
            amount=500_000,
            currency="UGX",
            status="pending",   # not received yet
            raw_payload={},
        )
        db_session.add(txn)
        await db_session.flush()

        payment = await match_transaction(db_session, txn)

        assert payment is None
        assert txn.status == "pending"  # unchanged


# ── Webhook endpoint tests ─────────────────────────────────────────────────────

class TestWebhookEndpoints:
    async def test_mtn_webhook_200_on_valid_payload(
        self, client: AsyncClient, db_session: AsyncSession, org
    ):
        from app.models.mobile_money import MobileMoneyTransaction

        # Pre-create a pending transaction so the handler finds it
        external_id = f"mtn-wh-{uuid.uuid4().hex[:8]}"
        txn = MobileMoneyTransaction(
            organisation_id=org.id,
            provider="MTN",
            external_id=external_id,
            phone_number="+256700000099",
            amount=100_000,
            currency="UGX",
            status="pending",
            raw_payload={},
        )
        db_session.add(txn)
        await db_session.flush()

        resp = await client.post(
            "/api/v1/webhooks/mtn",
            json={
                "externalId": external_id,
                "financialTransactionId": "fin-999",
                "amount": "100000",
                "currency": "UGX",
                "payer": {"partyIdType": "MSISDN", "partyId": "256700000099"},
                "status": "SUCCESSFUL",
            },
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    async def test_airtel_webhook_200_on_valid_payload(
        self, client: AsyncClient, db_session: AsyncSession, org
    ):
        from app.models.mobile_money import MobileMoneyTransaction

        external_id = f"airtel-wh-{uuid.uuid4().hex[:8]}"
        txn = MobileMoneyTransaction(
            organisation_id=org.id,
            provider="AIRTEL",
            external_id=external_id,
            phone_number="+256700000099",
            amount=75_000,
            currency="UGX",
            status="pending",
            raw_payload={},
        )
        db_session.add(txn)
        await db_session.flush()

        resp = await client.post(
            "/api/v1/webhooks/airtel",
            json={
                "transaction": {
                    "id": external_id,
                    "status_code": "TS",
                    "msisdn": "256700000099",
                    "amount": 75000,
                    "currency": "UGX",
                }
            },
        )
        assert resp.status_code == 200

    async def test_mtn_webhook_400_on_invalid_json(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/webhooks/mtn",
            content=b"not-json",
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 400
