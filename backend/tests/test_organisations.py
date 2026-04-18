"""
Tests for POST /api/v1/organisations/provision.

The Logto Management API call is mocked — we test our DB logic,
not Logto's network behaviour.
"""

from unittest.mock import patch

from app.core.config import get_settings

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organisation import Organisation
from app.models.profile import Profile
from tests.conftest import auth_headers


PROVISION_PAYLOAD = {
    "name": "Sunrise Properties Ltd",
    "slug": "sunrise-properties",
    "country": "UG",
    "currency": "UGX",
}


@pytest.mark.asyncio
async def test_provision_creates_organisation(client: AsyncClient, db_session: AsyncSession):
    """Provisioning should create an Organisation row and link the caller's Profile."""
    with patch.object(get_settings(), "logto_m2m_app_id", "test_m2m"), \
         patch("app.api.v1.organisations._create_logto_org", return_value="org_test_abc123"):
        resp = await client.post(
            "/api/v1/organisations/provision",
            headers=auth_headers("owner-1"),
            json=PROVISION_PAYLOAD,
        )

    assert resp.status_code == 201
    body = resp.json()
    assert body["logtoOrgId"] == "org_test_abc123"
    assert body["name"] == "Sunrise Properties Ltd"
    assert body["slug"] == "sunrise-properties"
    assert body["plan"] == "starter"
    assert body["currency"] == "UGX"

    # Organisation row was persisted
    result = await db_session.execute(
        select(Organisation).where(Organisation.logto_org_id == "org_test_abc123")
    )
    org = result.scalar_one_or_none()
    assert org is not None
    assert org.slug == "sunrise-properties"


@pytest.mark.asyncio
async def test_provision_links_caller_profile(client: AsyncClient, db_session: AsyncSession):
    """After provisioning, the caller's Profile should be role=owner and linked to the org."""
    with patch.object(get_settings(), "logto_m2m_app_id", "test_m2m"), \
         patch("app.api.v1.organisations._create_logto_org", return_value="org_test_owner_link"):
        await client.post(
            "/api/v1/organisations/provision",
            headers=auth_headers("owner-1"),
            json={**PROVISION_PAYLOAD, "slug": "owner-link-test"},
        )

    result = await db_session.execute(
        select(Profile).where(Profile.logto_sub == "dev_owner1")
    )
    profile = result.scalar_one()
    assert profile.role == "owner"
    assert profile.organisation_id is not None
    assert profile.logto_org_id == "org_test_owner_link"


@pytest.mark.asyncio
async def test_provision_conflict_if_already_in_org(client: AsyncClient):
    """A user who already belongs to an org cannot provision another."""
    with patch.object(get_settings(), "logto_m2m_app_id", "test_m2m"), \
         patch("app.api.v1.organisations._create_logto_org", return_value="org_first"):
        first = await client.post(
            "/api/v1/organisations/provision",
            headers=auth_headers("owner-1"),
            json={**PROVISION_PAYLOAD, "slug": "first-org"},
        )
    assert first.status_code == 201

    # Second attempt should conflict
    with patch.object(get_settings(), "logto_m2m_app_id", "test_m2m"), \
         patch("app.api.v1.organisations._create_logto_org", return_value="org_second"):
        second = await client.post(
            "/api/v1/organisations/provision",
            headers=auth_headers("owner-1"),
            json={**PROVISION_PAYLOAD, "slug": "second-org"},
        )
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_provision_dev_skips_logto_call(client: AsyncClient):
    """In dev mode with no M2M credentials, Logto call is skipped (stub org ID used)."""
    import app.api.v1.organisations as org_module
    with patch(
        "app.api.v1.organisations._create_logto_org"
    ) as mock_logto, \
    patch.object(org_module.settings, "logto_m2m_app_id", ""):
        resp = await client.post(
            "/api/v1/organisations/provision",
            headers=auth_headers("manager-1"),
            json={**PROVISION_PAYLOAD, "slug": "dev-skip-test"},
        )

    assert resp.status_code == 201
    mock_logto.assert_not_called()
    assert resp.json()["logtoOrgId"].startswith("org_dev_")
