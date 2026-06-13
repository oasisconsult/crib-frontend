"""
Tests for /api/v1/me endpoints.

Covers:
  - GET  /me  returns correct profile shape
  - POST /me/consent sets gdpr_consent_given = True
  - PATCH /me updates display_name and phone
  - PATCH /me ignores None fields (partial update)
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile import Profile
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_get_me_shape(client: AsyncClient):
    resp = await client.get("/api/v1/me", headers=auth_headers("manager-1"))
    assert resp.status_code == 200
    body = resp.json()

    # All expected fields present
    for field in ("id", "logtoSub", "role", "displayName", "email", "gdprConsentGiven", "isReadOnly"):
        assert field in body, f"Missing field: {field}"

    assert body["gdprConsentGiven"] is False  # default
    assert body["isReadOnly"] is False  # default — non-landlord profiles are never read-only


@pytest.mark.asyncio
async def test_consent_sets_flag(client: AsyncClient, db_session: AsyncSession):
    # Ensure profile exists first
    await client.get("/api/v1/me", headers=auth_headers("tenant-1"))

    resp = await client.post("/api/v1/me/consent", headers=auth_headers("tenant-1"))
    assert resp.status_code == 200
    assert resp.json()["gdprConsentGiven"] is True

    # Verify persisted
    result = await db_session.execute(
        select(Profile).where(Profile.logto_sub == "dev_tenant1")
    )
    profile = result.scalar_one()
    assert profile.gdpr_consent_given is True
    assert profile.gdpr_consent_at is not None


@pytest.mark.asyncio
async def test_patch_me_display_name(client: AsyncClient, db_session: AsyncSession):
    await client.get("/api/v1/me", headers=auth_headers("owner-1"))

    resp = await client.patch(
        "/api/v1/me",
        headers=auth_headers("owner-1"),
        json={"displayName": "Alice Nakawunde"},
    )
    assert resp.status_code == 200
    assert resp.json()["displayName"] == "Alice Nakawunde"

    result = await db_session.execute(
        select(Profile).where(Profile.logto_sub == "dev_owner1")
    )
    assert result.scalar_one().display_name == "Alice Nakawunde"


@pytest.mark.asyncio
async def test_patch_me_phone_only(client: AsyncClient):
    await client.get("/api/v1/me", headers=auth_headers("tenant-2"))

    resp = await client.patch(
        "/api/v1/me",
        headers=auth_headers("tenant-2"),
        json={"phone": "+256700123456"},
    )
    assert resp.status_code == 200
    assert resp.json()["phone"] == "+256700123456"


@pytest.mark.asyncio
async def test_patch_me_null_fields_ignored(client: AsyncClient):
    """Sending null for a field should not overwrite an existing value."""
    await client.get("/api/v1/me", headers=auth_headers("manager-1"))

    # Set display name first
    await client.patch(
        "/api/v1/me",
        headers=auth_headers("manager-1"),
        json={"displayName": "Bob Ssemwanga"},
    )

    # Patch with null display_name — should NOT wipe the value
    resp = await client.patch(
        "/api/v1/me",
        headers=auth_headers("manager-1"),
        json={"phone": "+256701999888"},
    )
    assert resp.status_code == 200
    # display_name should still be Bob (not overwritten by the JWT cache value)
    assert resp.json()["displayName"] == "Bob Ssemwanga"
