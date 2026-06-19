"""
Full onboarding flow integration tests.

Tests the complete lifecycle from invite to fully-executed agreement:

  invite → flow status → preview agreement → accept terms
  → submit payments → confirm payments → tenant signs
  → lease activated → Logto account (no-op in test)
  → manager countersigns → fully_executed

Additional cases:
  - NIN is stored and appears in rendered agreement
  - payment_settings on organisation are returned
  - Countersign blocked if lease not active
  - Countersign idempotent if already fully_executed
  - Rendered HTML contains expected legal text
"""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lease import Lease, LeaseStatus
from app.models.tenancy_agreement import TenancyAgreement, TenancyAgreementStatus
from app.models.tenant import OnboardingState, TenantStatus
from tests.conftest import auth_headers
from tests.factories import (
    make_lease,
    make_property,
    make_tenant,
    make_tenant_invite,
    make_unit,
)


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(autouse=True)
async def professional_plan(db_session: AsyncSession):
    """Upgrade dev org to professional so esignature_enabled feature is available."""
    import sqlalchemy as _sa
    await db_session.execute(_sa.text("""
        INSERT INTO organisation_subscriptions
            (organisation_id, plan_id, status, billing_cycle, currency, current_period_start, auto_renew)
        SELECT o.id, sp.id, 'active', 'none', 'UGX', now(), true
        FROM organisations o, subscription_plans sp
        WHERE o.logto_org_id = 'org_dev' AND sp.slug = 'professional'
        ON CONFLICT (organisation_id) DO UPDATE
            SET plan_id = EXCLUDED.plan_id, status = 'active'
    """))
    await db_session.flush()


@pytest.fixture
async def org(dev_org):
    """Use the pre-seeded org_dev so test data is visible to dev-user auth tokens."""
    return dev_org


@pytest.fixture
async def prop(db_session: AsyncSession, org):
    return await make_property(
        db_session, org,
        name="Full Flow Test Property",
        address={
            "line1": "45 Nakasero Hill",
            "city": "Kampala",
            "state": "Central",
            "postcode": "00256",
            "country": "UG",
        },
    )


@pytest.fixture
async def unit(db_session: AsyncSession, prop):
    return await make_unit(db_session, prop, name="FF-1A", monthly_rent=600_000)


@pytest.fixture
async def tenant_with_nin(db_session: AsyncSession, org):
    t = await make_tenant(
        db_session, org,
        first_name="Grace",
        last_name="Nakato",
        email=f"grace.nakato.{uuid.uuid4().hex[:4]}@example.com",
        onboarding_state=OnboardingState.approved,
        status=TenantStatus.inactive,
    )
    # Set NIN directly
    t.nin = "CM12345678AGNKC"
    await db_session.flush()
    return t


@pytest.fixture
async def lease(db_session: AsyncSession, org, unit, tenant_with_nin):
    return await make_lease(
        db_session, org, unit, tenant_with_nin,
        monthly_rent=600_000,
        deposit_amount=600_000,
        currency="UGX",
    )


@pytest.fixture
async def invite(db_session: AsyncSession, org, tenant_with_nin, lease):
    return await make_tenant_invite(
        db_session, org, tenant_with_nin,
        lease_id=lease.id,
        property_id=lease.property_id,
        unit_id=lease.unit_id,
    )


# ── Helpers ────────────────────────────────────────────────────────────────────

def _base(token: str) -> str:
    return f"/api/v1/tenants/onboarding/{token}"


def _key() -> str:
    return str(uuid.uuid4())


async def _preview(client, token):
    r = await client.post(f"{_base(token)}/preview")
    assert r.status_code == 200, r.text
    return r.json()


async def _accept(client, token):
    r = await client.post(f"{_base(token)}/accept-terms", json={"accepted": True})
    assert r.status_code == 200, r.text
    return r.json()


async def _pay(client, token, dep_key, rent_key):
    r = await client.post(
        f"{_base(token)}/payment",
        json={
            "payments": [
                {"category": "deposit", "amount": 600_000, "currency": "UGX",
                 "method": "cash", "idempotencyKey": dep_key},
                {"category": "rent", "amount": 600_000, "currency": "UGX",
                 "method": "cash", "idempotencyKey": rent_key},
            ]
        },
    )
    assert r.status_code == 200, r.text
    return r.json()


async def _confirm_all(client, token, pay_resp):
    for p in pay_resp["payments"]:
        r = await client.post(f"{_base(token)}/payment/{p['id']}/confirm")
        assert r.status_code == 200, r.text


async def _sign(client, token, sig="data:image/png;base64,AAAB"):
    r = await client.post(
        f"{_base(token)}/sign",
        json={"signatureDataUrl": sig},
    )
    assert r.status_code == 200, r.text
    return r.json()


async def _countersign(client, lease_id, sig="data:image/png;base64,BBBB"):
    r = await client.post(
        f"/api/v1/leases/{lease_id}/agreement/countersign",
        json={"signatureDataUrl": sig},
        headers=auth_headers("owner-1"),
    )
    return r


# ── Test 1: Full happy-path flow through countersign ──────────────────────────

@pytest.mark.asyncio
async def test_full_flow_invite_to_fully_executed(
    client: AsyncClient,
    db_session: AsyncSession,
    invite,
    lease,
    tenant_with_nin,
):
    token = invite.token

    # 1. GET flow status — auto-starts (invited → started)
    r = await client.get(f"{_base(token)}/flow")
    assert r.status_code == 200
    data = r.json()
    assert data["onboardingPhase"] == "payment_flow"
    assert data["currentStep"] == "agreement_preview"

    # 2. Preview agreement
    preview = await _preview(client, token)
    assert preview["leaseId"] == str(lease.id)
    assert preview["monthlyRent"] == 600_000
    assert preview["depositAmount"] == 600_000

    await db_session.refresh(lease, attribute_names=["status"])
    assert lease.status == LeaseStatus.agreement_previewed

    # 3. Accept terms
    acc = await _accept(client, token)
    assert acc["status"] == "terms_accepted"
    await db_session.refresh(lease, attribute_names=["status", "terms_accepted_at"])
    assert lease.status == LeaseStatus.terms_accepted
    assert lease.terms_accepted_at is not None

    # 4. Submit payments
    dk, rk = _key(), _key()
    pay = await _pay(client, token, dk, rk)
    assert pay["leaseStatus"] == "payment_pending"
    assert len(pay["payments"]) == 2

    # 5. Confirm payments
    await _confirm_all(client, token, pay)
    await db_session.refresh(lease, attribute_names=["status"])
    assert lease.status == LeaseStatus.payment_secured

    # 6. Tenant signs (Logto call is mocked to no-op)
    with patch("app.services.logto_service.create_tenant_user", new_callable=AsyncMock) as mock_logto:
        mock_logto.return_value = "logto_user_abc123"
        signed = await _sign(client, token)

    assert signed["status"] == "active"
    await db_session.refresh(lease, attribute_names=["status", "onboarding_completed_at"])
    assert lease.status == LeaseStatus.active
    assert lease.onboarding_completed_at is not None

    # Tenant should now be active + have Logto user ID
    await db_session.refresh(tenant_with_nin, attribute_names=["status", "onboarding_state", "logto_user_id"])
    assert tenant_with_nin.status == TenantStatus.active
    assert tenant_with_nin.onboarding_state == OnboardingState.activated
    assert tenant_with_nin.logto_user_id == "logto_user_abc123"

    # TenancyAgreement created with tenant_signed status
    ta_result = await db_session.execute(
        select(TenancyAgreement).where(TenancyAgreement.lease_id == lease.id)
    )
    ta = ta_result.scalar_one_or_none()
    assert ta is not None
    assert ta.status == TenancyAgreementStatus.tenant_signed
    assert ta.tenant_signed_at is not None
    assert ta.landlord_signed_at is None

    # 7. Manager countersigns
    r = await _countersign(client, str(lease.id))
    assert r.status_code == 200, r.text
    agreement = r.json()
    assert agreement["status"] == "fully_executed"
    assert agreement["landlordSignedAt"] is not None

    # Check DB
    await db_session.refresh(ta)
    assert ta.status == TenancyAgreementStatus.fully_executed
    assert ta.landlord_signer_id is not None


# ── Test 2: NIN appears in rendered HTML ──────────────────────────────────────

@pytest.mark.asyncio
async def test_nin_in_rendered_agreement(
    client: AsyncClient,
    db_session: AsyncSession,
    invite,
    lease,
    tenant_with_nin,
):
    token = invite.token
    await _preview(client, token)
    await _accept(client, token)
    dk, rk = _key(), _key()
    pay = await _pay(client, token, dk, rk)
    await _confirm_all(client, token, pay)

    with patch("app.services.logto_service.create_tenant_user", new_callable=AsyncMock) as m:
        m.return_value = None
        await _sign(client, token)

    ta_result = await db_session.execute(
        select(TenancyAgreement).where(TenancyAgreement.lease_id == lease.id)
    )
    ta = ta_result.scalar_one()
    assert "CM12345678AGNKC" in ta.rendered_html
    assert "Grace Nakato" in ta.rendered_html
    assert "Dev Agency" in ta.rendered_html   # dev_org name from the pre-seeded org_dev fixture
    assert "Nakasero Hill" in ta.rendered_html  # from property address


# ── Test 3: Rendered HTML contains legal clauses ──────────────────────────────

@pytest.mark.asyncio
async def test_rendered_html_has_legal_content(
    client: AsyncClient,
    db_session: AsyncSession,
    invite,
    lease,
    tenant_with_nin,
):
    token = invite.token
    await _preview(client, token)
    await _accept(client, token)
    dk, rk = _key(), _key()
    pay = await _pay(client, token, dk, rk)
    await _confirm_all(client, token, pay)

    with patch("app.services.logto_service.create_tenant_user", new_callable=AsyncMock) as m:
        m.return_value = None
        await _sign(client, token)

    ta_result = await db_session.execute(
        select(TenancyAgreement).where(TenancyAgreement.lease_id == lease.id)
    )
    ta = ta_result.scalar_one()
    html = ta.rendered_html

    # Key sections must be present
    assert "Residential House Lease Agreement" in html
    assert "Security Deposit" in html
    assert "Governing Law" in html
    assert "Electronic Transactions Act" in html
    assert "600,000" in html  # formatted amount
    assert "Six Hundred Thousand" in html  # amount in words
    assert "Abandonment" in html
    assert "Holdover" in html


# ── Test 4: Countersign blocked when lease not active ─────────────────────────

@pytest.mark.asyncio
async def test_countersign_blocked_if_not_active(
    client: AsyncClient,
    db_session: AsyncSession,
    invite,
    lease,
):
    # Lease is still draft — countersign should fail
    r = await _countersign(client, str(lease.id))
    assert r.status_code == 409
    assert "not active" in r.json()["detail"].lower()


# ── Test 5: Countersign 404 if no agreement record ───────────────────────────

@pytest.mark.asyncio
async def test_countersign_404_if_no_agreement_record(
    client: AsyncClient,
    db_session: AsyncSession,
    org,
    unit,
):
    """Manager-activated lease (no TenancyAgreement record) returns 404."""
    tenant = await make_tenant(
        db_session, org,
        onboarding_state=OnboardingState.approved,
        status=TenantStatus.active,
    )
    active_lease = await make_lease(
        db_session, org, unit, tenant,
        status="active",
    )
    r = await _countersign(client, str(active_lease.id))
    assert r.status_code == 404


# ── Test 6: Countersign idempotent (already fully_executed) ──────────────────

@pytest.mark.asyncio
async def test_countersign_idempotent(
    client: AsyncClient,
    db_session: AsyncSession,
    invite,
    lease,
    tenant_with_nin,
):
    token = invite.token
    await _preview(client, token)
    await _accept(client, token)
    dk, rk = _key(), _key()
    pay = await _pay(client, token, dk, rk)
    await _confirm_all(client, token, pay)

    with patch("app.services.logto_service.create_tenant_user", new_callable=AsyncMock) as m:
        m.return_value = None
        await _sign(client, token)

    # First countersign
    r1 = await _countersign(client, str(lease.id))
    assert r1.status_code == 200
    signed_at_1 = r1.json()["landlordSignedAt"]

    # Second countersign — idempotent, should return same data
    r2 = await _countersign(client, str(lease.id))
    assert r2.status_code == 200
    assert r2.json()["status"] == "fully_executed"
    assert r2.json()["landlordSignedAt"] == signed_at_1


# ── Test 7: Logto failure does not block activation ───────────────────────────

@pytest.mark.asyncio
async def test_logto_failure_does_not_block_activation(
    client: AsyncClient,
    db_session: AsyncSession,
    invite,
    lease,
    tenant_with_nin,
):
    token = invite.token
    await _preview(client, token)
    await _accept(client, token)
    dk, rk = _key(), _key()
    pay = await _pay(client, token, dk, rk)
    await _confirm_all(client, token, pay)

    # Simulate Logto failure
    with patch("app.services.logto_service.create_tenant_user", new_callable=AsyncMock) as mock_logto:
        mock_logto.return_value = None  # failure returns None, not exception
        signed = await _sign(client, token)

    # Lease should still activate
    assert signed["status"] == "active"
    await db_session.refresh(lease, attribute_names=["status"])
    assert lease.status == LeaseStatus.active

    # logto_user_id remains None
    await db_session.refresh(tenant_with_nin, attribute_names=["logto_user_id"])
    assert tenant_with_nin.logto_user_id is None


# ── Test 8: Organisation payment_settings stored and accessible ───────────────

@pytest.mark.asyncio
async def test_org_payment_settings(
    db_session: AsyncSession,
    org,
):
    """payment_settings JSONB field stores and retrieves payment config."""
    org.payment_settings = {
        "bank_transfer": {
            "enabled": True,
            "bank_name": "Stanbic Bank Uganda",
            "account_name": "Kampala Properties Ltd",
            "account_number": "9030012345678",
        },
        "mobile_money_mtn": {
            "enabled": True,
            "number": "+256770000001",
            "name": "Kampala Properties Ltd",
        },
        "cash": {
            "enabled": True,
            "instructions": "Pay to the property manager between 9am–5pm weekdays.",
        },
    }
    await db_session.flush()
    await db_session.refresh(org, attribute_names=["payment_settings"])

    assert org.payment_settings["bank_transfer"]["bank_name"] == "Stanbic Bank Uganda"
    assert org.payment_settings["mobile_money_mtn"]["number"] == "+256770000001"
    assert org.payment_settings["cash"]["enabled"] is True


# ── Test 9: Flow status reflects agreement_signed after tenant signs ──────────

@pytest.mark.asyncio
async def test_flow_status_after_signing(
    client: AsyncClient,
    db_session: AsyncSession,
    invite,
    lease,
    tenant_with_nin,
):
    token = invite.token
    await _preview(client, token)
    await _accept(client, token)
    dk, rk = _key(), _key()
    pay = await _pay(client, token, dk, rk)
    await _confirm_all(client, token, pay)

    with patch("app.services.logto_service.create_tenant_user", new_callable=AsyncMock) as m:
        m.return_value = None
        await _sign(client, token)

    r = await client.get(f"{_base(token)}/flow")
    assert r.status_code == 200
    data = r.json()
    assert data["isActive"] is True
    assert data["agreementSigned"] is True
    assert data["onboardingPhase"] == "complete"


# ── Test 10: number_to_words helper ──────────────────────────────────────────

def test_number_to_words():
    from app.core.agreement_template import number_to_words
    assert number_to_words(0) == "Zero"
    assert number_to_words(1) == "One"
    assert number_to_words(100) == "One Hundred"
    assert number_to_words(500_000) == "Five Hundred Thousand"
    assert number_to_words(1_000_000) == "One Million"
    assert number_to_words(1_200_000) == "One Million Two Hundred Thousand"
    assert number_to_words(600_000) == "Six Hundred Thousand"
