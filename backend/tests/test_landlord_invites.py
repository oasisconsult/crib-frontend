"""
Tests for landlord invite endpoints.

Covers:
  - POST /landlords/invites  — manager creates invite
  - GET  /landlords/invites  — list invites
  - DELETE /landlords/invites/{id} — revoke invite
  - GET  /landlords/onboarding/{token} — public fetch (no auth)
  - POST /landlords/onboarding/{token}/complete — public complete (mocked Logto)
  - RBAC: tenant cannot create invites
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.landlord_invite import LandlordInvite, InviteStatus
from tests.conftest import auth_headers, get_dev_org
from tests.factories import make_property


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
async def professional_subscription(db_session: AsyncSession):
    """Upgrade org_dev to agency plan for the duration of each invite test.

    Landlord invites require the 'team_members' feature (Agency+). The default
    free plan would 402. This fixture seeds an agency subscription within the
    test's db_session transaction — it is rolled back automatically when the
    test ends.
    """
    await db_session.execute(sa.text("""
        INSERT INTO organisation_subscriptions
            (organisation_id, plan_id, status, billing_cycle, currency,
             current_period_start, current_period_end, auto_renew,
             created_at, updated_at)
        SELECT
            o.id,
            p.id,
            'active',
            'monthly',
            'UGX',
            NOW(),
            NOW() + INTERVAL '10 years',
            true,
            NOW(),
            NOW()
        FROM organisations o, subscription_plans p
        WHERE o.logto_org_id = 'org_dev'
          AND p.slug = 'agency'
        ON CONFLICT (organisation_id) DO UPDATE
            SET plan_id = EXCLUDED.plan_id, status = 'active'
    """))
    await db_session.flush()


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _seed_org_with_property(db: AsyncSession):
    """Fetch org_dev + create a property, ensuring manager-1's profile is linked."""
    from sqlalchemy import select as sa_select
    from app.models.profile import Profile

    org = await get_dev_org(db)
    prop = await make_property(db, org, name="Nakasero Flats")

    result = await db.execute(sa_select(Profile).where(Profile.logto_sub == "dev_manager1"))
    manager = result.scalar_one_or_none()
    if manager:
        manager.organisation_id = org.id

    await db.flush()
    return org, prop


# ── Create invite ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_landlord_invite_ok(client: AsyncClient, db_session: AsyncSession):
    """Manager can create a landlord invite for a property in their org."""
    # Ensure manager profile exists
    await client.get("/api/v1/me", headers=auth_headers("manager-1"))

    org, prop = await _seed_org_with_property(db_session)

    resp = await client.post(
        "/api/v1/landlords/invites",
        headers=auth_headers("manager-1"),
        json={
            "email": "landlord@example.com",
            "firstName": "Jane",
            "lastName": "Smith",
            "propertyIds": [str(prop.id)],
        },
    )

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["email"] == "landlord@example.com"
    assert body["firstName"] == "Jane"
    assert body["status"] == "pending"
    assert str(prop.id) in body["propertyIds"]


@pytest.mark.asyncio
async def test_create_invite_unknown_property_rejected(client: AsyncClient, db_session: AsyncSession):
    """Invite with a property not belonging to the org should 404."""
    await client.get("/api/v1/me", headers=auth_headers("manager-1"))
    await _seed_org_with_property(db_session)  # link manager to org

    import uuid
    resp = await client.post(
        "/api/v1/landlords/invites",
        headers=auth_headers("manager-1"),
        json={
            "email": "x@example.com",
            "firstName": "X",
            "lastName": "Y",
            "propertyIds": [str(uuid.uuid4())],
        },
    )
    assert resp.status_code in (400, 404, 422), resp.text


@pytest.mark.asyncio
async def test_tenant_cannot_create_invite(client: AsyncClient, db_session: AsyncSession):
    """Tenants must not be able to create landlord invites (403)."""
    await client.get("/api/v1/me", headers=auth_headers("tenant-1"))

    org, prop = await _seed_org_with_property(db_session)

    resp = await client.post(
        "/api/v1/landlords/invites",
        headers=auth_headers("tenant-1"),
        json={
            "email": "x@example.com",
            "firstName": "X",
            "lastName": "Y",
            "propertyIds": [str(prop.id)],
        },
    )
    assert resp.status_code == 403, resp.text


# ── List invites ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_invites_returns_own_org(client: AsyncClient, db_session: AsyncSession):
    """GET /landlords/invites only returns invites for the caller's org."""
    await client.get("/api/v1/me", headers=auth_headers("manager-1"))

    org, prop = await _seed_org_with_property(db_session)

    await client.post(
        "/api/v1/landlords/invites",
        headers=auth_headers("manager-1"),
        json={
            "email": "listed@example.com",
            "firstName": "Listed",
            "lastName": "User",
            "propertyIds": [str(prop.id)],
        },
    )

    resp = await client.get("/api/v1/landlords/invites", headers=auth_headers("manager-1"))
    assert resp.status_code == 200
    emails = [i["email"] for i in resp.json()]
    assert "listed@example.com" in emails


# ── Revoke ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_revoke_invite(client: AsyncClient, db_session: AsyncSession):
    """Manager can revoke a pending invite."""
    await client.get("/api/v1/me", headers=auth_headers("manager-1"))

    org, prop = await _seed_org_with_property(db_session)

    create_resp = await client.post(
        "/api/v1/landlords/invites",
        headers=auth_headers("manager-1"),
        json={
            "email": "revoke@example.com",
            "firstName": "Revoke",
            "lastName": "Me",
            "propertyIds": [str(prop.id)],
        },
    )
    assert create_resp.status_code == 201
    invite_id = create_resp.json()["id"]

    del_resp = await client.delete(
        f"/api/v1/landlords/invites/{invite_id}",
        headers=auth_headers("manager-1"),
    )
    assert del_resp.status_code == 200

    # Verify revoked in DB
    result = await db_session.execute(
        select(LandlordInvite).where(LandlordInvite.id == invite_id)
    )
    invite = result.scalar_one()
    assert invite.status == InviteStatus.REVOKED


# ── Public onboarding ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_onboarding_get_valid_token(client: AsyncClient, db_session: AsyncSession):
    """GET /landlords/onboarding/{token} returns invite details for a valid token."""
    await client.get("/api/v1/me", headers=auth_headers("manager-1"))

    org, prop = await _seed_org_with_property(db_session)

    create_resp = await client.post(
        "/api/v1/landlords/invites",
        headers=auth_headers("manager-1"),
        json={
            "email": "onboard@example.com",
            "firstName": "Onboard",
            "lastName": "Me",
            "propertyIds": [str(prop.id)],
        },
    )
    assert create_resp.status_code == 201

    # Fetch token from DB
    result = await db_session.execute(
        select(LandlordInvite).where(LandlordInvite.email == "onboard@example.com")
    )
    invite = result.scalar_one()
    token = invite.token

    # No auth header — public endpoint
    resp = await client.get(f"/api/v1/landlords/onboarding/{token}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "onboard@example.com"
    assert body["firstName"] == "Onboard"
    assert "agencyName" in body
    assert "properties" in body


@pytest.mark.asyncio
async def test_onboarding_invalid_token_404(client: AsyncClient):
    """GET /landlords/onboarding/{token} with bad token returns 404."""
    resp = await client.get("/api/v1/landlords/onboarding/not-a-real-token")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_onboarding_complete(client: AsyncClient, db_session: AsyncSession):
    """POST /landlords/onboarding/{token}/complete creates profile and marks invite accepted."""
    await client.get("/api/v1/me", headers=auth_headers("manager-1"))

    org, prop = await _seed_org_with_property(db_session)

    create_resp = await client.post(
        "/api/v1/landlords/invites",
        headers=auth_headers("manager-1"),
        json={
            "email": "complete@example.com",
            "firstName": "Complete",
            "lastName": "Me",
            "propertyIds": [str(prop.id)],
        },
    )
    assert create_resp.status_code == 201

    result = await db_session.execute(
        select(LandlordInvite).where(LandlordInvite.email == "complete@example.com")
    )
    invite = result.scalar_one()
    token = invite.token

    with patch(
        "app.services.logto_service.create_landlord_user",
        new_callable=AsyncMock,
        return_value=("logto_user_abc", True),
    ), patch(
        "app.services.logto_service.send_landlord_welcome_email",
        new_callable=AsyncMock,
    ):
        resp = await client.post(
            f"/api/v1/landlords/onboarding/{token}/complete",
            json={"firstName": "Complete", "lastName": "Me", "password": "SecurePass123!"},
        )

    assert resp.status_code == 201, resp.text

    # Invite should be accepted
    await db_session.refresh(invite)
    assert invite.status == InviteStatus.ACCEPTED
    assert invite.accepted_at is not None


@pytest.mark.asyncio
async def test_onboarding_expired_token_410(client: AsyncClient, db_session: AsyncSession):
    """Expired token should return 410."""
    await client.get("/api/v1/me", headers=auth_headers("manager-1"))

    org, prop = await _seed_org_with_property(db_session)

    # Insert an expired invite directly
    expired = LandlordInvite(
        organisation_id=org.id,
        email="expired@example.com",
        first_name="Exp",
        last_name="Ired",
        property_ids=[str(prop.id)],
        token="expired-token-xyz",
        status=InviteStatus.PENDING,
        expires_at=datetime.now(timezone.utc) - timedelta(days=1),
    )
    db_session.add(expired)
    await db_session.flush()

    resp = await client.get("/api/v1/landlords/onboarding/expired-token-xyz")
    assert resp.status_code == 410
