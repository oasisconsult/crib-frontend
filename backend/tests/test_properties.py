"""
Tests for /api/v1/properties and /api/v1/properties/{id}/units.

Coverage:
  - CRUD for properties (list, create, get, update, patch rules, delete)
  - CRUD for units (list, create, get, update, delete)
  - Batch create units
  - Bulk update units
  - Per-unit rules override + reset
  - Org isolation: user A cannot see user B's properties
  - 404 on unknown IDs
  - Computed fields: total_units, occupied_units, occupancy_rate, monthly_revenue
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers
from tests.factories import make_organisation, make_property, make_unit


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
async def org(dev_org):
    """Organisation linked to the dev manager-1 user (pre-seeded org_dev)."""
    return dev_org


@pytest.fixture
async def other_org(db_session: AsyncSession):
    """A second organisation that manager-1 does NOT belong to."""
    return await make_organisation(db_session)


@pytest.fixture
async def prop(db_session: AsyncSession, org):
    return await make_property(db_session, org, name="Sunrise Apartments")


@pytest.fixture
async def unit(db_session: AsyncSession, prop):
    return await make_unit(db_session, prop, name="A1", monthly_rent=600_000)


# ── Property list ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_properties_empty(client: AsyncClient, org):
    resp = await client.get("/api/v1/properties", headers=auth_headers("manager-1"))
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"] == []
    assert body["total"] == 0


@pytest.mark.asyncio
async def test_list_properties_returns_own_org(client: AsyncClient, prop, other_org, db_session):
    other_prop = await make_property(db_session, other_org, name="Other Org Property")

    resp = await client.get("/api/v1/properties", headers=auth_headers("manager-1"))
    assert resp.status_code == 200
    ids = [p["id"] for p in resp.json()["data"]]
    assert str(prop.id) in ids
    assert str(other_prop.id) not in ids


@pytest.mark.asyncio
async def test_list_properties_search(client: AsyncClient, db_session, org):
    await make_property(db_session, org, name="Sunrise Apartments")
    await make_property(db_session, org, name="Moonrise Flats")

    resp = await client.get("/api/v1/properties?search=Sunrise", headers=auth_headers("manager-1"))
    assert resp.status_code == 200
    names = [p["name"] for p in resp.json()["data"]]
    assert "Sunrise Apartments" in names
    assert "Moonrise Flats" not in names


# ── Property CRUD ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_property(client: AsyncClient, org):
    payload = {
        "name": "New Block",
        "type": "flat",
        "address": {
            "line1": "5 Garden Lane",
            "city": "Kampala",
            "state": "Central",
            "postcode": "00256",
            "country": "UG",
        },
        "rules": {
            "gracePeriodDays": 7,
            "lateFeeType": "flat",
            "lateFeeValue": 50000,
            "depositMonths": 2,
            "noticePeriodDays": 30,
            "allowSubletting": False,
            "allowPets": True,
            "allowSmoking": False,
            "rentDayOfMonth": 5,
            "billingCurrency": "UGX",
            "maintenanceWindowHours": 48,
        },
    }
    resp = await client.post("/api/v1/properties", headers=auth_headers("manager-1"), json=payload)
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "New Block"
    assert body["type"] == "flat"
    assert body["totalUnits"] == 0
    assert body["occupancyRate"] == 0.0


@pytest.mark.asyncio
async def test_get_property(client: AsyncClient, prop):
    resp = await client.get(f"/api/v1/properties/{prop.id}", headers=auth_headers("manager-1"))
    assert resp.status_code == 200
    assert resp.json()["name"] == "Sunrise Apartments"


@pytest.mark.asyncio
async def test_get_property_404(client: AsyncClient, org):
    import uuid
    resp = await client.get(f"/api/v1/properties/{uuid.uuid4()}", headers=auth_headers("manager-1"))
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_property_other_org_404(client: AsyncClient, org, other_org, db_session):
    other_prop = await make_property(db_session, other_org)
    resp = await client.get(f"/api/v1/properties/{other_prop.id}", headers=auth_headers("manager-1"))
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_property(client: AsyncClient, prop):
    resp = await client.put(
        f"/api/v1/properties/{prop.id}",
        headers=auth_headers("manager-1"),
        json={"name": "Renamed Block", "status": "maintenance"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Renamed Block"
    assert body["status"] == "maintenance"


@pytest.mark.asyncio
async def test_patch_rules(client: AsyncClient, prop):
    resp = await client.patch(
        f"/api/v1/properties/{prop.id}/rules",
        headers=auth_headers("manager-1"),
        json={"gracePeriodDays": 10, "lateFeeType": "percentage", "lateFeeValue": 5},
    )
    assert resp.status_code == 200
    rules = resp.json()["rules"]
    assert rules["gracePeriodDays"] == 10
    assert rules["lateFeeType"] == "percentage"


@pytest.mark.asyncio
async def test_delete_property(client: AsyncClient, prop):
    resp = await client.delete(f"/api/v1/properties/{prop.id}", headers=auth_headers("manager-1"))
    assert resp.status_code == 204

    # Confirm gone
    get_resp = await client.get(f"/api/v1/properties/{prop.id}", headers=auth_headers("manager-1"))
    assert get_resp.status_code == 404


# ── Computed occupancy fields ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_occupancy_computed_fields(client: AsyncClient, prop, db_session):
    from app.models.property import UnitStatus
    await make_unit(db_session, prop, name="A1", status=UnitStatus.occupied, monthly_rent=500_000)
    await make_unit(db_session, prop, name="A2", status=UnitStatus.occupied, monthly_rent=600_000)
    await make_unit(db_session, prop, name="A3", status=UnitStatus.available, monthly_rent=550_000)

    resp = await client.get(f"/api/v1/properties/{prop.id}", headers=auth_headers("manager-1"))
    body = resp.json()
    assert body["totalUnits"] == 3
    assert body["occupiedUnits"] == 2
    assert body["occupancyRate"] == pytest.approx(66.7, abs=0.1)
    assert body["monthlyRevenue"] == pytest.approx(1_100_000)


# ── Unit CRUD ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_units(client: AsyncClient, prop, unit):
    resp = await client.get(f"/api/v1/properties/{prop.id}/units", headers=auth_headers("manager-1"))
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["data"][0]["name"] == "A1"


@pytest.mark.asyncio
async def test_create_unit(client: AsyncClient, prop):
    resp = await client.post(
        f"/api/v1/properties/{prop.id}/units",
        headers=auth_headers("manager-1"),
        json={
            "name": "B2",
            "type": "double",
            "monthlyRent": 750000,
            "bedrooms": 2,
            "bathrooms": 1,
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "B2"
    assert body["monthlyRent"] == 750000
    assert body["status"] == "available"


@pytest.mark.asyncio
async def test_get_unit(client: AsyncClient, prop, unit):
    resp = await client.get(
        f"/api/v1/properties/{prop.id}/units/{unit.id}",
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == str(unit.id)


@pytest.mark.asyncio
async def test_update_unit(client: AsyncClient, prop, unit):
    resp = await client.put(
        f"/api/v1/properties/{prop.id}/units/{unit.id}",
        headers=auth_headers("manager-1"),
        json={"monthlyRent": 700000, "status": "reserved"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["monthlyRent"] == 700000
    assert body["status"] == "reserved"


@pytest.mark.asyncio
async def test_delete_unit(client: AsyncClient, prop, unit):
    resp = await client.delete(
        f"/api/v1/properties/{prop.id}/units/{unit.id}",
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 204

    get = await client.get(
        f"/api/v1/properties/{prop.id}/units/{unit.id}",
        headers=auth_headers("manager-1"),
    )
    assert get.status_code == 404


@pytest.mark.asyncio
async def test_unit_rules_override(client: AsyncClient, prop, unit):
    resp = await client.patch(
        f"/api/v1/properties/{prop.id}/units/{unit.id}/rules",
        headers=auth_headers("manager-1"),
        json={"rules": {"gracePeriodDays": 3, "lateFeeType": "flat", "lateFeeValue": 30000,
                        "depositMonths": 1, "noticePeriodDays": 14, "allowSubletting": False,
                        "allowPets": False, "allowSmoking": False, "rentDayOfMonth": 1,
                        "billingCurrency": "UGX", "maintenanceWindowHours": 24}},
    )
    assert resp.status_code == 200
    assert resp.json()["rules"]["gracePeriodDays"] == 3


@pytest.mark.asyncio
async def test_unit_rules_reset_to_null(client: AsyncClient, prop, unit):
    """Passing rules=null clears the unit override (falls back to property rules)."""
    resp = await client.patch(
        f"/api/v1/properties/{prop.id}/units/{unit.id}/rules",
        headers=auth_headers("manager-1"),
        json={"rules": None},
    )
    assert resp.status_code == 200
    assert resp.json()["rules"] is None


@pytest.mark.asyncio
async def test_batch_create_units(client: AsyncClient, prop):
    resp = await client.post(
        f"/api/v1/properties/{prop.id}/units/batch",
        headers=auth_headers("manager-1"),
        json={
            "units": [
                {"name": "C1", "type": "single", "monthlyRent": 400000},
                {"name": "C2", "type": "double", "monthlyRent": 600000},
                {"name": "C3", "type": "studio", "monthlyRent": 500000},
            ]
        },
    )
    assert resp.status_code == 201
    assert len(resp.json()) == 3
    names = [u["name"] for u in resp.json()]
    assert "C1" in names and "C3" in names


@pytest.mark.asyncio
async def test_bulk_update_units(client: AsyncClient, prop, db_session):
    u1 = await make_unit(db_session, prop, name="D1", monthly_rent=400_000)
    u2 = await make_unit(db_session, prop, name="D2", monthly_rent=400_000)

    resp = await client.patch(
        f"/api/v1/properties/{prop.id}/units/bulk",
        headers=auth_headers("manager-1"),
        json={"unitIds": [str(u1.id), str(u2.id)], "monthlyRent": 500000},
    )
    assert resp.status_code == 200
    rents = {u["id"]: u["monthlyRent"] for u in resp.json()}
    assert rents[str(u1.id)] == 500000
    assert rents[str(u2.id)] == 500000


# ── Auth / RBAC ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenant_cannot_create_property(client: AsyncClient, org):
    resp = await client.post(
        "/api/v1/properties",
        headers=auth_headers("tenant-1"),
        json={
            "name": "Hack Attempt",
            "type": "flat",
            "address": {"line1": "x", "city": "x", "state": "x", "postcode": "x", "country": "UG"},
            "rules": {},
        },
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_tenant_can_list_properties(client: AsyncClient, prop):
    """Tenants have read access to the org's properties."""
    resp = await client.get("/api/v1/properties", headers=auth_headers("tenant-1"))
    assert resp.status_code == 200
