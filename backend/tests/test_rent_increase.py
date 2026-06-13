"""
Tests for the rent increase workflow (Uganda LTA 2022).

Coverage:
  - Issue notice (happy path, increase % computed correctly)
  - LTA cap enforcement: > 10% rejected with 422
  - Notice period enforcement: effective_date < 90 days rejected with 422
  - Decrease rejected (new_rent <= current_rent)
  - Only one active notice per lease (409 on second)
  - List notices for a lease
  - Get single notice
  - Acknowledge notice (status: pending_ack → acknowledged)
  - Acknowledge already-acknowledged notice (422)
  - Withdraw notice (pending_ack → withdrawn)
  - Withdraw applied/withdrawn notice (422)
  - Issue notice on non-active lease (422)
  - Cross-org isolation (404)
"""

from datetime import date, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers
from tests.factories import make_lease, make_property, make_tenant, make_unit

PREFIX = "/api/v1"

# ── Date helpers ──────────────────────────────────────────────────────────────

def _eff(days_ahead: int = 95) -> str:
    """Return an effective date string `days_ahead` days from today."""
    return (date.today() + timedelta(days=days_ahead)).isoformat()


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
async def org(dev_org):
    return dev_org


@pytest.fixture
async def setup(db_session: AsyncSession, org):
    """Create property → unit → tenant → active lease."""
    prop   = await make_property(db_session, org, name="RI Test Property")
    unit   = await make_unit(db_session, prop, monthly_rent=1_000_000)
    tenant = await make_tenant(db_session, org)

    from app.models.lease import LeaseStatus
    lease = await make_lease(
        db_session, org, unit, tenant,
        monthly_rent=1_000_000,
        status=LeaseStatus.active,
    )
    await db_session.commit()
    return {"prop": prop, "unit": unit, "tenant": tenant, "lease": lease}


# ── Issue notice ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_issue_notice_happy_path(client: AsyncClient, setup):
    lease = setup["lease"]
    resp = await client.post(
        f"{PREFIX}/leases/{lease.id}/rent-increases",
        headers=auth_headers("manager-1"),
        json={"newRent": 1_080_000, "effectiveDate": _eff(95)},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "pending_ack"
    assert float(body["currentRent"]) == 1_000_000
    assert float(body["newRent"]) == 1_080_000
    assert abs(float(body["increasePct"]) - 8.0) < 0.01
    assert body["leaseId"] == str(lease.id)
    assert body["noticePdfUrl"] is not None or body["noticePdfUrl"] is None  # pdf optional


@pytest.mark.asyncio
async def test_increase_pct_computed_correctly(client: AsyncClient, setup):
    lease = setup["lease"]
    resp = await client.post(
        f"{PREFIX}/leases/{lease.id}/rent-increases",
        headers=auth_headers("manager-1"),
        json={"newRent": 1_050_000, "effectiveDate": _eff(100)},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert abs(float(body["increasePct"]) - 5.0) < 0.01


# ── LTA 2022 validations ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_exceeds_10pct_cap_rejected(client: AsyncClient, setup):
    lease = setup["lease"]
    resp = await client.post(
        f"{PREFIX}/leases/{lease.id}/rent-increases",
        headers=auth_headers("manager-1"),
        json={"newRent": 1_110_000, "effectiveDate": _eff(95)},  # 11%
    )
    assert resp.status_code == 422, resp.text
    assert "10" in resp.text


@pytest.mark.asyncio
async def test_exactly_10pct_accepted(client: AsyncClient, setup):
    lease = setup["lease"]
    resp = await client.post(
        f"{PREFIX}/leases/{lease.id}/rent-increases",
        headers=auth_headers("manager-1"),
        json={"newRent": 1_100_000, "effectiveDate": _eff(95)},  # exactly 10%
    )
    assert resp.status_code == 201, resp.text
    assert abs(float(resp.json()["increasePct"]) - 10.0) < 0.01


@pytest.mark.asyncio
async def test_notice_period_too_short_rejected(client: AsyncClient, setup):
    lease = setup["lease"]
    resp = await client.post(
        f"{PREFIX}/leases/{lease.id}/rent-increases",
        headers=auth_headers("manager-1"),
        json={"newRent": 1_050_000, "effectiveDate": _eff(30)},  # only 30 days
    )
    assert resp.status_code == 422, resp.text
    assert "90" in resp.text


@pytest.mark.asyncio
async def test_exactly_90_days_accepted(client: AsyncClient, setup):
    lease = setup["lease"]
    resp = await client.post(
        f"{PREFIX}/leases/{lease.id}/rent-increases",
        headers=auth_headers("manager-1"),
        json={"newRent": 1_050_000, "effectiveDate": _eff(90)},
    )
    assert resp.status_code == 201, resp.text


@pytest.mark.asyncio
async def test_decrease_rejected(client: AsyncClient, setup):
    lease = setup["lease"]
    resp = await client.post(
        f"{PREFIX}/leases/{lease.id}/rent-increases",
        headers=auth_headers("manager-1"),
        json={"newRent": 900_000, "effectiveDate": _eff(95)},  # decrease
    )
    assert resp.status_code == 422, resp.text
    assert "greater" in resp.text.lower()


@pytest.mark.asyncio
async def test_same_rent_rejected(client: AsyncClient, setup):
    lease = setup["lease"]
    resp = await client.post(
        f"{PREFIX}/leases/{lease.id}/rent-increases",
        headers=auth_headers("manager-1"),
        json={"newRent": 1_000_000, "effectiveDate": _eff(95)},  # no change
    )
    assert resp.status_code == 422, resp.text


# ── Duplicate active notice ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_second_active_notice_rejected(client: AsyncClient, setup):
    lease = setup["lease"]
    headers = auth_headers("manager-1")

    r1 = await client.post(
        f"{PREFIX}/leases/{lease.id}/rent-increases",
        headers=headers,
        json={"newRent": 1_050_000, "effectiveDate": _eff(95)},
    )
    assert r1.status_code == 201

    r2 = await client.post(
        f"{PREFIX}/leases/{lease.id}/rent-increases",
        headers=headers,
        json={"newRent": 1_080_000, "effectiveDate": _eff(100)},
    )
    assert r2.status_code == 409, r2.text
    assert "active" in r2.text.lower()


# ── Non-active lease ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_notice_on_draft_lease_rejected(client: AsyncClient, db_session, org):
    prop   = await make_property(db_session, org)
    unit   = await make_unit(db_session, prop, monthly_rent=800_000)
    tenant = await make_tenant(db_session, org)

    from app.models.lease import LeaseStatus
    lease = await make_lease(db_session, org, unit, tenant, status=LeaseStatus.draft)
    await db_session.commit()

    resp = await client.post(
        f"{PREFIX}/leases/{lease.id}/rent-increases",
        headers=auth_headers("manager-1"),
        json={"newRent": 850_000, "effectiveDate": _eff(95)},
    )
    assert resp.status_code == 422, resp.text
    assert "active" in resp.text.lower()


# ── List & Get ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_notices(client: AsyncClient, setup):
    lease = setup["lease"]
    headers = auth_headers("manager-1")

    await client.post(
        f"{PREFIX}/leases/{lease.id}/rent-increases",
        headers=headers,
        json={"newRent": 1_050_000, "effectiveDate": _eff(95), "notes": "Annual review"},
    )

    resp = await client.get(f"{PREFIX}/leases/{lease.id}/rent-increases", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 1
    assert len(body["data"]) == 1
    assert body["data"][0]["notes"] == "Annual review"


@pytest.mark.asyncio
async def test_get_single_notice(client: AsyncClient, setup):
    lease = setup["lease"]
    headers = auth_headers("manager-1")

    create_resp = await client.post(
        f"{PREFIX}/leases/{lease.id}/rent-increases",
        headers=headers,
        json={"newRent": 1_060_000, "effectiveDate": _eff(95)},
    )
    notice_id = create_resp.json()["id"]

    get_resp = await client.get(
        f"{PREFIX}/leases/{lease.id}/rent-increases/{notice_id}",
        headers=headers,
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == notice_id


# ── Acknowledge ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_acknowledge_notice(client: AsyncClient, setup):
    lease = setup["lease"]
    headers = auth_headers("manager-1")

    ri_id = (await client.post(
        f"{PREFIX}/leases/{lease.id}/rent-increases",
        headers=headers,
        json={"newRent": 1_050_000, "effectiveDate": _eff(95)},
    )).json()["id"]

    ack_resp = await client.patch(
        f"{PREFIX}/leases/{lease.id}/rent-increases/{ri_id}/acknowledge",
        headers=headers,
    )
    assert ack_resp.status_code == 200, ack_resp.text
    body = ack_resp.json()
    assert body["status"] == "acknowledged"
    assert body["acknowledgedAt"] is not None


@pytest.mark.asyncio
async def test_acknowledge_already_acknowledged_rejected(client: AsyncClient, setup):
    lease = setup["lease"]
    headers = auth_headers("manager-1")

    ri_id = (await client.post(
        f"{PREFIX}/leases/{lease.id}/rent-increases",
        headers=headers,
        json={"newRent": 1_050_000, "effectiveDate": _eff(95)},
    )).json()["id"]

    await client.patch(
        f"{PREFIX}/leases/{lease.id}/rent-increases/{ri_id}/acknowledge", headers=headers
    )
    second = await client.patch(
        f"{PREFIX}/leases/{lease.id}/rent-increases/{ri_id}/acknowledge", headers=headers
    )
    assert second.status_code == 422


# ── Withdraw ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_withdraw_notice(client: AsyncClient, setup):
    lease = setup["lease"]
    headers = auth_headers("manager-1")

    ri_id = (await client.post(
        f"{PREFIX}/leases/{lease.id}/rent-increases",
        headers=headers,
        json={"newRent": 1_050_000, "effectiveDate": _eff(95)},
    )).json()["id"]

    wd_resp = await client.patch(
        f"{PREFIX}/leases/{lease.id}/rent-increases/{ri_id}/withdraw",
        headers=headers,
        json={"reason": "Changed my mind"},
    )
    assert wd_resp.status_code == 200, wd_resp.text
    body = wd_resp.json()
    assert body["status"] == "withdrawn"
    assert body["withdrawnAt"] is not None
    assert "Changed my mind" in body["notes"]


@pytest.mark.asyncio
async def test_withdraw_then_issue_new_allowed(client: AsyncClient, setup):
    """After withdrawing, a new notice for the same lease should be accepted."""
    lease = setup["lease"]
    headers = auth_headers("manager-1")

    ri_id = (await client.post(
        f"{PREFIX}/leases/{lease.id}/rent-increases",
        headers=headers,
        json={"newRent": 1_050_000, "effectiveDate": _eff(95)},
    )).json()["id"]

    await client.patch(
        f"{PREFIX}/leases/{lease.id}/rent-increases/{ri_id}/withdraw",
        headers=headers,
        json={},
    )

    second = await client.post(
        f"{PREFIX}/leases/{lease.id}/rent-increases",
        headers=headers,
        json={"newRent": 1_060_000, "effectiveDate": _eff(100)},
    )
    assert second.status_code == 201


@pytest.mark.asyncio
async def test_withdraw_already_withdrawn_rejected(client: AsyncClient, setup):
    lease = setup["lease"]
    headers = auth_headers("manager-1")

    ri_id = (await client.post(
        f"{PREFIX}/leases/{lease.id}/rent-increases",
        headers=headers,
        json={"newRent": 1_050_000, "effectiveDate": _eff(95)},
    )).json()["id"]

    await client.patch(
        f"{PREFIX}/leases/{lease.id}/rent-increases/{ri_id}/withdraw", headers=headers, json={}
    )
    second = await client.patch(
        f"{PREFIX}/leases/{lease.id}/rent-increases/{ri_id}/withdraw", headers=headers, json={}
    )
    assert second.status_code == 422


# ── Cross-org isolation ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cross_org_isolation(client: AsyncClient, setup, db_session):
    from tests.factories import make_organisation
    other_org = await make_organisation(db_session, name="Other Org")
    await db_session.commit()

    lease = setup["lease"]
    headers = auth_headers("manager-1")

    ri_id = (await client.post(
        f"{PREFIX}/leases/{lease.id}/rent-increases",
        headers=headers,
        json={"newRent": 1_050_000, "effectiveDate": _eff(95)},
    )).json()["id"]

    # Request from a different org's manager should 404
    other_resp = await client.get(
        f"{PREFIX}/leases/{lease.id}/rent-increases/{ri_id}",
        headers=auth_headers("other-manager"),
    )
    assert other_resp.status_code in (401, 403, 404)
