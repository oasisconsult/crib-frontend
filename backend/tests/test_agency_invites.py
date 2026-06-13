"""
Tests for agency invite endpoints.

Covers:
  - POST /agency-invites  — superadmin creates invite
  - GET  /agency-invites  — list invites
  - DELETE /agency-invites/{id} — revoke
  - GET  /agency-invites/onboarding/{token} — public fetch
  - POST /agency-invites/onboarding/{token}/complete — public complete (mocked Logto)
  - RBAC: manager cannot create agency invites (superadmin only)
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agency_invite import AgencyInvite, AgencyInviteStatus
from tests.conftest import auth_headers


INVITE_PAYLOAD = {
    "agencyName": "Sunrise Properties Ltd",
    "managerEmail": "tom@sunrise.ug",
    "managerFirstName": "Tom",
    "managerLastName": "Mukasa",
    "agencyPhone": "+256700000001",
    "agencyCountry": "Uganda",
    "agencyCurrency": "UGX",
}


# ── Create invite ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_superadmin_can_create_agency_invite(client: AsyncClient, db_session: AsyncSession):
    """Superadmin can create an agency invite."""
    await client.get("/api/v1/me", headers=auth_headers("superadmin-1"))

    resp = await client.post(
        "/api/v1/agency-invites",
        headers=auth_headers("superadmin-1"),
        json=INVITE_PAYLOAD,
    )

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["agencyName"] == "Sunrise Properties Ltd"
    assert body["managerEmail"] == "tom@sunrise.ug"
    assert body["status"] == "pending"


@pytest.mark.asyncio
async def test_manager_cannot_create_agency_invite(client: AsyncClient, db_session: AsyncSession):
    """Non-superadmin roles must receive 403."""
    await client.get("/api/v1/me", headers=auth_headers("manager-1"))

    resp = await client.post(
        "/api/v1/agency-invites",
        headers=auth_headers("manager-1"),
        json=INVITE_PAYLOAD,
    )
    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_tenant_cannot_create_agency_invite(client: AsyncClient, db_session: AsyncSession):
    await client.get("/api/v1/me", headers=auth_headers("tenant-1"))

    resp = await client.post(
        "/api/v1/agency-invites",
        headers=auth_headers("tenant-1"),
        json=INVITE_PAYLOAD,
    )
    assert resp.status_code == 403, resp.text


# ── List ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_agency_invites(client: AsyncClient, db_session: AsyncSession):
    """Superadmin can list all agency invites."""
    await client.get("/api/v1/me", headers=auth_headers("superadmin-1"))

    # Create one first
    await client.post(
        "/api/v1/agency-invites",
        headers=auth_headers("superadmin-1"),
        json={**INVITE_PAYLOAD, "managerEmail": "list-test@sunrise.ug"},
    )

    resp = await client.get("/api/v1/agency-invites", headers=auth_headers("superadmin-1"))
    assert resp.status_code == 200
    emails = [i["managerEmail"] for i in resp.json()]
    assert "list-test@sunrise.ug" in emails


# ── Revoke ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_revoke_agency_invite(client: AsyncClient, db_session: AsyncSession):
    """Superadmin can revoke a pending invite."""
    await client.get("/api/v1/me", headers=auth_headers("superadmin-1"))

    create_resp = await client.post(
        "/api/v1/agency-invites",
        headers=auth_headers("superadmin-1"),
        json={**INVITE_PAYLOAD, "managerEmail": "revoke-agency@sunrise.ug"},
    )
    assert create_resp.status_code == 201
    invite_id = create_resp.json()["id"]

    del_resp = await client.delete(
        f"/api/v1/agency-invites/{invite_id}",
        headers=auth_headers("superadmin-1"),
    )
    assert del_resp.status_code == 200

    result = await db_session.execute(
        select(AgencyInvite).where(AgencyInvite.id == invite_id)
    )
    invite = result.scalar_one()
    assert invite.status == AgencyInviteStatus.REVOKED


# ── Public onboarding ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_agency_onboarding_get_valid_token(client: AsyncClient, db_session: AsyncSession):
    """GET /agency-invites/onboarding/{token} returns invite details."""
    await client.get("/api/v1/me", headers=auth_headers("superadmin-1"))

    await client.post(
        "/api/v1/agency-invites",
        headers=auth_headers("superadmin-1"),
        json={**INVITE_PAYLOAD, "managerEmail": "onboard-agency@sunrise.ug"},
    )

    result = await db_session.execute(
        select(AgencyInvite).where(AgencyInvite.manager_email == "onboard-agency@sunrise.ug")
    )
    invite = result.scalar_one()
    token = invite.token

    # No auth
    resp = await client.get(f"/api/v1/agency-invites/onboarding/{token}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["agencyName"] == "Sunrise Properties Ltd"
    assert body["managerEmail"] == "onboard-agency@sunrise.ug"


@pytest.mark.asyncio
async def test_agency_onboarding_invalid_token(client: AsyncClient):
    resp = await client.get("/api/v1/agency-invites/onboarding/bad-token-xyz")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_agency_onboarding_complete(client: AsyncClient, db_session: AsyncSession):
    """POST /agency-invites/onboarding/{token}/complete creates org + manager profile."""
    await client.get("/api/v1/me", headers=auth_headers("superadmin-1"))

    await client.post(
        "/api/v1/agency-invites",
        headers=auth_headers("superadmin-1"),
        json={**INVITE_PAYLOAD, "managerEmail": "complete-agency@sunrise.ug"},
    )

    result = await db_session.execute(
        select(AgencyInvite).where(AgencyInvite.manager_email == "complete-agency@sunrise.ug")
    )
    invite = result.scalar_one()
    token = invite.token

    with patch(
        "app.services.logto_service.create_agency_with_manager",
        new_callable=AsyncMock,
        return_value=("org_logto_abc", "user_logto_xyz"),
    ), patch(
        "app.services.logto_service.send_agency_manager_welcome_email",
        new_callable=AsyncMock,
    ):
        resp = await client.post(
            f"/api/v1/agency-invites/onboarding/{token}/complete",
            json={
                "agencyName": "Sunrise Properties Ltd",
                "managerFirstName": "Tom",
                "managerLastName": "Mukasa",
                "agencyCurrency": "UGX",
                "agencyCountry": "UG",
            },
        )

    assert resp.status_code == 201, resp.text

    await db_session.refresh(invite)
    assert invite.status == AgencyInviteStatus.ACCEPTED
    assert invite.accepted_at is not None
    assert invite.organisation_id is not None


@pytest.mark.asyncio
async def test_agency_onboarding_expired_410(client: AsyncClient, db_session: AsyncSession):
    """Expired agency invite token returns 410."""
    await client.get("/api/v1/me", headers=auth_headers("superadmin-1"))

    from app.models.profile import Profile
    from sqlalchemy import select as sa_select

    result = await db_session.execute(
        sa_select(Profile).where(Profile.logto_sub == "dev_superadmin1")
    )
    profile = result.scalar_one()

    expired = AgencyInvite(
        invited_by_profile_id=profile.id,
        agency_name="Old Agency",
        manager_email="old@agency.com",
        manager_first_name="Old",
        manager_last_name="Agency",
        token="expired-agency-token-xyz",
        status=AgencyInviteStatus.PENDING,
        expires_at=datetime.now(timezone.utc) - timedelta(days=1),
    )
    db_session.add(expired)
    await db_session.flush()

    resp = await client.get("/api/v1/agency-invites/onboarding/expired-agency-token-xyz")
    assert resp.status_code == 410
