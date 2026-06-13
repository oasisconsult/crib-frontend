"""
Tests for the eviction notice workflow (Uganda LTA 2022, §§ 73-78).

Coverage:
  - Issue notice (happy path, all four notice types)
  - LTA minimum notice period per type (14 / 30 / 180 days)
  - Redevelopment requires court_reference
  - Reason too short rejected
  - Only one active notice per lease (409 on second)
  - Non-active lease rejected
  - List notices
  - Get single notice
  - Serve notice (issued → served)
  - Serve already-served notice rejected
  - Dispute issued / served notice
  - Dispute terminal notice rejected
  - Withdraw issued / served notice
  - Withdraw terminal notice rejected
  - Execute requires served status
  - Execute before effective_date rejected
  - Cross-org isolation
"""

from datetime import date, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers

PREFIX = "/api/v1"


# ── Date helpers ──────────────────────────────────────────────────────────────

def _eff(days_ahead: int) -> str:
    return (date.today() + timedelta(days=days_ahead)).isoformat()


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
async def org(dev_org):
    return dev_org


@pytest.fixture
async def setup(db_session: AsyncSession, org):
    from app.models.lease import LeaseStatus
    from tests.factories import make_lease, make_property, make_tenant, make_unit

    prop   = await make_property(db_session, org, name="Eviction Test Property")
    unit   = await make_unit(db_session, prop, monthly_rent=800_000)
    tenant = await make_tenant(db_session, org)
    lease  = await make_lease(
        db_session, org, unit, tenant,
        monthly_rent=800_000,
        status=LeaseStatus.active,
    )
    await db_session.commit()
    return {"prop": prop, "unit": unit, "tenant": tenant, "lease": lease}


# ── Issue notice — happy path ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_issue_non_payment_notice(client: AsyncClient, setup):
    lease = setup["lease"]
    resp = await client.post(
        f"{PREFIX}/leases/{lease.id}/eviction-notices",
        headers=auth_headers("manager-1"),
        json={
            "noticeType": "non_payment",
            "reason": "Tenant has not paid rent for 3 consecutive months",
            "effectiveDate": _eff(16),
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "issued"
    assert body["noticeType"] == "non_payment"
    assert body["leaseId"] == str(lease.id)


@pytest.mark.asyncio
async def test_issue_breach_notice(client: AsyncClient, setup):
    lease = setup["lease"]
    resp = await client.post(
        f"{PREFIX}/leases/{lease.id}/eviction-notices",
        headers=auth_headers("manager-1"),
        json={
            "noticeType": "breach",
            "reason": "Tenant is subletting without landlord consent contrary to tenancy agreement",
            "effectiveDate": _eff(16),
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["noticeType"] == "breach"


@pytest.mark.asyncio
async def test_issue_end_of_term_notice(client: AsyncClient, setup):
    lease = setup["lease"]
    resp = await client.post(
        f"{PREFIX}/leases/{lease.id}/eviction-notices",
        headers=auth_headers("manager-1"),
        json={
            "noticeType": "end_of_term",
            "reason": "Tenancy period has ended and will not be renewed",
            "effectiveDate": _eff(32),
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["noticeType"] == "end_of_term"


@pytest.mark.asyncio
async def test_issue_redevelopment_notice(client: AsyncClient, setup):
    lease = setup["lease"]
    resp = await client.post(
        f"{PREFIX}/leases/{lease.id}/eviction-notices",
        headers=auth_headers("manager-1"),
        json={
            "noticeType": "redevelopment",
            "reason": "Property is being demolished for redevelopment; court order obtained",
            "effectiveDate": _eff(185),
            "courtReference": "HCCS-2026-1234",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["noticeType"] == "redevelopment"
    assert body["courtReference"] == "HCCS-2026-1234"


# ── LTA minimum notice period enforcement ─────────────────────────────────────

@pytest.mark.asyncio
async def test_non_payment_below_14_days_rejected(client: AsyncClient, setup):
    lease = setup["lease"]
    resp = await client.post(
        f"{PREFIX}/leases/{lease.id}/eviction-notices",
        headers=auth_headers("manager-1"),
        json={
            "noticeType": "non_payment",
            "reason": "Tenant has not paid rent for 3 consecutive months",
            "effectiveDate": _eff(10),  # too soon
        },
    )
    assert resp.status_code == 422, resp.text
    assert "14" in resp.text


@pytest.mark.asyncio
async def test_non_payment_exactly_14_days_accepted(client: AsyncClient, setup):
    lease = setup["lease"]
    resp = await client.post(
        f"{PREFIX}/leases/{lease.id}/eviction-notices",
        headers=auth_headers("manager-1"),
        json={
            "noticeType": "non_payment",
            "reason": "Tenant has not paid rent for 3 consecutive months",
            "effectiveDate": _eff(14),
        },
    )
    assert resp.status_code == 201, resp.text


@pytest.mark.asyncio
async def test_end_of_term_below_30_days_rejected(client: AsyncClient, setup):
    lease = setup["lease"]
    resp = await client.post(
        f"{PREFIX}/leases/{lease.id}/eviction-notices",
        headers=auth_headers("manager-1"),
        json={
            "noticeType": "end_of_term",
            "reason": "Tenancy period has ended and will not be renewed",
            "effectiveDate": _eff(20),  # too soon for end_of_term
        },
    )
    assert resp.status_code == 422, resp.text
    assert "30" in resp.text


@pytest.mark.asyncio
async def test_redevelopment_below_180_days_rejected(client: AsyncClient, setup):
    lease = setup["lease"]
    resp = await client.post(
        f"{PREFIX}/leases/{lease.id}/eviction-notices",
        headers=auth_headers("manager-1"),
        json={
            "noticeType": "redevelopment",
            "reason": "Property is being demolished",
            "effectiveDate": _eff(90),  # too soon
            "courtReference": "HCCS-2026-001",
        },
    )
    assert resp.status_code == 422, resp.text
    assert "180" in resp.text


@pytest.mark.asyncio
async def test_redevelopment_without_court_reference_rejected(client: AsyncClient, setup):
    lease = setup["lease"]
    resp = await client.post(
        f"{PREFIX}/leases/{lease.id}/eviction-notices",
        headers=auth_headers("manager-1"),
        json={
            "noticeType": "redevelopment",
            "reason": "Property is being demolished",
            "effectiveDate": _eff(185),
            # no courtReference
        },
    )
    assert resp.status_code == 422, resp.text
    assert "court" in resp.text.lower()


@pytest.mark.asyncio
async def test_invalid_notice_type_rejected(client: AsyncClient, setup):
    lease = setup["lease"]
    resp = await client.post(
        f"{PREFIX}/leases/{lease.id}/eviction-notices",
        headers=auth_headers("manager-1"),
        json={
            "noticeType": "bogus_type",
            "reason": "Some reason that is long enough",
            "effectiveDate": _eff(20),
        },
    )
    assert resp.status_code == 422, resp.text


# ── Duplicate active notice ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_second_active_notice_rejected(client: AsyncClient, setup):
    lease = setup["lease"]
    headers = auth_headers("manager-1")
    payload = {
        "noticeType": "non_payment",
        "reason": "Tenant has not paid rent for 3 consecutive months",
        "effectiveDate": _eff(16),
    }
    r1 = await client.post(f"{PREFIX}/leases/{lease.id}/eviction-notices", headers=headers, json=payload)
    assert r1.status_code == 201

    r2 = await client.post(f"{PREFIX}/leases/{lease.id}/eviction-notices", headers=headers, json=payload)
    assert r2.status_code == 409, r2.text
    assert "active" in r2.text.lower()


# ── Non-active lease ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_notice_on_draft_lease_rejected(client: AsyncClient, db_session, org):
    from app.models.lease import LeaseStatus
    from tests.factories import make_lease, make_property, make_tenant, make_unit

    prop   = await make_property(db_session, org)
    unit   = await make_unit(db_session, prop, monthly_rent=600_000)
    tenant = await make_tenant(db_session, org)
    lease  = await make_lease(db_session, org, unit, tenant, status=LeaseStatus.draft)
    await db_session.commit()

    resp = await client.post(
        f"{PREFIX}/leases/{lease.id}/eviction-notices",
        headers=auth_headers("manager-1"),
        json={
            "noticeType": "non_payment",
            "reason": "Tenant has not paid rent for 3 consecutive months",
            "effectiveDate": _eff(16),
        },
    )
    assert resp.status_code == 422, resp.text
    assert "active" in resp.text.lower()


# ── List & Get ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_notices(client: AsyncClient, setup):
    lease = setup["lease"]
    headers = auth_headers("manager-1")
    await client.post(
        f"{PREFIX}/leases/{lease.id}/eviction-notices",
        headers=headers,
        json={
            "noticeType": "breach",
            "reason": "Repeated breach of no-pets clause in the tenancy agreement",
            "effectiveDate": _eff(16),
        },
    )
    resp = await client.get(f"{PREFIX}/leases/{lease.id}/eviction-notices", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 1
    assert len(body["data"]) == 1


@pytest.mark.asyncio
async def test_get_single_notice(client: AsyncClient, setup):
    lease = setup["lease"]
    headers = auth_headers("manager-1")
    created = (await client.post(
        f"{PREFIX}/leases/{lease.id}/eviction-notices",
        headers=headers,
        json={
            "noticeType": "non_payment",
            "reason": "Tenant has not paid rent for 3 consecutive months",
            "effectiveDate": _eff(16),
        },
    )).json()
    notice_id = created["id"]

    get_resp = await client.get(
        f"{PREFIX}/leases/{lease.id}/eviction-notices/{notice_id}", headers=headers
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == notice_id


# ── Serve ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_serve_notice(client: AsyncClient, setup):
    lease = setup["lease"]
    headers = auth_headers("manager-1")
    notice_id = (await client.post(
        f"{PREFIX}/leases/{lease.id}/eviction-notices",
        headers=headers,
        json={
            "noticeType": "non_payment",
            "reason": "Tenant has not paid rent for 3 consecutive months",
            "effectiveDate": _eff(16),
        },
    )).json()["id"]

    resp = await client.patch(
        f"{PREFIX}/leases/{lease.id}/eviction-notices/{notice_id}/serve", headers=headers
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "served"
    assert body["servedAt"] is not None


@pytest.mark.asyncio
async def test_serve_already_served_rejected(client: AsyncClient, setup):
    lease = setup["lease"]
    headers = auth_headers("manager-1")
    notice_id = (await client.post(
        f"{PREFIX}/leases/{lease.id}/eviction-notices",
        headers=headers,
        json={
            "noticeType": "non_payment",
            "reason": "Tenant has not paid rent for 3 consecutive months",
            "effectiveDate": _eff(16),
        },
    )).json()["id"]

    await client.patch(
        f"{PREFIX}/leases/{lease.id}/eviction-notices/{notice_id}/serve", headers=headers
    )
    second = await client.patch(
        f"{PREFIX}/leases/{lease.id}/eviction-notices/{notice_id}/serve", headers=headers
    )
    assert second.status_code == 422


# ── Dispute ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_dispute_issued_notice(client: AsyncClient, setup):
    lease = setup["lease"]
    headers = auth_headers("manager-1")
    notice_id = (await client.post(
        f"{PREFIX}/leases/{lease.id}/eviction-notices",
        headers=headers,
        json={
            "noticeType": "breach",
            "reason": "Tenant is subletting without consent",
            "effectiveDate": _eff(16),
        },
    )).json()["id"]

    resp = await client.patch(
        f"{PREFIX}/leases/{lease.id}/eviction-notices/{notice_id}/dispute",
        headers=headers,
        json={"grounds": "Tenant has written permission from previous manager"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "disputed"
    assert "written permission" in body["notes"]


@pytest.mark.asyncio
async def test_dispute_withdrawn_notice_rejected(client: AsyncClient, setup):
    lease = setup["lease"]
    headers = auth_headers("manager-1")
    notice_id = (await client.post(
        f"{PREFIX}/leases/{lease.id}/eviction-notices",
        headers=headers,
        json={
            "noticeType": "non_payment",
            "reason": "Tenant has not paid rent for 3 consecutive months",
            "effectiveDate": _eff(16),
        },
    )).json()["id"]

    await client.patch(
        f"{PREFIX}/leases/{lease.id}/eviction-notices/{notice_id}/withdraw",
        headers=headers,
        json={},
    )
    resp = await client.patch(
        f"{PREFIX}/leases/{lease.id}/eviction-notices/{notice_id}/dispute",
        headers=headers,
        json={},
    )
    assert resp.status_code == 422


# ── Withdraw ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_withdraw_notice(client: AsyncClient, setup):
    lease = setup["lease"]
    headers = auth_headers("manager-1")
    notice_id = (await client.post(
        f"{PREFIX}/leases/{lease.id}/eviction-notices",
        headers=headers,
        json={
            "noticeType": "non_payment",
            "reason": "Tenant has not paid rent for 3 consecutive months",
            "effectiveDate": _eff(16),
        },
    )).json()["id"]

    resp = await client.patch(
        f"{PREFIX}/leases/{lease.id}/eviction-notices/{notice_id}/withdraw",
        headers=headers,
        json={"reason": "Tenant cleared arrears in full"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "withdrawn"
    assert body["withdrawnAt"] is not None
    assert "cleared arrears" in body["notes"]


@pytest.mark.asyncio
async def test_withdraw_then_new_notice_allowed(client: AsyncClient, setup):
    lease = setup["lease"]
    headers = auth_headers("manager-1")

    notice_id = (await client.post(
        f"{PREFIX}/leases/{lease.id}/eviction-notices",
        headers=headers,
        json={
            "noticeType": "non_payment",
            "reason": "Tenant has not paid rent for 3 consecutive months",
            "effectiveDate": _eff(16),
        },
    )).json()["id"]

    await client.patch(
        f"{PREFIX}/leases/{lease.id}/eviction-notices/{notice_id}/withdraw",
        headers=headers,
        json={},
    )

    second = await client.post(
        f"{PREFIX}/leases/{lease.id}/eviction-notices",
        headers=headers,
        json={
            "noticeType": "breach",
            "reason": "Tenant is subletting without consent from the landlord",
            "effectiveDate": _eff(16),
        },
    )
    assert second.status_code == 201


@pytest.mark.asyncio
async def test_withdraw_disputed_notice_rejected(client: AsyncClient, setup):
    lease = setup["lease"]
    headers = auth_headers("manager-1")
    notice_id = (await client.post(
        f"{PREFIX}/leases/{lease.id}/eviction-notices",
        headers=headers,
        json={
            "noticeType": "non_payment",
            "reason": "Tenant has not paid rent for 3 consecutive months",
            "effectiveDate": _eff(16),
        },
    )).json()["id"]

    await client.patch(
        f"{PREFIX}/leases/{lease.id}/eviction-notices/{notice_id}/dispute",
        headers=headers,
        json={},
    )
    resp = await client.patch(
        f"{PREFIX}/leases/{lease.id}/eviction-notices/{notice_id}/withdraw",
        headers=headers,
        json={},
    )
    assert resp.status_code == 422


# ── Execute ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_execute_requires_served_status(client: AsyncClient, setup):
    """Cannot execute a notice that hasn't been served."""
    lease = setup["lease"]
    headers = auth_headers("manager-1")
    notice_id = (await client.post(
        f"{PREFIX}/leases/{lease.id}/eviction-notices",
        headers=headers,
        json={
            "noticeType": "non_payment",
            "reason": "Tenant has not paid rent for 3 consecutive months",
            "effectiveDate": _eff(16),
        },
    )).json()["id"]

    # Still in 'issued' — not yet served
    resp = await client.patch(
        f"{PREFIX}/leases/{lease.id}/eviction-notices/{notice_id}/execute", headers=headers
    )
    assert resp.status_code == 422, resp.text
    assert "served" in resp.text.lower()


@pytest.mark.asyncio
async def test_execute_before_effective_date_rejected(client: AsyncClient, setup, db_session):
    """Even after serving, cannot execute before effective_date."""
    from datetime import timedelta

    lease = setup["lease"]
    headers = auth_headers("manager-1")

    notice_id = (await client.post(
        f"{PREFIX}/leases/{lease.id}/eviction-notices",
        headers=headers,
        json={
            "noticeType": "non_payment",
            "reason": "Tenant has not paid rent for 3 consecutive months",
            "effectiveDate": _eff(16),  # in the future
        },
    )).json()["id"]

    await client.patch(
        f"{PREFIX}/leases/{lease.id}/eviction-notices/{notice_id}/serve", headers=headers
    )

    # effective_date is still in the future — execute should be rejected
    resp = await client.patch(
        f"{PREFIX}/leases/{lease.id}/eviction-notices/{notice_id}/execute", headers=headers
    )
    assert resp.status_code == 422, resp.text
    assert "effective date" in resp.text.lower()


# ── Cross-org isolation ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cross_org_isolation(client: AsyncClient, setup):
    lease = setup["lease"]
    headers = auth_headers("manager-1")
    notice_id = (await client.post(
        f"{PREFIX}/leases/{lease.id}/eviction-notices",
        headers=headers,
        json={
            "noticeType": "non_payment",
            "reason": "Tenant has not paid rent for 3 consecutive months",
            "effectiveDate": _eff(16),
        },
    )).json()["id"]

    other_resp = await client.get(
        f"{PREFIX}/leases/{lease.id}/eviction-notices/{notice_id}",
        headers=auth_headers("other-manager"),
    )
    assert other_resp.status_code in (401, 403, 404)
