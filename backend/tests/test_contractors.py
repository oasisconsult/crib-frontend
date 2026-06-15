"""Tests for the contractor directory endpoints (Sprint 3.3).

Coverage:
  POST /contractors         — create contractor
  GET  /contractors         — list (all, by specialty, by search, inactive)
  GET  /contractors/{id}    — get single
  PUT  /contractors/{id}    — update
  DELETE /contractors/{id}  — deactivate (soft)
  POST /maintenance/{id}/transition + contractorId — assign via directory
  POST /maintenance/{id}/transition + assigned_to  — assign free-text fallback
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers
from tests.factories import make_property, make_maintenance_issue


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def ctx(dev_org, db_session: AsyncSession):
    """Use the pre-seeded dev org so that manager-1 auth has org access."""
    prop = await make_property(db_session, dev_org)
    await db_session.flush()
    return {"org": dev_org, "prop": prop}


@pytest_asyncio.fixture
async def contractor(client: AsyncClient, ctx):
    """Create a contractor via the API and return the response body."""
    r = await client.post(
        "/api/v1/contractors",
        json={
            "name": "Bob's Plumbing",
            "phone": "+256700000001",
            "email": "bob@example.com",
            "specialty": "plumbing",
            "notes": "Available weekdays",
        },
        headers=auth_headers(),
    )
    assert r.status_code == 201, r.text
    return r.json()


# ── Create ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_contractor(client: AsyncClient, ctx):
    r = await client.post(
        "/api/v1/contractors",
        json={"name": "Alice Electricals", "specialty": "electrical"},
        headers=auth_headers(),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Alice Electricals"
    assert body["specialty"] == "electrical"
    assert body["isActive"] is True
    assert body["phone"] is None
    assert "id" in body


@pytest.mark.asyncio
async def test_create_contractor_requires_name(client: AsyncClient, ctx):
    r = await client.post(
        "/api/v1/contractors",
        json={"specialty": "plumbing"},
        headers=auth_headers(),
    )
    assert r.status_code == 422


# ── List ───────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_contractors_empty(client: AsyncClient, ctx):
    r = await client.get("/api/v1/contractors", headers=auth_headers())
    assert r.status_code == 200
    body = r.json()
    assert body["data"] == []
    assert body["total"] == 0


@pytest.mark.asyncio
async def test_list_contractors_returns_created(client: AsyncClient, ctx, contractor):
    r = await client.get("/api/v1/contractors", headers=auth_headers())
    assert r.status_code == 200
    ids = [c["id"] for c in r.json()["data"]]
    assert contractor["id"] in ids


@pytest.mark.asyncio
async def test_list_contractors_filter_specialty(client: AsyncClient, ctx, db_session: AsyncSession):
    await client.post(
        "/api/v1/contractors",
        json={"name": "P1", "specialty": "plumbing"},
        headers=auth_headers(),
    )
    await client.post(
        "/api/v1/contractors",
        json={"name": "E1", "specialty": "electrical"},
        headers=auth_headers(),
    )
    r = await client.get("/api/v1/contractors?specialty=plumbing", headers=auth_headers())
    assert r.status_code == 200
    data = r.json()["data"]
    assert all(c["specialty"] == "plumbing" for c in data)


@pytest.mark.asyncio
async def test_list_contractors_search(client: AsyncClient, ctx, contractor):
    r = await client.get("/api/v1/contractors?search=Bob", headers=auth_headers())
    assert r.status_code == 200
    assert any("Bob" in c["name"] for c in r.json()["data"])

    r2 = await client.get("/api/v1/contractors?search=nobody123", headers=auth_headers())
    assert r2.status_code == 200
    assert r2.json()["data"] == []


# ── Get ────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_contractor(client: AsyncClient, ctx, contractor):
    cid = contractor["id"]
    r = await client.get(f"/api/v1/contractors/{cid}", headers=auth_headers())
    assert r.status_code == 200
    assert r.json()["id"] == cid
    assert r.json()["name"] == contractor["name"]


@pytest.mark.asyncio
async def test_get_contractor_not_found(client: AsyncClient, ctx):
    r = await client.get(
        "/api/v1/contractors/00000000-0000-0000-0000-000000000000",
        headers=auth_headers(),
    )
    assert r.status_code == 404


# ── Update ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_contractor(client: AsyncClient, ctx, contractor):
    cid = contractor["id"]
    r = await client.put(
        f"/api/v1/contractors/{cid}",
        json={"phone": "+256700000099", "notes": "Updated notes"},
        headers=auth_headers(),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["phone"] == "+256700000099"
    assert body["notes"] == "Updated notes"
    assert body["name"] == contractor["name"]  # unchanged


# ── Deactivate ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_deactivate_contractor(client: AsyncClient, ctx, contractor):
    cid = contractor["id"]
    r = await client.delete(f"/api/v1/contractors/{cid}", headers=auth_headers())
    assert r.status_code == 204

    # Verify soft-deleted (not returned in active-only list)
    list_r = await client.get("/api/v1/contractors?isActive=true", headers=auth_headers())
    ids = [c["id"] for c in list_r.json()["data"]]
    assert cid not in ids

    # Still visible when showing all
    all_r = await client.get("/api/v1/contractors", headers=auth_headers())
    all_ids = [c["id"] for c in all_r.json()["data"]]
    assert cid in all_ids
    matching = next(c for c in all_r.json()["data"] if c["id"] == cid)
    assert matching["isActive"] is False


# ── Assignment via contractor directory ────────────────────────────────────────

@pytest.mark.asyncio
async def test_assign_maintenance_with_contractor_id(
    client: AsyncClient, ctx, db_session: AsyncSession, contractor
):
    """ISSUE_ASSIGNED with contractorId sets contractor_id and assigned_to from directory."""
    issue = await make_maintenance_issue(db_session, ctx["org"], ctx["prop"])

    r = await client.post(
        f"/api/v1/maintenance/{issue.id}/transition",
        json={"event": "ISSUE_ASSIGNED", "contractor_id": contractor["id"]},
        headers=auth_headers(),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["state"] == "assigned"
    assert body["contractorId"] == contractor["id"]
    assert body["assignedTo"] == contractor["name"]
    assert body["assignedAt"] is not None


@pytest.mark.asyncio
async def test_assign_maintenance_free_text_fallback(
    client: AsyncClient, ctx, db_session: AsyncSession
):
    """ISSUE_ASSIGNED with free-text assigned_to (no contractor_id) still works."""
    issue = await make_maintenance_issue(db_session, ctx["org"], ctx["prop"])

    r = await client.post(
        f"/api/v1/maintenance/{issue.id}/transition",
        json={"event": "ISSUE_ASSIGNED", "assigned_to": "Jane Handyman"},
        headers=auth_headers(),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["state"] == "assigned"
    assert body["assignedTo"] == "Jane Handyman"
    assert body["contractorId"] is None


@pytest.mark.asyncio
async def test_assign_with_inactive_contractor_rejected(
    client: AsyncClient, ctx, db_session: AsyncSession, contractor
):
    """Assigning an inactive contractor returns 422."""
    cid = contractor["id"]
    # Deactivate first
    await client.delete(f"/api/v1/contractors/{cid}", headers=auth_headers())

    issue = await make_maintenance_issue(db_session, ctx["org"], ctx["prop"])
    r = await client.post(
        f"/api/v1/maintenance/{issue.id}/transition",
        json={"event": "ISSUE_ASSIGNED", "contractor_id": cid},
        headers=auth_headers(),
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_assign_with_nonexistent_contractor_rejected(
    client: AsyncClient, ctx, db_session: AsyncSession
):
    """Assigning a non-existent contractor_id returns 422."""
    issue = await make_maintenance_issue(db_session, ctx["org"], ctx["prop"])
    r = await client.post(
        f"/api/v1/maintenance/{issue.id}/transition",
        json={"event": "ISSUE_ASSIGNED", "contractor_id": "00000000-0000-0000-0000-000000000000"},
        headers=auth_headers(),
    )
    assert r.status_code == 422
