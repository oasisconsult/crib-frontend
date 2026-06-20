"""
Tests for the authentication / security layer.

Covers:
  - Dev bypass via X-Dev-User-Id header
  - Missing Authorization header → 401
  - Malformed Bearer token → 401
  - Profile is created on first authenticated request
  - Profile is reused on subsequent requests (same logto_sub)
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile import Profile
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_dev_bypass_manager(client: AsyncClient):
    """X-Dev-User-Id: manager-1 should authenticate successfully."""
    resp = await client.get("/api/v1/me", headers=auth_headers("manager-1"))
    assert resp.status_code == 200
    body = resp.json()
    assert body["role"] == "manager"
    assert body["logtoSub"] == "dev_manager1"


@pytest.mark.asyncio
async def test_dev_bypass_tenant(client: AsyncClient):
    resp = await client.get("/api/v1/me", headers=auth_headers("tenant-1"))
    assert resp.status_code == 200
    assert resp.json()["role"] == "tenant"


@pytest.mark.asyncio
async def test_dev_bypass_owner(client: AsyncClient):
    resp = await client.get("/api/v1/me", headers=auth_headers("owner-1"))
    assert resp.status_code == 200
    assert resp.json()["role"] == "owner"


@pytest.mark.asyncio
async def test_unknown_dev_user_falls_through_to_bearer(client: AsyncClient):
    """An unknown X-Dev-User-Id with no Bearer token should return 401."""
    resp = await client.get("/api/v1/me", headers={"X-Dev-User-Id": "ghost-99"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_missing_auth_header(client: AsyncClient):
    resp = await client.get("/api/v1/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_malformed_bearer(client: AsyncClient):
    resp = await client.get("/api/v1/me", headers={"Authorization": "Bearer not.a.jwt"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_profile_created_on_first_request(client: AsyncClient, db_session: AsyncSession):
    """Calling /me for the first time should create a Profile row."""
    resp = await client.get("/api/v1/me", headers=auth_headers("manager-1"))
    assert resp.status_code == 200

    result = await db_session.execute(
        select(Profile).where(Profile.logto_sub == "dev_manager1")
    )
    profile = result.scalar_one_or_none()
    assert profile is not None
    assert profile.role == "manager"
    assert profile.email == "manager@dev.local"


@pytest.mark.asyncio
async def test_profile_not_duplicated_on_second_request(client: AsyncClient, db_session: AsyncSession):
    """Two requests with the same user should not create duplicate Profile rows."""
    await client.get("/api/v1/me", headers=auth_headers("owner-1"))
    await client.get("/api/v1/me", headers=auth_headers("owner-1"))

    result = await db_session.execute(
        select(Profile).where(Profile.logto_sub == "dev_owner1")
    )
    profiles = result.scalars().all()
    assert len(profiles) == 1


@pytest.mark.asyncio
async def test_foreign_role_does_not_overwrite_onboarding_role(db_session: AsyncSession):
    from app.api.deps import _upsert_profile
    from app.core.security import TokenClaims

    profile = Profile(
        logto_sub='test_foreign_role_landlord',
        logto_org_id='org_foreign_test',
        organisation_id=None,
        role='landlord',
        email='landlord@foreigntest.local',
    )
    db_session.add(profile)
    await db_session.flush()

    claims = TokenClaims(sub='test_foreign_role_landlord', org_id='org_foreign_test', email='landlord@foreigntest.local')
    updated = await _upsert_profile(claims, db_session, rbac_roles=['resident'])
    assert updated.role == 'landlord'


@pytest.mark.asyncio
async def test_known_crib_role_update_is_applied(db_session: AsyncSession):
    from app.api.deps import _upsert_profile
    from app.core.security import TokenClaims

    profile = Profile(
        logto_sub='test_crib_role_upgrade',
        logto_org_id='org_upgrade_test',
        organisation_id=None,
        role='tenant',
        email='user@upgradetest.local',
    )
    db_session.add(profile)
    await db_session.flush()

    claims = TokenClaims(sub='test_crib_role_upgrade', org_id='org_upgrade_test', email='user@upgradetest.local')
    updated = await _upsert_profile(claims, db_session, rbac_roles=['manager'])
    assert updated.role == 'manager'
