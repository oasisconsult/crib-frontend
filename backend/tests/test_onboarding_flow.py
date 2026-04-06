"""
Tests for the onboarding payment flow.

Flow under test:
  GET  /tenants/onboarding/{token}/flow         → resume state
  POST /tenants/onboarding/{token}/preview       → agreement preview
  POST /tenants/onboarding/{token}/accept-terms  → terms acceptance
  POST /tenants/onboarding/{token}/payment       → submit payments
  POST /tenants/onboarding/{token}/payment/{pid}/confirm → confirm payment
  POST /tenants/onboarding/{token}/sign          → sign & activate

Test cases:
  1.  Happy path: full flow → lease.active == True
  2.  Payment before acceptance → 409
  3.  Sign before payment → 409
  4.  Activate (sign) before signing → 409
  5.  accept_terms with accepted=False → 422
  6.  Idempotent preview: calling twice returns same snapshot
  7.  Idempotent accept: calling twice is a no-op
  8.  Idempotent payment: same idempotency_key returns existing payment
  9.  Snapshot integrity: force-mutate lease terms → sign returns 409
  10. Not-approved tenant: preview → 422
  11. Expired token → 410
  12. No lease linked to invite → preview returns 422
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lease import Lease, LeaseStatus
from app.models.tenant import InviteStatus, OnboardingState, TenantStatus
from tests.conftest import auth_headers
from tests.factories import (
    make_lease,
    make_organisation,
    make_property,
    make_tenant,
    make_tenant_invite,
    make_unit,
)


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest.fixture
async def org(db_session: AsyncSession):
    return await make_organisation(db_session, logto_org_id="org_onb", slug="org-onboarding-flow")


@pytest.fixture
async def prop(db_session: AsyncSession, org):
    return await make_property(db_session, org, name="Onboarding Test Property")


@pytest.fixture
async def unit(db_session: AsyncSession, prop):
    return await make_unit(db_session, prop, name="OB-1", monthly_rent=500_000)


@pytest.fixture
async def approved_tenant(db_session: AsyncSession, org):
    return await make_tenant(
        db_session, org,
        first_name="Alice", last_name="Smith",
        onboarding_state=OnboardingState.approved,
        status=TenantStatus.inactive,
    )


@pytest.fixture
async def draft_lease(db_session: AsyncSession, org, unit, approved_tenant):
    return await make_lease(
        db_session, org, unit, approved_tenant,
        monthly_rent=500_000,
        deposit_amount=500_000,
        currency="UGX",
    )


@pytest.fixture
async def valid_invite(db_session: AsyncSession, org, approved_tenant, draft_lease):
    """An invite linked to the draft lease — the normal happy-path setup."""
    return await make_tenant_invite(
        db_session, org, approved_tenant,
        lease_id=draft_lease.id,
        property_id=draft_lease.property_id,
        unit_id=draft_lease.unit_id,
    )


# ── Helpers ────────────────────────────────────────────────────────────────────

def _base(token: str) -> str:
    return f"/api/v1/tenants/onboarding/{token}"


def _idempotency_key() -> str:
    return str(uuid.uuid4())


async def _run_preview(client: AsyncClient, token: str) -> dict:
    r = await client.post(f"{_base(token)}/preview")
    assert r.status_code == 200, r.text
    return r.json()


async def _run_accept(client: AsyncClient, token: str) -> dict:
    r = await client.post(f"{_base(token)}/accept-terms", json={"accepted": True})
    assert r.status_code == 200, r.text
    return r.json()


async def _run_pay(client: AsyncClient, token: str, deposit_key: str, rent_key: str) -> dict:
    r = await client.post(
        f"{_base(token)}/payment",
        json={
            "payments": [
                {
                    "category": "deposit",
                    "amount": 500_000,
                    "currency": "UGX",
                    "method": "cash",
                    "reference": "DEP-001",
                    "idempotencyKey": deposit_key,
                },
                {
                    "category": "rent",
                    "amount": 500_000,
                    "currency": "UGX",
                    "method": "cash",
                    "reference": "RENT-001",
                    "idempotencyKey": rent_key,
                },
            ]
        },
    )
    assert r.status_code == 200, r.text
    return r.json()


async def _confirm_all(client: AsyncClient, token: str, payment_resp: dict) -> None:
    for p in payment_resp["payments"]:
        r = await client.post(f"{_base(token)}/payment/{p['id']}/confirm")
        assert r.status_code == 200, r.text


async def _run_sign(client: AsyncClient, token: str) -> dict:
    r = await client.post(
        f"{_base(token)}/sign",
        json={"signatureDataUrl": "data:image/png;base64,AAAA"},
    )
    assert r.status_code == 200, r.text
    return r.json()


# ── Test 1: Happy path ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_happy_path_full_flow(
    client: AsyncClient, db_session: AsyncSession, valid_invite, draft_lease
):
    token = valid_invite.token

    # 1. Preview
    preview = await _run_preview(client, token)
    assert preview["leaseId"] == str(draft_lease.id)
    assert preview["depositAmount"] == 500_000
    assert preview["monthlyRent"] == 500_000

    # Check lease state
    await db_session.refresh(draft_lease, attribute_names=["status"])
    assert draft_lease.status == LeaseStatus.agreement_previewed

    # 2. Accept terms
    accept = await _run_accept(client, token)
    assert accept["status"] == "terms_accepted"
    await db_session.refresh(draft_lease, attribute_names=["status", "terms_accepted_at"])
    assert draft_lease.status == LeaseStatus.terms_accepted
    assert draft_lease.terms_accepted_at is not None

    # 3. Submit payments
    dk, rk = _idempotency_key(), _idempotency_key()
    pay = await _run_pay(client, token, dk, rk)
    assert pay["leaseStatus"] == "payment_pending"
    assert len(pay["payments"]) == 2

    # 4. Confirm payments
    await _confirm_all(client, token, pay)

    await db_session.refresh(draft_lease, attribute_names=["status"])
    assert draft_lease.status == LeaseStatus.payment_secured

    # 5. Sign → auto-activates
    signed = await _run_sign(client, token)
    assert signed["status"] == "active"

    await db_session.refresh(draft_lease, attribute_names=["status", "onboarding_completed_at"])
    assert draft_lease.status == LeaseStatus.active
    assert draft_lease.onboarding_completed_at is not None


# ── Test 2: Payment before acceptance ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_payment_before_acceptance_rejected(
    client: AsyncClient, valid_invite, draft_lease, db_session
):
    token = valid_invite.token
    await _run_preview(client, token)
    # Skip accept — go straight to payment

    r = await client.post(
        f"{_base(token)}/payment",
        json={
            "payments": [{
                "category": "rent", "amount": 500_000, "currency": "UGX",
                "method": "cash", "idempotencyKey": _idempotency_key(),
            }]
        },
    )
    assert r.status_code == 409


# ── Test 3: Sign before payment ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sign_before_payment_rejected(
    client: AsyncClient, valid_invite, draft_lease
):
    token = valid_invite.token
    await _run_preview(client, token)
    await _run_accept(client, token)
    # Skip payment — go straight to sign

    r = await client.post(
        f"{_base(token)}/sign",
        json={"signatureDataUrl": "data:image/png;base64,AAAA"},
    )
    assert r.status_code == 409


# ── Test 4: accept_terms with accepted=False ──────────────────────────────────

@pytest.mark.asyncio
async def test_accept_false_rejected(client: AsyncClient, valid_invite, draft_lease):
    token = valid_invite.token
    await _run_preview(client, token)

    r = await client.post(f"{_base(token)}/accept-terms", json={"accepted": False})
    assert r.status_code == 422


# ── Test 5: Idempotent preview ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_idempotent_preview(
    client: AsyncClient, valid_invite, draft_lease, db_session
):
    token = valid_invite.token

    preview1 = await _run_preview(client, token)
    preview2 = await _run_preview(client, token)

    # Same snapshot returned; lease not double-transitioned
    assert preview1["leaseId"] == preview2["leaseId"]
    assert preview1["monthlyRent"] == preview2["monthlyRent"]
    await db_session.refresh(draft_lease, attribute_names=["status"])
    assert draft_lease.status == LeaseStatus.agreement_previewed


# ── Test 6: Idempotent accept ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_idempotent_accept(
    client: AsyncClient, valid_invite, draft_lease, db_session
):
    token = valid_invite.token
    await _run_preview(client, token)

    accept1 = await _run_accept(client, token)
    accept2 = await _run_accept(client, token)

    assert accept1["termsAcceptedAt"] == accept2["termsAcceptedAt"]
    await db_session.refresh(draft_lease, attribute_names=["status"])
    assert draft_lease.status == LeaseStatus.terms_accepted


# ── Test 7: Idempotent payment ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_idempotent_payment(
    client: AsyncClient, valid_invite, draft_lease, db_session
):
    token = valid_invite.token
    await _run_preview(client, token)
    await _run_accept(client, token)

    dk, rk = _idempotency_key(), _idempotency_key()
    pay1 = await _run_pay(client, token, dk, rk)
    pay2 = await _run_pay(client, token, dk, rk)

    # Same payment IDs returned; no duplicate records
    ids1 = {p["id"] for p in pay1["payments"]}
    ids2 = {p["id"] for p in pay2["payments"]}
    assert ids1 == ids2


# ── Test 8: Snapshot integrity ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_snapshot_mismatch_blocks_signing(
    client: AsyncClient, valid_invite, draft_lease, db_session
):
    token = valid_invite.token
    await _run_preview(client, token)
    await _run_accept(client, token)

    dk, rk = _idempotency_key(), _idempotency_key()
    pay = await _run_pay(client, token, dk, rk)
    await _confirm_all(client, token, pay)

    # Mutate the lease monthly_rent AFTER preview — simulates manager changing terms
    draft_lease.monthly_rent = 999_999
    await db_session.flush()

    r = await client.post(
        f"{_base(token)}/sign",
        json={"signatureDataUrl": "data:image/png;base64,AAAA"},
    )
    assert r.status_code == 409
    assert "changed" in r.json()["detail"].lower()


# ── Test 9: Not-approved tenant ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_unapproved_tenant_cannot_preview(
    client: AsyncClient, db_session: AsyncSession, org, unit
):
    # Create a tenant in 'submitted' (not approved) state
    tenant = await make_tenant(
        db_session, org,
        onboarding_state=OnboardingState.submitted,
        status=TenantStatus.inactive,
    )
    lease = await make_lease(db_session, org, unit, tenant)
    invite = await make_tenant_invite(
        db_session, org, tenant,
        lease_id=lease.id,
    )

    r = await client.post(f"{_base(invite.token)}/preview")
    assert r.status_code == 422
    assert "approved" in r.json()["detail"].lower()


# ── Test 10: Expired token ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_expired_token_returns_410(
    client: AsyncClient, db_session: AsyncSession, org, approved_tenant, draft_lease
):
    now = datetime.now(timezone.utc)
    invite = await make_tenant_invite(
        db_session, org, approved_tenant,
        lease_id=draft_lease.id,
        expires_at=now - timedelta(hours=1),   # already expired
    )

    r = await client.post(f"{_base(invite.token)}/preview")
    assert r.status_code == 410


# ── Test 11: No lease linked ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_no_lease_linked_returns_422(
    client: AsyncClient, db_session: AsyncSession, org, approved_tenant
):
    invite = await make_tenant_invite(
        db_session, org, approved_tenant,
        # No lease_id set
    )

    r = await client.post(f"{_base(invite.token)}/preview")
    assert r.status_code == 422
    assert "lease" in r.json()["detail"].lower()


# ── Test 12: Flow status endpoint ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_flow_status_returns_correct_step(
    client: AsyncClient, valid_invite, draft_lease
):
    token = valid_invite.token

    # Before any action
    r = await client.get(f"{_base(token)}/flow")
    assert r.status_code == 200
    data = r.json()
    assert data["onboardingPhase"] == "payment_flow"
    assert data["currentStep"] == "agreement_preview"

    # After preview
    await _run_preview(client, token)
    r = await client.get(f"{_base(token)}/flow")
    assert r.json()["currentStep"] == "terms_acceptance"

    # After accept
    await _run_accept(client, token)
    r = await client.get(f"{_base(token)}/flow")
    assert r.json()["currentStep"] == "payment"
