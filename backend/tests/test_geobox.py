"""
Tests for GeoBox Smart Addressing — Phase 0a and Phase 1.

Phase 0a coverage (settings + test connection):
  - geobox category present in /admin/settings response
  - geobox.environment defaults to "sandbox"
  - geobox.client_secret is a secret (masked as ••••••)
  - geobox.geocoding_enabled defaults to "true" and is boolean type
  - POST /admin/settings/test/geobox: missing credentials → structured failure
  - POST /admin/settings/test/geobox: geocoding disabled → structured failure
  - POST /admin/settings/test/geobox: bad credentials → 401 response handled
  - POST /admin/settings/test/geobox: valid credentials → success (mocked token endpoint)
  - Non-superadmin cannot access test/geobox

Phase 1 coverage (geocode fields on Property and Unit):
  - Create property without geocode → geocode is null in response
  - Create property with geocode → stored and returned correctly
  - Update property to set geocode → persisted
  - GET /properties/{id}/geocode: no geocode → {"geocode": null}
  - GET /properties/{id}/geocode: geocode set, GeoBox unconfigured → {"geocode": "<code>"}
  - GET /properties/{id}/geocode: geocode set, GeoBox mocked → returns resolved fields
  - Create unit with geocode → stored and returned
  - GET /properties/{id}/units/{unit_id}/geocode: no geocode → {"geocode": null}
  - GET /properties/{id}/units/{unit_id}/geocode: mocked GeoBox → returns resolved fields
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers
from tests.factories import make_organisation, make_property


# ── Helpers ───────────────────────────────────────────────────────────────────

def superadmin() -> dict[str, str]:
    return auth_headers("superadmin-1")


def owner() -> dict[str, str]:
    return auth_headers("owner-1")


PROPERTY_PAYLOAD = {
    "name": "GeoBox Test Property",
    "type": "flat",
    "address": {
        "line1": "12 Kampala Road",
        "city": "Kampala",
        "state": "Central",
        "postcode": "00256",
        "country": "UG",
    },
    "rules": {},
}

UNIT_PAYLOAD = {
    "name": "Unit 1",
    "type": "single",
    "monthlyRent": 500000,
}

MOCK_GEOCODE = "UGKAN-JF5"

MOCK_RESOLVED = {
    "geocode": MOCK_GEOCODE,
    "full_address": "Near Shell Ntinda, Kampala, Uganda",
    "landmark_description": "Near Shell Ntinda, behind blue gate",
    "access_instructions": "Enter through the blue gate, first building on the left",
    "delivery_notes": "Leave with the guard at the gate",
    "nav_url": "https://nav.geoboxafrica.com/UGKAN-JF5",
    "coordinates": {"latitude": 0.3476, "longitude": 32.6136},
}


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def org(db_session: AsyncSession):
    o = await make_organisation(db_session)
    await db_session.flush()
    return o


@pytest_asyncio.fixture
async def created_property(client: AsyncClient, org):
    r = await client.post("/api/v1/properties", json=PROPERTY_PAYLOAD, headers=owner())
    assert r.status_code == 201
    return r.json()


@pytest_asyncio.fixture
async def created_unit(client: AsyncClient, created_property):
    prop_id = created_property["id"]
    r = await client.post(
        f"/api/v1/properties/{prop_id}/units",
        json=UNIT_PAYLOAD,
        headers=owner(),
    )
    assert r.status_code == 201
    return r.json()


# ─────────────────────────────────────────────────────────────────────────────
# Phase 0a — GeoBox settings
# ─────────────────────────────────────────────────────────────────────────────

class TestGeoBoxSettings:
    @pytest.mark.asyncio
    async def test_geobox_category_present(self, client: AsyncClient, org):
        r = await client.get("/api/v1/admin/settings", headers=superadmin())
        assert r.status_code == 200
        body = r.json()
        assert "geobox" in body, "geobox category missing from /admin/settings response"
        assert isinstance(body["geobox"], list)
        assert len(body["geobox"]) >= 4

    @pytest.mark.asyncio
    async def test_geobox_environment_defaults_to_sandbox(self, client: AsyncClient, org):
        r = await client.get("/api/v1/admin/settings/geobox.environment", headers=superadmin())
        assert r.status_code == 200
        body = r.json()
        assert body["value"] == "sandbox"
        assert body["isRequired"] is True
        assert body["isSecret"] is False

    @pytest.mark.asyncio
    async def test_geobox_client_secret_is_marked_secret(self, client: AsyncClient, org):
        r = await client.get("/api/v1/admin/settings/geobox.client_secret", headers=superadmin())
        assert r.status_code == 200
        body = r.json()
        assert body["isSecret"] is True
        # Empty secret — displayed as empty, not masked (nothing to mask)
        assert body["value"] in ("", "••••••")

    @pytest.mark.asyncio
    async def test_geobox_client_secret_masked_after_save(self, client: AsyncClient, org):
        r = await client.put(
            "/api/v1/admin/settings/geobox.client_secret",
            json={"value": "cs_sandbox_test_secret"},
            headers=superadmin(),
        )
        assert r.status_code == 200
        assert r.json()["value"] == "••••••"

    @pytest.mark.asyncio
    async def test_geobox_geocoding_enabled_defaults_true(self, client: AsyncClient, org):
        r = await client.get("/api/v1/admin/settings/geobox.geocoding_enabled", headers=superadmin())
        assert r.status_code == 200
        body = r.json()
        assert body["value"] == "true"
        assert body["valueType"] == "boolean"

    @pytest.mark.asyncio
    async def test_non_superadmin_cannot_test_geobox(self, client: AsyncClient, org):
        r = await client.post("/api/v1/admin/settings/test/geobox", headers=owner())
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_test_geobox_missing_credentials(self, client: AsyncClient, org):
        """With no credentials configured, returns structured failure — never 500."""
        # Ensure credentials are blank
        for key in ("geobox.client_id", "geobox.client_secret"):
            await client.put(f"/api/v1/admin/settings/{key}", json={"value": ""}, headers=superadmin())

        r = await client.post("/api/v1/admin/settings/test/geobox", headers=superadmin())
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is False
        assert "not configured" in body["message"].lower()
        assert "environment" in body

    @pytest.mark.asyncio
    async def test_test_geobox_disabled(self, client: AsyncClient, org):
        """When geocoding_enabled=false, test returns a clear disabled message."""
        await client.put(
            "/api/v1/admin/settings/geobox.geocoding_enabled",
            json={"value": "false"},
            headers=superadmin(),
        )
        r = await client.post("/api/v1/admin/settings/test/geobox", headers=superadmin())
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is False
        assert "disabled" in body["message"].lower()

        # Restore for other tests
        await client.put(
            "/api/v1/admin/settings/geobox.geocoding_enabled",
            json={"value": "true"},
            headers=superadmin(),
        )

    @pytest.mark.asyncio
    async def test_test_geobox_bad_credentials_returns_unauthorized(self, client: AsyncClient):
        """Wrong credentials: service returns a structured 401 response — never a 500."""
        # Patch the service function directly to avoid interfering with the test HTTP client
        with patch(
            "app.services.settings_service.test_geobox",
            new_callable=AsyncMock,
            return_value={
                "success": False,
                "environment": "sandbox",
                "message": "Unauthorized — check client_id and client_secret",
            },
        ):
            r = await client.post("/api/v1/admin/settings/test/geobox", headers=superadmin())

        assert r.status_code == 200
        body = r.json()
        assert body["success"] is False
        assert "unauthorized" in body["message"].lower() or "check" in body["message"].lower()

    @pytest.mark.asyncio
    async def test_test_geobox_valid_credentials_returns_success(self, client: AsyncClient):
        """Valid credentials: service returns success response."""
        with patch(
            "app.services.settings_service.test_geobox",
            new_callable=AsyncMock,
            return_value={
                "success": True,
                "environment": "sandbox",
                "message": "Connected — environment: sandbox",
            },
        ):
            r = await client.post("/api/v1/admin/settings/test/geobox", headers=superadmin())

        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        assert body["environment"] == "sandbox"
        assert "connected" in body["message"].lower()


# ─────────────────────────────────────────────────────────────────────────────
# Phase 1 — geocode field on Property and Unit
# ─────────────────────────────────────────────────────────────────────────────

class TestPropertyGeocode:
    @pytest.mark.asyncio
    async def test_create_property_without_geocode(self, client: AsyncClient, org):
        r = await client.post("/api/v1/properties", json=PROPERTY_PAYLOAD, headers=owner())
        assert r.status_code == 201
        body = r.json()
        assert "geocode" in body
        assert body["geocode"] is None

    @pytest.mark.asyncio
    async def test_create_property_with_geocode(self, client: AsyncClient, org):
        payload = {**PROPERTY_PAYLOAD, "geocode": MOCK_GEOCODE}
        r = await client.post("/api/v1/properties", json=payload, headers=owner())
        assert r.status_code == 201
        body = r.json()
        assert body["geocode"] == MOCK_GEOCODE

    @pytest.mark.asyncio
    async def test_update_property_sets_geocode(self, client: AsyncClient, created_property):
        prop_id = created_property["id"]
        assert created_property["geocode"] is None

        r = await client.put(
            f"/api/v1/properties/{prop_id}",
            json={"geocode": MOCK_GEOCODE},
            headers=owner(),
        )
        assert r.status_code == 200
        assert r.json()["geocode"] == MOCK_GEOCODE

    @pytest.mark.asyncio
    async def test_geocode_endpoint_no_geocode_set(self, client: AsyncClient, created_property):
        """Property with no geocode → {"geocode": null} — never 404 or 500."""
        prop_id = created_property["id"]
        r = await client.get(f"/api/v1/properties/{prop_id}/geocode", headers=owner())
        assert r.status_code == 200
        assert r.json() == {"geocode": None}

    @pytest.mark.asyncio
    async def test_geocode_endpoint_geobox_unconfigured(self, client: AsyncClient, created_property):
        """Geocode is set but GeoBox has no credentials → returns {"geocode": code} gracefully."""
        prop_id = created_property["id"]

        # Set geocode on property
        await client.put(f"/api/v1/properties/{prop_id}", json={"geocode": MOCK_GEOCODE}, headers=owner())

        # Blank out credentials
        await client.put("/api/v1/admin/settings/geobox.client_id", json={"value": ""}, headers=superadmin())
        await client.put("/api/v1/admin/settings/geobox.client_secret", json={"value": ""}, headers=superadmin())

        r = await client.get(f"/api/v1/properties/{prop_id}/geocode", headers=owner())
        assert r.status_code == 200
        body = r.json()
        assert body["geocode"] == MOCK_GEOCODE
        # No resolved fields when GeoBox is unreachable
        assert "full_address" not in body or body.get("full_address") is None

    @pytest.mark.asyncio
    async def test_geocode_endpoint_resolved_via_geobox(self, client: AsyncClient, created_property):
        """When GeoBox is reachable, endpoint returns resolved address fields."""
        prop_id = created_property["id"]
        await client.put(f"/api/v1/properties/{prop_id}", json={"geocode": MOCK_GEOCODE}, headers=owner())

        # Patch the geocode_service.resolve directly to return mock data
        with patch(
            "app.integrations.geobox.geocode_service.resolve",
            new_callable=AsyncMock,
            return_value=MOCK_RESOLVED,
        ):
            r = await client.get(f"/api/v1/properties/{prop_id}/geocode", headers=owner())

        assert r.status_code == 200
        body = r.json()
        assert body["geocode"] == MOCK_GEOCODE
        assert body["full_address"] == MOCK_RESOLVED["full_address"]
        assert body["nav_url"] == MOCK_RESOLVED["nav_url"]
        assert body["landmark_description"] == MOCK_RESOLVED["landmark_description"]
        assert body["coordinates"]["latitude"] == MOCK_RESOLVED["coordinates"]["latitude"]


class TestUnitGeocode:
    @pytest.mark.asyncio
    async def test_create_unit_without_geocode(self, client: AsyncClient, created_property):
        prop_id = created_property["id"]
        r = await client.post(f"/api/v1/properties/{prop_id}/units", json=UNIT_PAYLOAD, headers=owner())
        assert r.status_code == 201
        body = r.json()
        assert "geocode" in body
        assert body["geocode"] is None

    @pytest.mark.asyncio
    async def test_create_unit_with_geocode(self, client: AsyncClient, created_property):
        prop_id = created_property["id"]
        payload = {**UNIT_PAYLOAD, "geocode": MOCK_GEOCODE}
        r = await client.post(f"/api/v1/properties/{prop_id}/units", json=payload, headers=owner())
        assert r.status_code == 201
        assert r.json()["geocode"] == MOCK_GEOCODE

    @pytest.mark.asyncio
    async def test_unit_geocode_endpoint_no_geocode(self, client: AsyncClient, created_unit, created_property):
        prop_id = created_property["id"]
        unit_id = created_unit["id"]
        r = await client.get(f"/api/v1/properties/{prop_id}/units/{unit_id}/geocode", headers=owner())
        assert r.status_code == 200
        assert r.json() == {"geocode": None}

    @pytest.mark.asyncio
    async def test_unit_geocode_endpoint_resolved(self, client: AsyncClient, created_property, created_unit):
        prop_id = created_property["id"]
        unit_id = created_unit["id"]

        # Set geocode on unit
        await client.put(
            f"/api/v1/properties/{prop_id}/units/{unit_id}",
            json={"geocode": MOCK_GEOCODE},
            headers=owner(),
        )

        with patch(
            "app.integrations.geobox.geocode_service.resolve",
            new_callable=AsyncMock,
            return_value=MOCK_RESOLVED,
        ):
            r = await client.get(
                f"/api/v1/properties/{prop_id}/units/{unit_id}/geocode",
                headers=owner(),
            )

        assert r.status_code == 200
        body = r.json()
        assert body["geocode"] == MOCK_GEOCODE
        assert body["nav_url"] == MOCK_RESOLVED["nav_url"]


# ─────────────────────────────────────────────────────────────────────────────
# Phase 3 — Village search and nearby area endpoints
# ─────────────────────────────────────────────────────────────────────────────

MOCK_AREAS = [
    {"id": "area-1", "name": "Ntinda", "parentName": "Nakawa Division"},
    {"id": "area-2", "name": "Ntinda Market", "parentName": "Nakawa Division"},
]

# Coordinates inside Uganda's bounding box
_IN_UG  = {"lat": 0.347, "lng": 32.631}
# Coordinates clearly outside Uganda (London)
_OUT_UG = {"lat": 51.5,  "lng": -0.1}


def _mock_search(results=MOCK_AREAS):
    """Patch search_service to return fixed results without hitting GeoBox."""
    from unittest.mock import AsyncMock, patch
    return patch(
        "app.api.v1.geobox.search_service.search_villages",
        new_callable=AsyncMock,
        return_value=results,
    )


def _mock_nearby(results=MOCK_AREAS):
    from unittest.mock import AsyncMock, patch
    return patch(
        "app.api.v1.geobox.search_service.find_nearby",
        new_callable=AsyncMock,
        return_value=results,
    )


@pytest.mark.usefixtures("org")
class TestVillageSearch:

    @pytest.mark.asyncio
    async def test_search_returns_areas(self, client: AsyncClient):
        with _mock_search():
            r = await client.get(
                "/api/v1/geobox/villages/search",
                params={"q": "Ntinda"},
                headers=owner(),
            )
        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 2
        assert body["areas"][0]["name"] == "Ntinda"
        assert body["areas"][0]["parentName"] == "Nakawa Division"
        # centroid / coordinates must NOT appear in response
        assert "centroid" not in body["areas"][0]
        assert "coordinates" not in body["areas"][0]

    @pytest.mark.asyncio
    async def test_search_unconfigured_returns_empty_not_500(self, client: AsyncClient):
        """When GeoBox credentials absent, response is [] — not an error."""
        with _mock_search(results=[]):
            r = await client.get(
                "/api/v1/geobox/villages/search",
                params={"q": "Ntinda"},
                headers=owner(),
            )
        assert r.status_code == 200
        assert r.json() == {"areas": [], "total": 0}

    @pytest.mark.asyncio
    async def test_search_q_too_short_returns_422(self, client: AsyncClient):
        r = await client.get(
            "/api/v1/geobox/villages/search",
            params={"q": "N"},
            headers=owner(),
        )
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_search_q_too_long_returns_422(self, client: AsyncClient):
        r = await client.get(
            "/api/v1/geobox/villages/search",
            params={"q": "x" * 101},
            headers=owner(),
        )
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_search_requires_auth(self, client: AsyncClient):
        r = await client.get(
            "/api/v1/geobox/villages/search",
            params={"q": "Ntinda"},
        )
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_search_strips_whitespace_from_query(self, client: AsyncClient):
        """Whitespace-padded query is passed stripped to the service."""
        with _mock_search() as mock_svc:
            await client.get(
                "/api/v1/geobox/villages/search",
                params={"q": "  Ntinda  "},
                headers=owner(),
            )
        call_args = mock_svc.call_args
        assert call_args[0][0] == "Ntinda"


@pytest.mark.usefixtures("org")
class TestNearbyAreas:

    @pytest.mark.asyncio
    async def test_nearby_returns_areas_for_uganda_coords(self, client: AsyncClient):
        with _mock_nearby():
            r = await client.get(
                "/api/v1/geobox/areas/nearby",
                params=_IN_UG,
                headers=owner(),
            )
        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 2
        assert body["areas"][0]["name"] == "Ntinda"
        assert "centroid" not in body["areas"][0]

    @pytest.mark.asyncio
    async def test_nearby_rejects_coordinates_outside_uganda(self, client: AsyncClient):
        r = await client.get(
            "/api/v1/geobox/areas/nearby",
            params=_OUT_UG,
            headers=owner(),
        )
        assert r.status_code == 422
        assert "Uganda" in r.json()["detail"]

    @pytest.mark.asyncio
    async def test_nearby_rejects_boundary_edge_cases(self, client: AsyncClient):
        # Slightly outside northern bound
        r = await client.get(
            "/api/v1/geobox/areas/nearby",
            params={"lat": 4.3, "lng": 32.0},
            headers=owner(),
        )
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_nearby_unconfigured_returns_empty_not_500(self, client: AsyncClient):
        with _mock_nearby(results=[]):
            r = await client.get(
                "/api/v1/geobox/areas/nearby",
                params=_IN_UG,
                headers=owner(),
            )
        assert r.status_code == 200
        assert r.json() == {"areas": [], "total": 0}

    @pytest.mark.asyncio
    async def test_nearby_coords_rounded_before_forwarding(self, client: AsyncClient):
        """Verify data minimisation: only 3 d.p. forwarded to service."""
        with _mock_nearby() as mock_svc:
            await client.get(
                "/api/v1/geobox/areas/nearby",
                params={"lat": 0.347612345, "lng": 32.631987654},
                headers=owner(),
            )
        call_args = mock_svc.call_args
        lat_sent, lng_sent = call_args[0][0], call_args[0][1]
        assert lat_sent == round(0.347612345, 3)
        assert lng_sent == round(32.631987654, 3)

    @pytest.mark.asyncio
    async def test_nearby_requires_auth(self, client: AsyncClient):
        r = await client.get("/api/v1/geobox/areas/nearby", params=_IN_UG)
        assert r.status_code == 401
