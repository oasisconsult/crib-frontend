"""
Tests for Uganda property and unit feature expansion (migration 048).

Coverage:
  - New property types: bungalow, maisonette, townhouse, bedsitter_block
  - New unit types: bedsitter, one_bed, two_bed, three_bed, four_bed_plus
  - Uganda property fields: floors, year_built, land_size_acres, water_source,
    backup_power, internet_type, compound_type, has_perimeter_wall, has_cctv,
    has_security_guard, parking_spaces
  - Uganda unit fields: is_self_contained, has_kitchen, has_store,
    has_domestic_quarters, sitting_rooms, toilets, parking_spaces,
    furnished_status, water_source
  - SingleUnitOverrides: is_single_unit=True passes unit config at create time
  - Legacy unit type values (single, double) still accepted by API
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers
from tests.factories import make_property, make_unit

PREFIX = "/api/v1"

BASE_RULES = {
    "gracePeriodDays": 5,
    "lateFeeType": "flat",
    "lateFeeValue": 50000,
    "depositMonths": 1,
    "noticePeriodDays": 30,
    "allowSubletting": False,
    "allowPets": False,
    "allowSmoking": False,
    "rentDayOfMonth": 1,
    "billingCurrency": "UGX",
    "maintenanceWindowHours": 24,
}

BASE_ADDRESS = {
    "line1": "15 Bombo Road",
    "city": "Kampala",
    "state": "Central",
    "postcode": "00256",
    "country": "UG",
}


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
async def org(dev_org):
    return dev_org


@pytest.fixture
async def prop(db_session: AsyncSession, org):
    return await make_property(db_session, org, name="Uganda Features Property")


# ── Property type expansion ───────────────────────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.parametrize("ptype", ["bungalow", "maisonette", "townhouse", "bedsitter_block"])
async def test_create_property_new_types(client: AsyncClient, org, ptype):
    resp = await client.post(
        f"{PREFIX}/properties",
        headers=auth_headers("manager-1"),
        json={
            "name": f"Test {ptype}",
            "type": ptype,
            "address": BASE_ADDRESS,
            "rules": BASE_RULES,
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["type"] == ptype


# ── Property Uganda feature fields ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_property_with_uganda_features(client: AsyncClient, org):
    resp = await client.post(
        f"{PREFIX}/properties",
        headers=auth_headers("manager-1"),
        json={
            "name": "Feature-rich Property",
            "type": "bungalow",
            "address": BASE_ADDRESS,
            "rules": BASE_RULES,
            "totalFloors": 2,
            "yearBuilt": 2018,
            "landSizeAcres": 0.25,
            "waterSource": "borehole",
            "backupPower": "generator",
            "internetType": "fibre",
            "compoundType": "private",
            "hasPerimeterWall": True,
            "hasCctv": True,
            "hasGuard": False,
            "totalParkingSpaces": 4,
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["totalFloors"] == 2
    assert body["yearBuilt"] == 2018
    assert body["landSizeAcres"] == pytest.approx(0.25, abs=0.01)
    assert body["waterSource"] == "borehole"
    assert body["backupPower"] == "generator"
    assert body["internetType"] == "fibre"
    assert body["compoundType"] == "private"
    assert body["hasPerimeterWall"] is True
    assert body["hasCctv"] is True
    assert body["hasGuard"] is False
    assert body["totalParkingSpaces"] == 4


@pytest.mark.asyncio
async def test_get_property_returns_uganda_fields(client: AsyncClient, prop):
    """GET on an existing property must include all Uganda fields (with defaults)."""
    resp = await client.get(f"{PREFIX}/properties/{prop.id}", headers=auth_headers("manager-1"))
    assert resp.status_code == 200
    body = resp.json()
    assert "totalFloors" in body
    assert "yearBuilt" in body
    assert "landSizeAcres" in body
    assert body["waterSource"] == "municipal"
    assert body["backupPower"] == "none"
    assert body["internetType"] == "none"
    assert body["compoundType"] == "private"
    assert body["hasPerimeterWall"] is False
    assert body["hasCctv"] is False
    assert body["hasGuard"] is False
    assert body["totalParkingSpaces"] == 0


@pytest.mark.asyncio
async def test_update_property_uganda_fields(client: AsyncClient, prop):
    resp = await client.put(
        f"{PREFIX}/properties/{prop.id}",
        headers=auth_headers("manager-1"),
        json={
            "waterSource": "borehole",
            "backupPower": "solar",
            "hasPerimeterWall": True,
            "totalParkingSpaces": 2,
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["waterSource"] == "borehole"
    assert body["backupPower"] == "solar"
    assert body["hasPerimeterWall"] is True
    assert body["totalParkingSpaces"] == 2


# ── Unit type expansion ───────────────────────────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.parametrize("utype", ["bedsitter", "one_bed", "two_bed", "three_bed", "four_bed_plus"])
async def test_create_unit_new_types(client: AsyncClient, prop, utype):
    resp = await client.post(
        f"{PREFIX}/properties/{prop.id}/units",
        headers=auth_headers("manager-1"),
        json={
            "name": f"Unit {utype}",
            "type": utype,
            "monthlyRent": 500000,
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["type"] == utype


@pytest.mark.asyncio
@pytest.mark.parametrize("utype", ["single", "double", "studio"])
async def test_create_unit_legacy_types_still_accepted(client: AsyncClient, prop, utype):
    """Legacy unit types from before migration 048 must still be accepted by the API."""
    resp = await client.post(
        f"{PREFIX}/properties/{prop.id}/units",
        headers=auth_headers("manager-1"),
        json={
            "name": f"Legacy {utype}",
            "type": utype,
            "monthlyRent": 400000,
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["type"] == utype


# ── Unit Uganda feature fields ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_unit_with_uganda_features(client: AsyncClient, prop):
    resp = await client.post(
        f"{PREFIX}/properties/{prop.id}/units",
        headers=auth_headers("manager-1"),
        json={
            "name": "Uganda Unit 1",
            "type": "two_bed",
            "monthlyRent": 800000,
            "bedrooms": 2,
            "bathrooms": 1,
            "sittingRooms": 1,
            "toilets": 2,
            "isSelfContained": True,
            "hasKitchen": True,
            "hasStore": True,
            "hasDomesticQuarters": False,
            "parkingSpaces": 1,
            "furnishedStatus": "semi_furnished",
            "waterSource": "borehole",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["type"] == "two_bed"
    assert body["isSelfContained"] is True
    assert body["hasKitchen"] is True
    assert body["hasStore"] is True
    assert body["hasDomesticQuarters"] is False
    assert body["sittingRooms"] == 1
    assert body["toilets"] == 2
    assert body["parkingSpaces"] == 1
    assert body["furnishedStatus"] == "semi_furnished"
    assert body["waterSource"] == "borehole"


@pytest.mark.asyncio
async def test_get_unit_returns_uganda_fields(client: AsyncClient, prop, db_session):
    unit = await make_unit(db_session, prop, name="Uganda Unit", monthly_rent=600_000)
    resp = await client.get(
        f"{PREFIX}/properties/{prop.id}/units/{unit.id}",
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "isSelfContained" in body
    assert "hasKitchen" in body
    assert "hasStore" in body
    assert "hasDomesticQuarters" in body
    assert "sittingRooms" in body
    assert "toilets" in body
    assert "parkingSpaces" in body
    assert "furnishedStatus" in body
    assert "waterSource" in body


@pytest.mark.asyncio
async def test_update_unit_uganda_fields(client: AsyncClient, prop, db_session):
    unit = await make_unit(db_session, prop, name="Editable Unit", monthly_rent=500_000)
    resp = await client.put(
        f"{PREFIX}/properties/{prop.id}/units/{unit.id}",
        headers=auth_headers("manager-1"),
        json={
            "isSelfContained": True,
            "furnishedStatus": "furnished",
            "waterSource": "tank",
            "parkingSpaces": 2,
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["isSelfContained"] is True
    assert body["furnishedStatus"] == "furnished"
    assert body["waterSource"] == "tank"
    assert body["parkingSpaces"] == 2


@pytest.mark.asyncio
async def test_unit_water_source_inherit(client: AsyncClient, prop):
    """Unit with no waterSource (inherit) should have null waterSource in API response."""
    resp = await client.post(
        f"{PREFIX}/properties/{prop.id}/units",
        headers=auth_headers("manager-1"),
        json={
            "name": "Inherit Water",
            "type": "one_bed",
            "monthlyRent": 450000,
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["waterSource"] is None


@pytest.mark.asyncio
async def test_unit_furnished_status_variants(client: AsyncClient, prop):
    """All three furnished_status values should be accepted."""
    for status in ["unfurnished", "semi_furnished", "furnished"]:
        resp = await client.post(
            f"{PREFIX}/properties/{prop.id}/units",
            headers=auth_headers("manager-1"),
            json={
                "name": f"Unit {status}",
                "type": "studio",
                "monthlyRent": 350000,
                "furnishedStatus": status,
            },
        )
        assert resp.status_code == 201, f"Failed for status={status}: {resp.text}"
        assert resp.json()["furnishedStatus"] == status


# ── SingleUnitOverrides ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_single_unit_property_with_overrides(client: AsyncClient, org):
    """is_single_unit=True + singleUnitOverrides -> virtual unit has correct Uganda fields."""
    resp = await client.post(
        f"{PREFIX}/properties",
        headers=auth_headers("manager-1"),
        json={
            "name": "Single Unit Bungalow",
            "type": "bungalow",
            "address": BASE_ADDRESS,
            "rules": BASE_RULES,
            "isSingleUnit": True,
            "singleUnitOverrides": {
                "isSelfContained": True,
                "hasKitchen": True,
                "hasStore": False,
                "hasDomesticQuarters": True,
                "sittingRooms": 2,
                "toilets": 3,
                "parkingSpaces": 1,
                "furnishedStatus": "furnished",
            },
        },
    )
    assert resp.status_code == 201, resp.text
    prop_id = resp.json()["id"]

    units_resp = await client.get(
        f"{PREFIX}/properties/{prop_id}/units",
        headers=auth_headers("manager-1"),
    )
    assert units_resp.status_code == 200
    units = units_resp.json()["data"]
    assert len(units) == 1
    unit = units[0]
    assert unit["isSelfContained"] is True
    assert unit["hasKitchen"] is True
    assert unit["hasDomesticQuarters"] is True
    assert unit["sittingRooms"] == 2
    assert unit["toilets"] == 3
    assert unit["parkingSpaces"] == 1
    assert unit["furnishedStatus"] == "furnished"


@pytest.mark.asyncio
async def test_single_unit_property_default_unit_type(client: AsyncClient, org):
    """Virtual unit for is_single_unit=True should use studio type (not legacy single)."""
    resp = await client.post(
        f"{PREFIX}/properties",
        headers=auth_headers("manager-1"),
        json={
            "name": "Studio Bungalow",
            "type": "bungalow",
            "address": BASE_ADDRESS,
            "rules": BASE_RULES,
            "isSingleUnit": True,
        },
    )
    assert resp.status_code == 201, resp.text
    prop_id = resp.json()["id"]

    units_resp = await client.get(
        f"{PREFIX}/properties/{prop_id}/units",
        headers=auth_headers("manager-1"),
    )
    units = units_resp.json()["data"]
    assert len(units) == 1
    assert units[0]["type"] == "studio"


# ── Batch create with Uganda features ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_batch_create_units_with_uganda_features(client: AsyncClient, prop):
    resp = await client.post(
        f"{PREFIX}/properties/{prop.id}/units/batch",
        headers=auth_headers("manager-1"),
        json={
            "units": [
                {
                    "name": "Batch 1",
                    "type": "one_bed",
                    "monthlyRent": 500000,
                    "isSelfContained": True,
                    "furnishedStatus": "unfurnished",
                },
                {
                    "name": "Batch 2",
                    "type": "two_bed",
                    "monthlyRent": 700000,
                    "isSelfContained": False,
                    "furnishedStatus": "semi_furnished",
                    "hasDomesticQuarters": True,
                },
            ]
        },
    )
    assert resp.status_code == 201, resp.text
    units = resp.json()
    assert len(units) == 2
    by_name = {u["name"]: u for u in units}
    assert by_name["Batch 1"]["isSelfContained"] is True
    assert by_name["Batch 1"]["furnishedStatus"] == "unfurnished"
    assert by_name["Batch 2"]["isSelfContained"] is False
    assert by_name["Batch 2"]["furnishedStatus"] == "semi_furnished"
    assert by_name["Batch 2"]["hasDomesticQuarters"] is True
