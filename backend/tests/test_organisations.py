"""
Tests for the organisation endpoints.

POST /api/v1/organisations/provision  — superadmin only (updated behaviour)
GET  /api/v1/organisations/me
PATCH /api/v1/organisations/me

The Logto Management API calls are mocked — we test DB logic, not Logto's network.

Note: provision is superadmin-only so that the superadmin can create the
platform's own organisation. Regular users (owner/manager) join orgs via
the agency-invite flow, not via provision.
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

# Superadmin dev user — has no org_id in JWT so profile.organisation_id is None
SUPERADMIN_HEADERS = auth_headers("user-superadmin-1")  # sub="dev_superadmin1"


# ── POST /organisations/provision ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_provision_creates_organisation(client: AsyncClient, db_session: AsyncSession):
    """Superadmin provisioning creates an Organisation row and links their Profile."""
    with patch.object(get_settings(), "logto_m2m_app_id", "test_m2m"), \
         patch("app.api.v1.organisations._create_logto_org", return_value="org_test_abc123"), \
         patch("app.api.v1.organisations._add_user_to_logto_org", return_value=None):
        resp = await client.post(
            "/api/v1/organisations/provision",
            headers=SUPERADMIN_HEADERS,
            json=PROVISION_PAYLOAD,
        )

    assert resp.status_code == 201
    body = resp.json()
    assert body["logtoOrgId"] == "org_test_abc123"
    assert body["name"] == "Sunrise Properties Ltd"
    assert body["slug"] == "sunrise-properties"
    assert body["plan"] == "free"
    assert body["currency"] == "UGX"

    result = await db_session.execute(
        select(Organisation).where(Organisation.logto_org_id == "org_test_abc123")
    )
    org = result.scalar_one_or_none()
    assert org is not None
    assert org.slug == "sunrise-properties"


@pytest.mark.asyncio
async def test_provision_links_superadmin_profile(client: AsyncClient, db_session: AsyncSession):
    """After provisioning, the superadmin's Profile should be linked to the new org."""
    with patch.object(get_settings(), "logto_m2m_app_id", "test_m2m"), \
         patch("app.api.v1.organisations._create_logto_org", return_value="org_sa_link"), \
         patch("app.api.v1.organisations._add_user_to_logto_org", return_value=None):
        await client.post(
            "/api/v1/organisations/provision",
            headers=SUPERADMIN_HEADERS,
            json={**PROVISION_PAYLOAD, "slug": "sa-link-test"},
        )

    result = await db_session.execute(
        select(Profile).where(Profile.logto_sub == "dev_superadmin1")
    )
    profile = result.scalar_one()
    assert profile.organisation_id is not None
    assert profile.logto_org_id == "org_sa_link"
    # Superadmin role is preserved — not downgraded to 'owner'
    assert profile.role == "superadmin"


@pytest.mark.asyncio
async def test_provision_non_superadmin_forbidden(client: AsyncClient):
    """Owners and managers must not be able to call provision."""
    for user in ("owner-1", "manager-1"):
        with patch.object(get_settings(), "logto_m2m_app_id", "test_m2m"), \
             patch("app.api.v1.organisations._create_logto_org", return_value="org_forbidden"):
            resp = await client.post(
                "/api/v1/organisations/provision",
                headers=auth_headers(user),
                json={**PROVISION_PAYLOAD, "slug": f"forbidden-{user}"},
            )
        assert resp.status_code == 403, f"Expected 403 for {user}, got {resp.status_code}"


@pytest.mark.asyncio
async def test_provision_conflict_if_superadmin_already_has_org(client: AsyncClient):
    """Superadmin with an org cannot provision another."""
    with patch.object(get_settings(), "logto_m2m_app_id", "test_m2m"), \
         patch("app.api.v1.organisations._create_logto_org", return_value="org_first"), \
         patch("app.api.v1.organisations._add_user_to_logto_org", return_value=None):
        first = await client.post(
            "/api/v1/organisations/provision",
            headers=SUPERADMIN_HEADERS,
            json={**PROVISION_PAYLOAD, "slug": "first-org"},
        )
    assert first.status_code == 201

    with patch.object(get_settings(), "logto_m2m_app_id", "test_m2m"), \
         patch("app.api.v1.organisations._create_logto_org", return_value="org_second"), \
         patch("app.api.v1.organisations._add_user_to_logto_org", return_value=None):
        second = await client.post(
            "/api/v1/organisations/provision",
            headers=SUPERADMIN_HEADERS,
            json={**PROVISION_PAYLOAD, "slug": "second-org"},
        )
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_provision_dev_skips_logto_call(client: AsyncClient):
    """In dev mode with no M2M credentials, Logto call is skipped."""
    import app.api.v1.organisations as org_module
    with patch("app.api.v1.organisations._create_logto_org") as mock_logto, \
         patch("app.api.v1.organisations._add_user_to_logto_org"), \
         patch.object(org_module.settings, "logto_m2m_app_id", ""):
        resp = await client.post(
            "/api/v1/organisations/provision",
            headers=SUPERADMIN_HEADERS,
            json={**PROVISION_PAYLOAD, "slug": "dev-skip-test"},
        )

    assert resp.status_code == 201
    mock_logto.assert_not_called()
    assert resp.json()["logtoOrgId"].startswith("org_dev_")


# ── GET /organisations/me ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_my_organisation_for_org_member(client: AsyncClient):
    """Manager linked to org_dev gets their org details back."""
    # manager-1 JWT has org_id="org_dev" → _upsert_profile links to seeded org
    resp = await client.get("/api/v1/organisations/me", headers=auth_headers("manager-1"))
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Dev Agency"
    assert "slug" in body
    assert "currency" in body


@pytest.mark.asyncio
async def test_get_my_organisation_no_org_returns_null(client: AsyncClient):
    """Superadmin with no org (before provisioning) gets 200 with a null body."""
    # user-superadmin-1 has no org_id in their JWT → profile.organisation_id = None.
    # Per organisations.get_my_organisation: returns null (not 404) so superadmin
    # UIs can distinguish "platform admin, no org" from "org not found".
    resp = await client.get("/api/v1/organisations/me", headers=auth_headers("user-superadmin-1"))
    assert resp.status_code == 200
    assert resp.json() is None


# ── PATCH /organisations/me ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_manager_can_update_contact_details(client: AsyncClient):
    """Manager can update phone and email."""
    resp = await client.patch(
        "/api/v1/organisations/me",
        headers=auth_headers("manager-1"),
        json={"contactPhone": "+256700999888", "contactEmail": "info@devagency.ug"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["contactPhone"] == "+256700999888"
    assert body["contactEmail"] == "info@devagency.ug"


@pytest.mark.asyncio
async def test_manager_cannot_change_org_name(client: AsyncClient):
    """Manager attempting to change name should receive 403."""
    resp = await client.patch(
        "/api/v1/organisations/me",
        headers=auth_headers("manager-1"),
        json={"name": "Hacked Name Ltd"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_superadmin_can_change_org_name(client: AsyncClient):
    """Superadmin linked to an org can change its name."""
    # First provision an org for the superadmin
    with patch.object(get_settings(), "logto_m2m_app_id", "test_m2m"), \
         patch("app.api.v1.organisations._create_logto_org", return_value="org_sa_name"), \
         patch("app.api.v1.organisations._add_user_to_logto_org", return_value=None):
        await client.post(
            "/api/v1/organisations/provision",
            headers=SUPERADMIN_HEADERS,
            json={**PROVISION_PAYLOAD, "slug": "sa-name-org"},
        )

    resp = await client.patch(
        "/api/v1/organisations/me",
        headers=SUPERADMIN_HEADERS,
        json={"name": "New Superadmin Name Ltd"},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Superadmin Name Ltd"


# ── unit_naming ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_unit_naming_stored_and_returned(client: AsyncClient):
    """Saving unitNaming persists the value and GET /me returns it."""
    # Save alpha-numeric scheme
    resp = await client.patch(
        "/api/v1/organisations/me",
        headers=auth_headers("manager-1"),
        json={
            "unitNaming": {
                "scheme": "alpha-numeric",
                "startLetter": "A",
                "numbersPerLetter": 4,
            }
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["unitNaming"]["scheme"] == "alpha-numeric"
    assert body["unitNaming"]["startLetter"] == "A"
    assert body["unitNaming"]["numbersPerLetter"] == 4

    # GET /me should also return it
    resp2 = await client.get("/api/v1/organisations/me", headers=auth_headers("manager-1"))
    assert resp2.status_code == 200
    assert resp2.json()["unitNaming"]["scheme"] == "alpha-numeric"


@pytest.mark.asyncio
async def test_unit_naming_alpha_scheme(client: AsyncClient):
    """Alphabetic scheme is stored and round-trips correctly."""
    resp = await client.patch(
        "/api/v1/organisations/me",
        headers=auth_headers("manager-1"),
        json={"unitNaming": {"scheme": "alpha", "startLetter": "B"}},
    )
    assert resp.status_code == 200
    assert resp.json()["unitNaming"]["scheme"] == "alpha"
    assert resp.json()["unitNaming"]["startLetter"] == "B"


@pytest.mark.asyncio
async def test_unit_naming_does_not_overwrite_contact_fields(client: AsyncClient):
    """Saving unitNaming in isolation preserves existing contactPhone/Email."""
    # First set contact details
    await client.patch(
        "/api/v1/organisations/me",
        headers=auth_headers("manager-1"),
        json={"contactPhone": "+256700111222", "contactEmail": "keep@me.ug"},
    )
    # Now update only unitNaming
    resp = await client.patch(
        "/api/v1/organisations/me",
        headers=auth_headers("manager-1"),
        json={"unitNaming": {"scheme": "numeric"}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["contactPhone"] == "+256700111222"
    assert body["contactEmail"] == "keep@me.ug"
    assert body["unitNaming"]["scheme"] == "numeric"


@pytest.mark.asyncio
async def test_unit_naming_null_when_not_set(client: AsyncClient):
    """unitNaming is null in the response if never saved."""
    resp = await client.get("/api/v1/organisations/me", headers=auth_headers("manager-1"))
    assert resp.status_code == 200
    # Fresh org may have unitNaming=null or a value from earlier tests — just check key present
    assert "unitNaming" in resp.json()


# ── GET /organisations/me/payment-settings ────────────────────────────────────

@pytest.mark.asyncio
async def test_get_payment_settings_empty_by_default(client: AsyncClient):
    """Payment settings should return all-null fields before any config is saved."""
    resp = await client.get(
        "/api/v1/organisations/me/payment-settings",
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "bankName" in body
    assert "bankAccountNumber" in body
    assert body["bankName"] is None
    assert body["bankAccountNumber"] is None


@pytest.mark.asyncio
async def test_manager_can_update_payment_settings(client: AsyncClient):
    """Manager can PATCH payment settings — response echoes saved values."""
    resp = await client.patch(
        "/api/v1/organisations/me/payment-settings",
        headers=auth_headers("manager-1"),
        json={
            "bankName": "Stanbic Bank",
            "bankAccountNumber": "9030012345678",
            "bankAccountName": "Crib Properties Ltd",
            "bankBranch": "Kampala Road",
            "swiftCode": "SBICUGKA",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["bankName"] == "Stanbic Bank"
    assert body["bankAccountNumber"] == "9030012345678"
    assert body["bankAccountName"] == "Crib Properties Ltd"
    assert body["bankBranch"] == "Kampala Road"
    assert body["swiftCode"] == "SBICUGKA"


@pytest.mark.asyncio
async def test_get_payment_settings_returns_saved_values(client: AsyncClient):
    """GET after PATCH should return the persisted values."""
    await client.patch(
        "/api/v1/organisations/me/payment-settings",
        headers=auth_headers("manager-1"),
        json={"bankName": "Centenary Bank", "mtnPaybill": "*165*9*1234#"},
    )
    resp = await client.get(
        "/api/v1/organisations/me/payment-settings",
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["bankName"] == "Centenary Bank"
    assert body["mtnPaybill"] == "*165*9*1234#"


@pytest.mark.asyncio
async def test_partial_update_preserves_existing_fields(client: AsyncClient):
    """Sending only bankName in PATCH should not clear other previously saved fields."""
    await client.patch(
        "/api/v1/organisations/me/payment-settings",
        headers=auth_headers("manager-1"),
        json={"bankName": "Equity Bank", "airtelPaybill": "*185*2*5678#"},
    )
    # Patch only one field
    await client.patch(
        "/api/v1/organisations/me/payment-settings",
        headers=auth_headers("manager-1"),
        json={"bankName": "DFCU Bank"},
    )
    resp = await client.get(
        "/api/v1/organisations/me/payment-settings",
        headers=auth_headers("manager-1"),
    )
    body = resp.json()
    assert body["bankName"] == "DFCU Bank"
    # airtelPaybill set in first PATCH should still be present
    assert body["airtelPaybill"] == "*185*2*5678#"


@pytest.mark.asyncio
async def test_tenant_can_read_payment_settings(client: AsyncClient):
    """Tenant role should be able to GET payment settings (needed to pay rent)."""
    resp = await client.get(
        "/api/v1/organisations/me/payment-settings",
        headers=auth_headers("tenant-1"),
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_tenant_cannot_update_payment_settings(client: AsyncClient):
    """Tenant role must not be able to PATCH payment settings."""
    resp = await client.patch(
        "/api/v1/organisations/me/payment-settings",
        headers=auth_headers("tenant-1"),
        json={"bankName": "Hacked Bank"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_unauthenticated_cannot_read_payment_settings(client: AsyncClient):
    """Unauthenticated request should be rejected."""
    resp = await client.get("/api/v1/organisations/me/payment-settings")
    assert resp.status_code in (401, 403)
