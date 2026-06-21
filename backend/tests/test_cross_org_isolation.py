"""
Cross-org property isolation — security regression tests.

Verifies that no user can read another organisation's data across all
resource types (properties, units, leases, tenants, maintenance, inspections).
Also verifies that read-only landlords within the same org can only see the
specific properties they have been explicitly granted access to.

HOW TO USE
----------
Run these tests after adding any new API endpoint that returns org-scoped data:

    pytest tests/test_cross_org_isolation.py -v

Add a new assertion block to the relevant test class whenever a new resource
type is introduced.
"""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.factories import (
    make_inspection,
    make_lease,
    make_maintenance_issue,
    make_organisation,
    make_property,
    make_tenant,
    make_unit,
)

# ── Auth header helpers ───────────────────────────────────────────────────────

def _as(user_id: str) -> dict[str, str]:
    return {"X-Dev-User-Id": user_id}

A_OWNER  = _as("org-a-owner")        # full owner in org_alpha
B_OWNER  = _as("org-b-owner")        # full owner in org_beta
A_LANDLORD = _as("org-a-ro-landlord")  # read-only landlord in org_alpha


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def org_alpha(db_session: AsyncSession):
    return await make_organisation(
        db_session, logto_org_id="org_alpha", name="Agency Alpha", slug="agency-alpha"
    )


@pytest_asyncio.fixture
async def org_beta(db_session: AsyncSession):
    return await make_organisation(
        db_session, logto_org_id="org_beta", name="Agency Beta", slug="agency-beta"
    )


@pytest_asyncio.fixture
async def alpha(db_session: AsyncSession, org_alpha):
    """Full resource tree owned by org_alpha."""
    prop    = await make_property(db_session, org_alpha, name="Alpha Property")
    unit    = await make_unit(db_session, prop)
    tenant  = await make_tenant(db_session, org_alpha)
    lease   = await make_lease(db_session, org_alpha, unit, tenant)
    issue   = await make_maintenance_issue(db_session, org_alpha, prop)
    inspection = await make_inspection(db_session, org_alpha, prop)
    return dict(org=org_alpha, prop=prop, unit=unit,
                tenant=tenant, lease=lease, issue=issue, inspection=inspection)


@pytest_asyncio.fixture
async def beta(db_session: AsyncSession, org_beta):
    """Full resource tree owned by org_beta."""
    prop    = await make_property(db_session, org_beta, name="Beta Property")
    unit    = await make_unit(db_session, prop)
    tenant  = await make_tenant(db_session, org_beta)
    lease   = await make_lease(db_session, org_beta, unit, tenant)
    issue   = await make_maintenance_issue(db_session, org_beta, prop)
    inspection = await make_inspection(db_session, org_beta, prop)
    return dict(org=org_beta, prop=prop, unit=unit,
                tenant=tenant, lease=lease, issue=issue, inspection=inspection)


@pytest_asyncio.fixture
async def landlord_setup(db_session: AsyncSession, org_alpha):
    """
    Two properties in org_alpha; a read-only landlord profile granted access
    to prop_a only (not prop_b).  The profile is pre-inserted so that
    _upsert_profile() finds and updates it (leaving is_read_only intact).
    """
    from app.models.landlord_invite import LandlordPropertyAccess
    from app.models.profile import Profile

    prop_a = await make_property(db_session, org_alpha, name="Alpha Prop A")
    prop_b = await make_property(db_session, org_alpha, name="Alpha Prop B")

    # Pre-create the landlord profile with is_read_only=True.
    # logto_sub matches "org-a-ro-landlord" dev user (sub="org_a_landlord_1").
    profile = Profile(
        logto_sub="org_a_landlord_1",
        logto_org_id="org_alpha",
        organisation_id=org_alpha.id,
        role="landlord",
        is_read_only=True,
        display_name="Alpha Landlord",
        email="landlord@org-alpha.test",
    )
    db_session.add(profile)
    await db_session.flush()

    # Grant access to prop_a only.
    db_session.add(LandlordPropertyAccess(
        landlord_profile_id=profile.id,
        property_id=prop_a.id,
        is_read_only=True,
        granted_by_profile_id=None,
    ))
    await db_session.flush()

    return dict(org=org_alpha, prop_a=prop_a, prop_b=prop_b, profile=profile)


# ── Test class 1: Cross-org isolation ────────────────────────────────────────

@pytest.mark.asyncio
class TestCrossOrgIsolation:
    """Org A's owner must not be able to read any of Org B's resources."""

    async def test_property_list_excludes_other_org(
        self, client: AsyncClient, alpha, beta
    ):
        resp = await client.get("/api/v1/properties", headers=A_OWNER)
        assert resp.status_code == 200
        ids = {p["id"] for p in resp.json()["data"]}
        assert str(alpha["prop"].id) in ids
        assert str(beta["prop"].id) not in ids, "Org B property must not appear in Org A's list"

    async def test_property_get_other_org_returns_404(
        self, client: AsyncClient, alpha, beta
    ):
        resp = await client.get(f"/api/v1/properties/{beta['prop'].id}", headers=A_OWNER)
        assert resp.status_code == 404, "Org A must not fetch Org B's property"

    async def test_unit_list_excludes_other_org(
        self, client: AsyncClient, alpha, beta
    ):
        # Alpha owner listing units on beta's property must get 404 (property not found)
        resp = await client.get(
            f"/api/v1/properties/{beta['prop'].id}/units", headers=A_OWNER
        )
        assert resp.status_code == 404

    async def test_unit_get_other_org_returns_404(
        self, client: AsyncClient, alpha, beta
    ):
        resp = await client.get(
            f"/api/v1/properties/{beta['prop'].id}/units/{beta['unit'].id}",
            headers=A_OWNER,
        )
        assert resp.status_code == 404

    async def test_lease_list_excludes_other_org(
        self, client: AsyncClient, alpha, beta
    ):
        resp = await client.get("/api/v1/leases", headers=A_OWNER)
        assert resp.status_code == 200
        ids = {item["id"] for item in resp.json().get("data", [])}
        assert str(beta["lease"].id) not in ids, "Org B lease must not appear in Org A's list"

    async def test_lease_get_other_org_returns_404(
        self, client: AsyncClient, alpha, beta
    ):
        resp = await client.get(f"/api/v1/leases/{beta['lease'].id}", headers=A_OWNER)
        assert resp.status_code == 404, "Org A must not fetch Org B's lease"

    async def test_tenant_list_excludes_other_org(
        self, client: AsyncClient, alpha, beta
    ):
        resp = await client.get("/api/v1/tenants", headers=A_OWNER)
        assert resp.status_code == 200
        ids = {t["id"] for t in resp.json().get("data", [])}
        assert str(beta["tenant"].id) not in ids, "Org B tenant must not appear in Org A's list"

    async def test_tenant_get_other_org_returns_404(
        self, client: AsyncClient, alpha, beta
    ):
        resp = await client.get(f"/api/v1/tenants/{beta['tenant'].id}", headers=A_OWNER)
        assert resp.status_code == 404, "Org A must not fetch Org B's tenant"

    async def test_maintenance_list_excludes_other_org(
        self, client: AsyncClient, alpha, beta
    ):
        resp = await client.get("/api/v1/maintenance", headers=A_OWNER)
        assert resp.status_code == 200
        ids = {m["id"] for m in resp.json().get("data", [])}
        assert str(beta["issue"].id) not in ids, "Org B maintenance must not appear in Org A's list"

    async def test_maintenance_get_other_org_returns_404(
        self, client: AsyncClient, alpha, beta
    ):
        resp = await client.get(f"/api/v1/maintenance/{beta['issue'].id}", headers=A_OWNER)
        assert resp.status_code == 404, "Org A must not fetch Org B's maintenance issue"

    async def test_inspection_list_excludes_other_org(
        self, client: AsyncClient, alpha, beta
    ):
        resp = await client.get("/api/v1/inspections", headers=A_OWNER)
        assert resp.status_code == 200
        ids = {i["id"] for i in resp.json().get("data", [])}
        assert str(beta["inspection"].id) not in ids, "Org B inspection must not appear in Org A's list"

    async def test_inspection_get_other_org_returns_404(
        self, client: AsyncClient, alpha, beta
    ):
        resp = await client.get(
            f"/api/v1/inspections/{beta['inspection'].id}", headers=A_OWNER
        )
        assert resp.status_code == 404, "Org A must not fetch Org B's inspection"

    async def test_symmetry_b_cannot_read_a(
        self, client: AsyncClient, alpha, beta
    ):
        """Symmetry check: Org B also cannot read Org A's property."""
        resp = await client.get(f"/api/v1/properties/{alpha['prop'].id}", headers=B_OWNER)
        assert resp.status_code == 404, "Org B must not fetch Org A's property"


# ── Test class 2: Read-only landlord isolation within same org ────────────────

@pytest.mark.asyncio
class TestReadOnlyLandlordIsolation:
    """
    A read-only landlord in org_alpha must only see the specific properties
    they have been granted access to via LandlordPropertyAccess — not all
    properties in the org.
    """

    async def test_landlord_list_shows_only_granted_property(
        self, client: AsyncClient, landlord_setup
    ):
        resp = await client.get("/api/v1/properties", headers=A_LANDLORD)
        assert resp.status_code == 200
        ids = {p["id"] for p in resp.json()["data"]}
        assert str(landlord_setup["prop_a"].id) in ids, "Granted property must appear"
        assert str(landlord_setup["prop_b"].id) not in ids, (
            "Non-granted property in same org must not appear"
        )

    async def test_landlord_can_get_granted_property(
        self, client: AsyncClient, landlord_setup
    ):
        resp = await client.get(
            f"/api/v1/properties/{landlord_setup['prop_a'].id}", headers=A_LANDLORD
        )
        assert resp.status_code == 200

    async def test_landlord_cannot_get_non_granted_property(
        self, client: AsyncClient, landlord_setup
    ):
        resp = await client.get(
            f"/api/v1/properties/{landlord_setup['prop_b'].id}", headers=A_LANDLORD
        )
        assert resp.status_code == 404, (
            "Non-granted property in same org must return 404 for read-only landlord"
        )

    async def test_landlord_cannot_get_unknown_property(
        self, client: AsyncClient, landlord_setup
    ):
        """Completely unknown UUID must also return 404, not 403."""
        resp = await client.get(
            f"/api/v1/properties/{uuid.uuid4()}", headers=A_LANDLORD
        )
        assert resp.status_code == 404
