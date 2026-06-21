"""
Tests for admin agency + landlord hierarchy endpoints.

Coverage:
  - GET /admin/agencies              — list all platform agencies (superadmin only)
  - GET /admin/agencies/{org_id}     — agency detail with managers, landlords, properties
  - GET /admin/landlords             — list all platform landlords/owners (superadmin only)
  - GET /admin/landlords/{id}        — landlord/owner detail with property portfolio
  - Auth gating: non-superadmin roles → 403
  - Agency identification: only orgs linked via accepted AgencyInvite appear
  - Pagination and search filters
  - Owner vs agency-managed landlord property count paths
  - 404 on unknown IDs
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agency_invite import AgencyInvite, AgencyInviteStatus
from app.models.landlord_invite import LandlordPropertyAccess
from app.models.organisation import Organisation, Plan
from app.models.profile import Profile
from app.models.property import PropertyStatus, Unit, UnitStatus, UnitType
from tests.conftest import auth_headers
from tests.factories import make_organisation, make_property, make_unit

PREFIX = "/api/v1"


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _make_agency(db: AsyncSession, **kwargs) -> Organisation:
    """Create an organisation and mark it as an agency via an accepted AgencyInvite."""
    org = await make_organisation(db, **kwargs)
    invite = AgencyInvite(
        agency_name=kwargs.get("name", org.name),
        manager_email="mgr@test.com",
        manager_first_name="Test",
        manager_last_name="Manager",
        token=uuid.uuid4().hex,
        status=AgencyInviteStatus.ACCEPTED,
        organisation_id=org.id,
        accepted_at=datetime.now(timezone.utc),
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db.add(invite)
    await db.flush()
    return org


async def _make_profile(
    db: AsyncSession,
    org: Organisation,
    role: str = "owner",
    *,
    display_name: str | None = None,
    email: str | None = None,
    is_read_only: bool = False,
) -> Profile:
    """Create a bare Profile row (not a full Logto auth user)."""
    uid = uuid.uuid4().hex[:8]
    profile = Profile(
        logto_sub=f"test_{uid}",
        organisation_id=org.id,
        role=role,
        display_name=display_name or f"Test {role.capitalize()} {uid}",
        email=email or f"{role}-{uid}@example.com",
        is_read_only=is_read_only,
    )
    db.add(profile)
    await db.flush()
    return profile


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def agency_org(db_session: AsyncSession) -> Organisation:
    """An org that has been onboarded as an agency."""
    return await _make_agency(db_session, name="Sunrise Properties", slug=f"sunrise-{uuid.uuid4().hex[:6]}")


@pytest_asyncio.fixture
async def plain_org(db_session: AsyncSession) -> Organisation:
    """A normal (non-agency) org — should NOT appear in /admin/agencies."""
    return await make_organisation(db_session, name="Plain Org", slug=f"plain-{uuid.uuid4().hex[:6]}")


# ══════════════════════════════════════════════════════════════════════════════
# GET /admin/agencies
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_list_agencies_requires_superadmin(client: AsyncClient, db_session: AsyncSession):
    """Manager and owner roles must be blocked from the agency list."""
    await client.get(f"{PREFIX}/me", headers=auth_headers("manager-1"))
    await client.get(f"{PREFIX}/me", headers=auth_headers("owner-1"))

    for user in ("manager-1", "owner-1", "tenant-1"):
        resp = await client.get(f"{PREFIX}/admin/agencies", headers=auth_headers(user))
        assert resp.status_code == 403, f"{user} should be forbidden, got {resp.status_code}"


@pytest.mark.asyncio
async def test_list_agencies_empty(client: AsyncClient, db_session: AsyncSession):
    """No accepted AgencyInvites → empty list, not an error."""
    await client.get(f"{PREFIX}/me", headers=auth_headers("superadmin-1"))
    resp = await client.get(f"{PREFIX}/admin/agencies", headers=auth_headers("superadmin-1"))
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"] == []
    assert body["total"] == 0


@pytest.mark.asyncio
async def test_list_agencies_only_accepted_invites(
    client: AsyncClient, db_session: AsyncSession, agency_org: Organisation, plain_org: Organisation
):
    """Only orgs with an accepted AgencyInvite appear; plain orgs are excluded."""
    await client.get(f"{PREFIX}/me", headers=auth_headers("superadmin-1"))
    resp = await client.get(f"{PREFIX}/admin/agencies", headers=auth_headers("superadmin-1"))
    assert resp.status_code == 200
    ids = {item["id"] for item in resp.json()["data"]}
    assert str(agency_org.id) in ids
    assert str(plain_org.id) not in ids


@pytest.mark.asyncio
async def test_list_agencies_response_shape(
    client: AsyncClient, db_session: AsyncSession, agency_org: Organisation
):
    """Agency list items have all required fields."""
    await client.get(f"{PREFIX}/me", headers=auth_headers("superadmin-1"))
    resp = await client.get(f"{PREFIX}/admin/agencies", headers=auth_headers("superadmin-1"))
    assert resp.status_code == 200
    item = next(i for i in resp.json()["data"] if i["id"] == str(agency_org.id))
    assert item["name"] == agency_org.name
    assert "slug" in item
    assert "plan" in item
    assert "totalProperties" in item
    assert "activeProperties" in item
    assert "managerCount" in item
    assert "landlordCount" in item
    assert "isArchived" in item
    assert item["isArchived"] is False


@pytest.mark.asyncio
async def test_list_agencies_property_counts(
    client: AsyncClient, db_session: AsyncSession, agency_org: Organisation
):
    """totalProperties and activeProperties reflect the agency's property set."""
    await make_property(db_session, agency_org, status=PropertyStatus.active)
    await make_property(db_session, agency_org, status=PropertyStatus.active)
    await make_property(db_session, agency_org, status=PropertyStatus.inactive)
    await client.get(f"{PREFIX}/me", headers=auth_headers("superadmin-1"))

    resp = await client.get(f"{PREFIX}/admin/agencies", headers=auth_headers("superadmin-1"))
    assert resp.status_code == 200
    item = next(i for i in resp.json()["data"] if i["id"] == str(agency_org.id))
    assert item["totalProperties"] == 3
    assert item["activeProperties"] == 2


@pytest.mark.asyncio
async def test_list_agencies_manager_and_landlord_counts(
    client: AsyncClient, db_session: AsyncSession, agency_org: Organisation
):
    """managerCount and landlordCount reflect profiles in the agency org."""
    await _make_profile(db_session, agency_org, role="manager")
    await _make_profile(db_session, agency_org, role="manager")
    await _make_profile(db_session, agency_org, role="landlord")
    await client.get(f"{PREFIX}/me", headers=auth_headers("superadmin-1"))

    resp = await client.get(f"{PREFIX}/admin/agencies", headers=auth_headers("superadmin-1"))
    assert resp.status_code == 200
    item = next(i for i in resp.json()["data"] if i["id"] == str(agency_org.id))
    assert item["managerCount"] >= 2
    assert item["landlordCount"] >= 1


@pytest.mark.asyncio
async def test_list_agencies_search_filter(
    client: AsyncClient, db_session: AsyncSession
):
    """search= filters by org name (case-insensitive)."""
    await _make_agency(db_session, name="Nakawa Real Estate", slug=f"nakawa-{uuid.uuid4().hex[:6]}")
    await _make_agency(db_session, name="Kololo Partners", slug=f"kololo-{uuid.uuid4().hex[:6]}")
    await client.get(f"{PREFIX}/me", headers=auth_headers("superadmin-1"))

    resp = await client.get(
        f"{PREFIX}/admin/agencies",
        params={"search": "nakawa"},
        headers=auth_headers("superadmin-1"),
    )
    assert resp.status_code == 200
    names = [i["name"] for i in resp.json()["data"]]
    assert any("Nakawa" in n for n in names)
    assert not any("Kololo" in n for n in names)


@pytest.mark.asyncio
async def test_list_agencies_pagination(
    client: AsyncClient, db_session: AsyncSession
):
    """page + pageSize crop the result set correctly."""
    for i in range(3):
        await _make_agency(db_session, name=f"Page Agency {i}", slug=f"page-ag-{i}-{uuid.uuid4().hex[:6]}")
    await client.get(f"{PREFIX}/me", headers=auth_headers("superadmin-1"))

    resp = await client.get(
        f"{PREFIX}/admin/agencies",
        params={"page": 1, "pageSize": 2},
        headers=auth_headers("superadmin-1"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]) <= 2
    assert body["total"] >= 3


# ══════════════════════════════════════════════════════════════════════════════
# GET /admin/agencies/{org_id}
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_get_agency_detail_requires_superadmin(
    client: AsyncClient, db_session: AsyncSession, agency_org: Organisation
):
    """Owner cannot access agency detail endpoint."""
    await client.get(f"{PREFIX}/me", headers=auth_headers("owner-1"))
    resp = await client.get(
        f"{PREFIX}/admin/agencies/{agency_org.id}",
        headers=auth_headers("owner-1"),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_agency_detail_404(client: AsyncClient, db_session: AsyncSession):
    """Unknown org_id returns 404."""
    await client.get(f"{PREFIX}/me", headers=auth_headers("superadmin-1"))
    resp = await client.get(
        f"{PREFIX}/admin/agencies/{uuid.uuid4()}",
        headers=auth_headers("superadmin-1"),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_agency_detail_shape(
    client: AsyncClient, db_session: AsyncSession, agency_org: Organisation
):
    """Agency detail response includes all required top-level keys."""
    await client.get(f"{PREFIX}/me", headers=auth_headers("superadmin-1"))
    resp = await client.get(
        f"{PREFIX}/admin/agencies/{agency_org.id}",
        headers=auth_headers("superadmin-1"),
    )
    assert resp.status_code == 200
    body = resp.json()
    for key in (
        "id", "name", "slug", "plan", "totalProperties", "activeProperties",
        "managerCount", "landlordCount", "isArchived",
        "totalMonthlyRevenue", "managers", "landlords", "properties",
    ):
        assert key in body, f"missing key: {key}"
    assert isinstance(body["managers"], list)
    assert isinstance(body["landlords"], list)
    assert isinstance(body["properties"], list)


@pytest.mark.asyncio
async def test_get_agency_detail_managers_and_landlords(
    client: AsyncClient, db_session: AsyncSession, agency_org: Organisation
):
    """Agency detail lists managers and landlord profiles in the org."""
    mgr = await _make_profile(db_session, agency_org, role="manager", display_name="Alice Mgr")
    ll = await _make_profile(db_session, agency_org, role="landlord", display_name="Bob LL")
    await client.get(f"{PREFIX}/me", headers=auth_headers("superadmin-1"))

    resp = await client.get(
        f"{PREFIX}/admin/agencies/{agency_org.id}",
        headers=auth_headers("superadmin-1"),
    )
    assert resp.status_code == 200
    body = resp.json()
    mgr_ids = {m["id"] for m in body["managers"]}
    ll_ids = {l["id"] for l in body["landlords"]}
    assert str(mgr.id) in mgr_ids
    assert str(ll.id) in ll_ids


@pytest.mark.asyncio
async def test_get_agency_detail_properties_and_revenue(
    client: AsyncClient, db_session: AsyncSession, agency_org: Organisation
):
    """Properties list contains correct unit counts and revenue from occupied units."""
    prop = await make_property(db_session, agency_org, name="Sunrise Block A", status=PropertyStatus.active)
    await make_unit(db_session, prop, status=UnitStatus.occupied, monthly_rent=300_000)
    await make_unit(db_session, prop, status=UnitStatus.available, monthly_rent=350_000)
    await client.get(f"{PREFIX}/me", headers=auth_headers("superadmin-1"))

    resp = await client.get(
        f"{PREFIX}/admin/agencies/{agency_org.id}",
        headers=auth_headers("superadmin-1"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["totalProperties"] == 1

    prop_entry = next(p for p in body["properties"] if p["id"] == str(prop.id))
    assert prop_entry["unitCount"] == 2
    assert prop_entry["monthlyRevenue"] == 300_000  # only occupied unit counts
    assert body["totalMonthlyRevenue"] == 300_000


# ══════════════════════════════════════════════════════════════════════════════
# GET /admin/landlords
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_list_landlords_requires_superadmin(client: AsyncClient, db_session: AsyncSession):
    """Non-superadmin roles are blocked."""
    await client.get(f"{PREFIX}/me", headers=auth_headers("manager-1"))
    for user in ("manager-1", "owner-1", "tenant-1"):
        resp = await client.get(f"{PREFIX}/admin/landlords", headers=auth_headers(user))
        assert resp.status_code == 403, f"{user} should be forbidden"


@pytest.mark.asyncio
async def test_list_landlords_empty(client: AsyncClient, db_session: AsyncSession):
    """When no landlord/owner profiles exist, returns empty list."""
    await client.get(f"{PREFIX}/me", headers=auth_headers("superadmin-1"))
    resp = await client.get(f"{PREFIX}/admin/landlords", headers=auth_headers("superadmin-1"))
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body["data"], list)
    assert body["total"] >= 0


@pytest.mark.asyncio
async def test_list_landlords_includes_owners_and_landlords(
    client: AsyncClient, db_session: AsyncSession
):
    """Both role='owner' and role='landlord' profiles appear; managers do not."""
    org = await make_organisation(db_session)
    owner = await _make_profile(db_session, org, role="owner", display_name="Indep Owner")
    ll = await _make_profile(db_session, org, role="landlord", display_name="Agency Landlord")
    mgr = await _make_profile(db_session, org, role="manager", display_name="Hidden Manager")
    await client.get(f"{PREFIX}/me", headers=auth_headers("superadmin-1"))

    resp = await client.get(f"{PREFIX}/admin/landlords", headers=auth_headers("superadmin-1"))
    assert resp.status_code == 200
    ids = {item["id"] for item in resp.json()["data"]}
    assert str(owner.id) in ids
    assert str(ll.id) in ids
    assert str(mgr.id) not in ids


@pytest.mark.asyncio
async def test_list_landlords_response_shape(
    client: AsyncClient, db_session: AsyncSession
):
    """Each landlord list item has the required fields."""
    org = await make_organisation(db_session)
    await _make_profile(db_session, org, role="owner")
    await client.get(f"{PREFIX}/me", headers=auth_headers("superadmin-1"))

    resp = await client.get(f"{PREFIX}/admin/landlords", headers=auth_headers("superadmin-1"))
    assert resp.status_code == 200
    item = resp.json()["data"][0]
    for key in ("id", "displayName", "email", "role", "isReadOnly", "orgId", "orgName",
                "propertyCount", "activePropertyCount", "type", "createdAt"):
        assert key in item, f"missing key: {key}"


@pytest.mark.asyncio
async def test_list_landlords_type_field(client: AsyncClient, db_session: AsyncSession):
    """type='independent' for owners, 'agency_managed' for landlords."""
    org = await make_organisation(db_session)
    owner = await _make_profile(db_session, org, role="owner")
    ll = await _make_profile(db_session, org, role="landlord")
    await client.get(f"{PREFIX}/me", headers=auth_headers("superadmin-1"))

    resp = await client.get(f"{PREFIX}/admin/landlords", headers=auth_headers("superadmin-1"))
    assert resp.status_code == 200
    by_id = {item["id"]: item for item in resp.json()["data"]}
    assert by_id[str(owner.id)]["type"] == "independent"
    assert by_id[str(ll.id)]["type"] == "agency_managed"


@pytest.mark.asyncio
async def test_list_landlords_owner_property_count(client: AsyncClient, db_session: AsyncSession):
    """Owner property count is sourced from property.organisation_id = owner's org."""
    org = await make_organisation(db_session)
    owner = await _make_profile(db_session, org, role="owner")
    await make_property(db_session, org, status=PropertyStatus.active)
    await make_property(db_session, org, status=PropertyStatus.active)
    await make_property(db_session, org, status=PropertyStatus.inactive)
    await client.get(f"{PREFIX}/me", headers=auth_headers("superadmin-1"))

    resp = await client.get(f"{PREFIX}/admin/landlords", headers=auth_headers("superadmin-1"))
    assert resp.status_code == 200
    by_id = {item["id"]: item for item in resp.json()["data"]}
    assert by_id[str(owner.id)]["propertyCount"] == 3
    assert by_id[str(owner.id)]["activePropertyCount"] == 2


@pytest.mark.asyncio
async def test_list_landlords_landlord_property_count_via_lpa(
    client: AsyncClient, db_session: AsyncSession
):
    """Agency-managed landlord property count comes from LandlordPropertyAccess rows."""
    agency = await make_organisation(db_session, slug=f"ag-{uuid.uuid4().hex[:6]}")
    ll = await _make_profile(db_session, agency, role="landlord", is_read_only=True)
    prop1 = await make_property(db_session, agency, status=PropertyStatus.active)
    prop2 = await make_property(db_session, agency, status=PropertyStatus.inactive)
    # Grant access via LPA
    for prop in (prop1, prop2):
        lpa = LandlordPropertyAccess(landlord_profile_id=ll.id, property_id=prop.id, is_read_only=True)
        db_session.add(lpa)
    await db_session.flush()
    await client.get(f"{PREFIX}/me", headers=auth_headers("superadmin-1"))

    resp = await client.get(f"{PREFIX}/admin/landlords", headers=auth_headers("superadmin-1"))
    assert resp.status_code == 200
    by_id = {item["id"]: item for item in resp.json()["data"]}
    assert by_id[str(ll.id)]["propertyCount"] == 2
    assert by_id[str(ll.id)]["activePropertyCount"] == 1


@pytest.mark.asyncio
async def test_list_landlords_search_filter(client: AsyncClient, db_session: AsyncSession):
    """search= matches display_name and email (ilike)."""
    org = await make_organisation(db_session)
    kwame = await _make_profile(db_session, org, role="owner", display_name="Kwame Asante")
    grace = await _make_profile(db_session, org, role="owner", display_name="Grace Nakato")
    await client.get(f"{PREFIX}/me", headers=auth_headers("superadmin-1"))

    resp = await client.get(
        f"{PREFIX}/admin/landlords",
        params={"search": "kwame"},
        headers=auth_headers("superadmin-1"),
    )
    assert resp.status_code == 200
    ids = {item["id"] for item in resp.json()["data"]}
    assert str(kwame.id) in ids
    assert str(grace.id) not in ids


@pytest.mark.asyncio
async def test_list_landlords_pagination(client: AsyncClient, db_session: AsyncSession):
    """pageSize= caps the returned items; total reflects full count."""
    org = await make_organisation(db_session)
    for i in range(5):
        await _make_profile(db_session, org, role="owner", display_name=f"Paginated Owner {i}")
    await client.get(f"{PREFIX}/me", headers=auth_headers("superadmin-1"))

    resp = await client.get(
        f"{PREFIX}/admin/landlords",
        params={"page": 1, "pageSize": 3},
        headers=auth_headers("superadmin-1"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]) <= 3
    assert body["total"] >= 5


# ══════════════════════════════════════════════════════════════════════════════
# GET /admin/landlords/{profile_id}
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_get_landlord_detail_requires_superadmin(client: AsyncClient, db_session: AsyncSession):
    """Manager cannot access landlord detail endpoint."""
    org = await make_organisation(db_session)
    profile = await _make_profile(db_session, org, role="owner")
    await client.get(f"{PREFIX}/me", headers=auth_headers("manager-1"))
    resp = await client.get(
        f"{PREFIX}/admin/landlords/{profile.id}",
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_landlord_detail_404(client: AsyncClient, db_session: AsyncSession):
    """Unknown profile_id returns 404."""
    await client.get(f"{PREFIX}/me", headers=auth_headers("superadmin-1"))
    resp = await client.get(
        f"{PREFIX}/admin/landlords/{uuid.uuid4()}",
        headers=auth_headers("superadmin-1"),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_landlord_detail_rejects_manager_profile(
    client: AsyncClient, db_session: AsyncSession
):
    """Requesting detail for a manager profile (role!='owner'/'landlord') returns 400."""
    org = await make_organisation(db_session)
    mgr = await _make_profile(db_session, org, role="manager")
    await client.get(f"{PREFIX}/me", headers=auth_headers("superadmin-1"))

    resp = await client.get(
        f"{PREFIX}/admin/landlords/{mgr.id}",
        headers=auth_headers("superadmin-1"),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_get_landlord_detail_owner_shape(client: AsyncClient, db_session: AsyncSession):
    """Owner detail response has all required keys and type='independent'."""
    org = await make_organisation(db_session)
    owner = await _make_profile(db_session, org, role="owner", display_name="Test Owner")
    await client.get(f"{PREFIX}/me", headers=auth_headers("superadmin-1"))

    resp = await client.get(
        f"{PREFIX}/admin/landlords/{owner.id}",
        headers=auth_headers("superadmin-1"),
    )
    assert resp.status_code == 200
    body = resp.json()
    for key in (
        "id", "displayName", "email", "role", "isReadOnly", "orgId", "orgName",
        "propertyCount", "activePropertyCount", "inactivePropertyCount",
        "totalMonthlyRevenue", "type", "createdAt", "properties",
    ):
        assert key in body, f"missing key: {key}"
    assert body["type"] == "independent"
    assert isinstance(body["properties"], list)


@pytest.mark.asyncio
async def test_get_landlord_detail_owner_properties(client: AsyncClient, db_session: AsyncSession):
    """Owner detail includes properties owned via organisation_id, with unit + revenue stats."""
    org = await make_organisation(db_session)
    owner = await _make_profile(db_session, org, role="owner")
    prop = await make_property(db_session, org, name="Independence Court", status=PropertyStatus.active)
    await make_unit(db_session, prop, status=UnitStatus.occupied, monthly_rent=400_000)
    await make_unit(db_session, prop, status=UnitStatus.available, monthly_rent=450_000)
    await client.get(f"{PREFIX}/me", headers=auth_headers("superadmin-1"))

    resp = await client.get(
        f"{PREFIX}/admin/landlords/{owner.id}",
        headers=auth_headers("superadmin-1"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["propertyCount"] == 1
    assert body["activePropertyCount"] == 1
    assert body["inactivePropertyCount"] == 0
    assert body["totalMonthlyRevenue"] == 400_000
    assert len(body["properties"]) == 1
    prop_entry = body["properties"][0]
    assert prop_entry["name"] == "Independence Court"
    assert prop_entry["unitCount"] == 2
    assert prop_entry["monthlyRevenue"] == 400_000


@pytest.mark.asyncio
async def test_get_landlord_detail_agency_managed_properties(
    client: AsyncClient, db_session: AsyncSession
):
    """Agency-managed landlord detail sources properties from LandlordPropertyAccess."""
    agency = await make_organisation(db_session, slug=f"ag2-{uuid.uuid4().hex[:6]}")
    ll = await _make_profile(db_session, agency, role="landlord", is_read_only=True)
    prop = await make_property(db_session, agency, name="Managed Block B", status=PropertyStatus.active)
    lpa = LandlordPropertyAccess(landlord_profile_id=ll.id, property_id=prop.id, is_read_only=True)
    db_session.add(lpa)
    await db_session.flush()
    await client.get(f"{PREFIX}/me", headers=auth_headers("superadmin-1"))

    resp = await client.get(
        f"{PREFIX}/admin/landlords/{ll.id}",
        headers=auth_headers("superadmin-1"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "agency_managed"
    assert body["propertyCount"] == 1
    assert any(p["name"] == "Managed Block B" for p in body["properties"])


@pytest.mark.asyncio
async def test_get_landlord_detail_no_properties(client: AsyncClient, db_session: AsyncSession):
    """Landlord with no properties returns zero counts and empty properties list."""
    org = await make_organisation(db_session)
    owner = await _make_profile(db_session, org, role="owner")
    await client.get(f"{PREFIX}/me", headers=auth_headers("superadmin-1"))

    resp = await client.get(
        f"{PREFIX}/admin/landlords/{owner.id}",
        headers=auth_headers("superadmin-1"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["propertyCount"] == 0
    assert body["totalMonthlyRevenue"] == 0.0
    assert body["properties"] == []
