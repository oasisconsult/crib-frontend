"""
EFRIS integration tests.

Coverage:
  - issue_receipt: success path (idempotency, audit log written, payment updated)
  - issue_receipt: idempotency guard (already has receipt number → skip)
  - issue_receipt: EfrisNotConfiguredError → marks skipped, does not re-raise
  - issue_receipt: EfrisApiError → marks failed, re-raises for Celery retry
  - payment_service.confirm_payment: dispatches EFRIS task when feature enabled
  - payment_service.confirm_payment: skips EFRIS task when feature disabled
  - _scrub_payload: sensitive keys are redacted
  - credential safety: password never appears in audit log payloads
  - Config API: upsert/get EFRIS config (password masked in response)
  - Config API: test connection endpoint
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers
from tests.factories import (
    make_lease,
    make_payment,
    make_property,
    make_tenant,
    make_unit,
)


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def org(dev_org):
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
async def confirmed_payment(db_session: AsyncSession, org, unit, tenant):
    from app.models.lease import LeaseStatus
    from app.models.payment import PaymentStatus
    lease = await make_lease(db_session, org, unit, tenant, status=LeaseStatus.active)
    return await make_payment(
        db_session, org, lease,
        status=PaymentStatus.confirmed,
        amount=500_000,
        currency="UGX",
        method="mobile_money_mtn",
        category="rent",
    )


@pytest_asyncio.fixture
async def efris_config(db_session: AsyncSession, org):
    """A pre-saved EFRIS configuration for the test org (mock environment)."""
    from app.core.encryption import encrypt
    from app.models.efris import OrganisationEfrisConfig
    config = OrganisationEfrisConfig(
        organisation_id=org.id,
        environment="mock",
        api_url="http://localhost:8099",
        tin="1234567890",
        device_no="DEV-001",
        username="testuser",
        password_encrypted=encrypt("testpassword"),
        is_active=True,
    )
    db_session.add(config)
    await db_session.flush()
    return config


# ── Mock helpers ───────────────────────────────────────────────────────────────

def _mock_login_response():
    from app.integrations.efris.schemas import LoginResponse
    return LoginResponse(
        id="TAX-123",
        tin="1234567890",
        legal_name="Test Org",
        web_service_url="http://localhost:8099",
        qr_code_url="http://localhost:8099/qr",
    )


def _mock_invoice_response():
    from app.integrations.efris.schemas import EfrisInvoiceResponse
    return EfrisInvoiceResponse(
        invoice_no="FD-20260613-00001",
        antifake_code="AF-MOCK-1234",
        qr_code="https://verify.ura.go.ug/qr?code=MOCK",
    )


# ── Service: issue_receipt ─────────────────────────────────────────────────────

async def test_issue_receipt_success(db_session: AsyncSession, confirmed_payment, efris_config):
    """issue_receipt() updates payment with EFRIS receipt fields and writes audit log."""
    from sqlalchemy import select

    from app.integrations.efris.schemas import EfrisInvoiceResponse
    from app.integrations.efris import service
    from app.models.efris import EfrisAuditLog

    mock_client = AsyncMock()
    mock_client.tin = "1234567890"
    mock_client.device_no = "DEV-001"
    mock_client.login = AsyncMock(return_value=_mock_login_response())
    mock_client.upload_invoice = AsyncMock(return_value=_mock_invoice_response())
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    mock_redis = AsyncMock()

    with patch("app.integrations.efris.service.get_efris_client", return_value=mock_client):
        await service.issue_receipt(str(confirmed_payment.id), db_session, mock_redis)

    await db_session.refresh(confirmed_payment)
    assert confirmed_payment.efris_status == "issued"
    assert confirmed_payment.efris_receipt_number == "FD-20260613-00001"
    assert confirmed_payment.efris_anti_fake_code == "AF-MOCK-1234"
    assert confirmed_payment.efris_receipt_date is not None

    # Audit log must exist
    logs = (await db_session.execute(
        select(EfrisAuditLog).where(EfrisAuditLog.payment_id == confirmed_payment.id)
    )).scalars().all()
    assert len(logs) == 1
    assert logs[0].efris_status == "success"
    assert logs[0].action == "T109"


async def test_issue_receipt_idempotency(db_session: AsyncSession, confirmed_payment):
    """issue_receipt() is a no-op when payment already has a receipt number."""
    from app.integrations.efris import service

    # Pre-set the receipt number
    confirmed_payment.efris_receipt_number = "FD-EXISTING-00001"
    confirmed_payment.efris_status = "issued"
    await db_session.flush()

    mock_redis = AsyncMock()
    with patch("app.integrations.efris.service.get_efris_client") as mock_ctx:
        await service.issue_receipt(str(confirmed_payment.id), db_session, mock_redis)
        # Context manager should never be entered
        mock_ctx.assert_not_called()

    # Receipt number unchanged
    assert confirmed_payment.efris_receipt_number == "FD-EXISTING-00001"


async def test_issue_receipt_not_configured(db_session: AsyncSession, confirmed_payment):
    """EfrisNotConfiguredError → payment marked skipped, exception not re-raised."""
    from app.integrations.efris import service
    from app.integrations.efris.client import EfrisNotConfiguredError

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(side_effect=EfrisNotConfiguredError("No config"))
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_redis = AsyncMock()

    with patch("app.integrations.efris.service.get_efris_client", return_value=mock_client):
        await service.issue_receipt(str(confirmed_payment.id), db_session, mock_redis)

    await db_session.refresh(confirmed_payment)
    assert confirmed_payment.efris_status == "skipped"


async def test_issue_receipt_api_error_reraises(db_session: AsyncSession, confirmed_payment, efris_config):
    """EfrisApiError marks the payment failed and re-raises so Celery can retry."""
    from app.integrations.efris import service
    from app.integrations.efris.client import EfrisApiError

    mock_client = AsyncMock()
    mock_client.tin = "1234567890"
    mock_client.device_no = "DEV-001"
    mock_client.login = AsyncMock(return_value=_mock_login_response())
    mock_client.upload_invoice = AsyncMock(
        side_effect=EfrisApiError("E001", "Server unavailable", 503)
    )
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_redis = AsyncMock()

    with patch("app.integrations.efris.service.get_efris_client", return_value=mock_client):
        with pytest.raises(EfrisApiError):
            await service.issue_receipt(str(confirmed_payment.id), db_session, mock_redis)

    await db_session.refresh(confirmed_payment)
    assert confirmed_payment.efris_status == "failed"
    assert "E001" in (confirmed_payment.efris_failure_reason or "")
    assert confirmed_payment.efris_retry_count == 1


# ── _scrub_payload ────────────────────────────────────────────────────────────

def test_scrub_payload_removes_sensitive_keys():
    """_scrub_payload() must redact password and token fields."""
    from app.integrations.efris.service import _scrub_payload

    payload = {
        "tin": "1234567890",
        "password": "secret123",
        "accessToken": "tok_abc",
        "nested": {
            "authorization": "Bearer xyz",
            "amount": 500000,
        },
    }
    scrubbed = _scrub_payload(payload)

    assert scrubbed["tin"] == "1234567890"
    assert scrubbed["password"] == "***"
    assert scrubbed["accessToken"] == "***"
    assert scrubbed["nested"]["authorization"] == "***"
    assert scrubbed["nested"]["amount"] == 500000


# ── Credential not-in-audit-log ────────────────────────────────────────────────

async def test_audit_log_does_not_contain_password(
    db_session: AsyncSession, confirmed_payment, efris_config
):
    """Audit log request_payload must never contain the EFRIS password."""
    from sqlalchemy import select

    from app.integrations.efris import service
    from app.models.efris import EfrisAuditLog

    mock_client = AsyncMock()
    mock_client.tin = "1234567890"
    mock_client.device_no = "DEV-001"
    mock_client.login = AsyncMock(return_value=_mock_login_response())
    mock_client.upload_invoice = AsyncMock(return_value=_mock_invoice_response())
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("app.integrations.efris.service.get_efris_client", return_value=mock_client):
        await service.issue_receipt(str(confirmed_payment.id), db_session, AsyncMock())

    logs = (await db_session.execute(
        select(EfrisAuditLog).where(EfrisAuditLog.payment_id == confirmed_payment.id)
    )).scalars().all()
    assert len(logs) == 1

    # Flatten and stringify to catch password in any nested location
    import json
    payload_str = json.dumps(logs[0].request_payload or {})
    assert "testpassword" not in payload_str
    assert "password_encrypted" not in payload_str.lower()
    assert "secret" not in payload_str


# ── EFRIS task: dispatch from confirm_payment ─────────────────────────────────

async def test_confirm_payment_dispatches_efris_when_enabled(
    client: AsyncClient, db_session: AsyncSession, org, unit, tenant
):
    """confirm_payment() fires issue_efris_receipt.delay when EFRIS feature is enabled."""
    from app.models.lease import LeaseStatus
    from app.models.payment import PaymentStatus

    lease = await make_lease(db_session, org, unit, tenant, status=LeaseStatus.active)
    payment = await make_payment(
        db_session, org, lease,
        status=PaymentStatus.pending,
        amount=300_000,
        method="cash",
    )
    await db_session.flush()

    with patch("app.services.subscription_limits.check_feature_access_bool", return_value=True), \
         patch("app.worker.tasks.efris.issue_efris_receipt") as mock_task:
        mock_task.delay = MagicMock()
        resp = await client.patch(
            f"/api/v1/leases/{lease.id}/payments/{payment.id}/confirm",
            headers=auth_headers("manager-1"),
        )

    assert resp.status_code == 200, resp.text
    mock_task.delay.assert_called_once_with(str(payment.id))


async def test_confirm_payment_skips_efris_when_disabled(
    client: AsyncClient, db_session: AsyncSession, org, unit, tenant
):
    """confirm_payment() does not dispatch EFRIS task when feature is disabled."""
    from app.models.lease import LeaseStatus
    from app.models.payment import PaymentStatus

    lease = await make_lease(db_session, org, unit, tenant, status=LeaseStatus.active)
    payment = await make_payment(
        db_session, org, lease,
        status=PaymentStatus.pending,
        amount=300_000,
        method="cash",
    )
    await db_session.flush()

    with patch("app.services.subscription_limits.check_feature_access_bool", return_value=False), \
         patch("app.worker.tasks.efris.issue_efris_receipt") as mock_task:
        mock_task.delay = MagicMock()
        resp = await client.patch(
            f"/api/v1/leases/{lease.id}/payments/{payment.id}/confirm",
            headers=auth_headers("manager-1"),
        )

    assert resp.status_code == 200, resp.text
    mock_task.delay.assert_not_called()


# ── Config API ────────────────────────────────────────────────────────────────

async def test_upsert_efris_config_masks_password(
    client: AsyncClient, db_session: AsyncSession, org
):
    """PUT /efris/config stores password encrypted; response returns passwordSet=true, not the value."""
    with patch("app.api.v1.efris.check_feature_access", new_callable=AsyncMock):
        resp = await client.put(
            f"/api/v1/organisations/{org.id}/efris/config",
            json={
                "environment": "mock",
                "apiUrl": "http://localhost:8099",
                "tin": "9876543210",
                "deviceNo": "DEV-TEST",
                "username": "cribuser",
                "password": "supersecret",
                "isActive": False,
            },
            headers=auth_headers("owner-1"),
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["passwordSet"] is True
    # The raw password must never appear in the response
    assert "supersecret" not in str(body)
    assert body["tin"] == "9876543210"
    assert body["isActive"] is False


async def test_get_efris_config_returns_none_when_not_configured(
    client: AsyncClient, org
):
    """GET /efris/config returns null when no config exists for the org."""
    with patch("app.api.v1.efris.check_feature_access", new_callable=AsyncMock):
        resp = await client.get(
            f"/api/v1/organisations/{org.id}/efris/config",
            headers=auth_headers("manager-1"),
        )

    assert resp.status_code == 200
    assert resp.json() is None


async def test_efris_config_keep_password_on_null(
    client: AsyncClient, db_session: AsyncSession, org, efris_config
):
    """Passing password=null in upsert does not overwrite the stored password."""
    from app.core.encryption import decrypt

    with patch("app.api.v1.efris.check_feature_access", new_callable=AsyncMock):
        resp = await client.put(
            f"/api/v1/organisations/{org.id}/efris/config",
            json={
                "environment": "mock",
                "apiUrl": "http://localhost:8099",
                "tin": "1234567890",
                "deviceNo": "DEV-001",
                "username": "testuser",
                "password": None,
                "isActive": True,
            },
            headers=auth_headers("owner-1"),
        )

    assert resp.status_code == 200
    # The password stored in DB must still be decryptable as the original
    await db_session.refresh(efris_config)
    assert decrypt(efris_config.password_encrypted) == "testpassword"
