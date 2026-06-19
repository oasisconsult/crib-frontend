"""
Tests for the messages endpoints (tenant ↔ manager messaging).

Coverage:
  - List messages (empty)
  - Send message as manager
  - Send message as tenant
  - List returns sent messages
  - Mark message as read
  - Cross-org isolation
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers
from tests.factories import (
    make_lease,
    make_organisation,
    make_property,
    make_tenant,
    make_unit,
)


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def ctx(db_session: AsyncSession):
    """Shared org + property + unit + tenant + lease used across most tests."""
    import sqlalchemy as _sa
    org = await make_organisation(db_session)
    prop = await make_property(db_session, org)
    unit = await make_unit(db_session, prop)
    tenant = await make_tenant(db_session, org)
    lease = await make_lease(db_session, org, unit, tenant)
    await db_session.flush()
    # Upgrade org_dev (manager-1's org) to professional so tenant_messaging is available
    await db_session.execute(_sa.text("""
        INSERT INTO organisation_subscriptions
            (organisation_id, plan_id, status, billing_cycle, currency, current_period_start, auto_renew)
        SELECT o.id, sp.id, 'active', 'none', 'UGX', now(), true
        FROM organisations o, subscription_plans sp
        WHERE o.logto_org_id = 'org_dev' AND sp.slug = 'professional'
        ON CONFLICT (organisation_id) DO UPDATE
            SET plan_id = EXCLUDED.plan_id, status = 'active'
    """))
    await db_session.flush()
    return {"org": org, "prop": prop, "unit": unit, "tenant": tenant, "lease": lease}


# ── List messages (empty) ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_messages_empty(client: AsyncClient, ctx):
    lease_id = ctx["lease"].id
    r = await client.get(f"/api/v1/leases/{lease_id}/messages", headers=auth_headers())
    assert r.status_code == 200
    body = r.json()
    assert body["data"] == []
    assert body["total"] == 0


# ── Send message as manager ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_send_message_as_manager(client: AsyncClient, ctx):
    lease_id = ctx["lease"].id
    r = await client.post(
        f"/api/v1/leases/{lease_id}/messages",
        json={"content": "Your inspection is on Monday at 10am."},
        headers=auth_headers("manager-1"),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["content"] == "Your inspection is on Monday at 10am."
    assert body["senderRole"] == "manager"
    assert body["id"] is not None
    assert body["readAt"] is None


# ── Send message as tenant ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_send_message_as_tenant(client: AsyncClient, ctx):
    lease_id = ctx["lease"].id
    r = await client.post(
        f"/api/v1/leases/{lease_id}/messages",
        json={"content": "I will not be available Monday, can we reschedule?"},
        headers=auth_headers("tenant-1"),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["content"] == "I will not be available Monday, can we reschedule?"
    assert body["senderRole"] == "tenant"


# ── List returns created messages ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_messages_returns_sent(client: AsyncClient, ctx):
    lease_id = ctx["lease"].id
    hdrs = auth_headers("manager-1")

    await client.post(
        f"/api/v1/leases/{lease_id}/messages",
        json={"content": "First message"},
        headers=hdrs,
    )
    await client.post(
        f"/api/v1/leases/{lease_id}/messages",
        json={"content": "Second message"},
        headers=hdrs,
    )

    r = await client.get(f"/api/v1/leases/{lease_id}/messages", headers=hdrs)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 2
    assert len(body["data"]) == 2
    # Messages ordered ascending by created_at
    assert body["data"][0]["content"] == "First message"
    assert body["data"][1]["content"] == "Second message"


# ── Mark message as read ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_mark_message_read(client: AsyncClient, ctx):
    lease_id = ctx["lease"].id

    # Send a message
    send_r = await client.post(
        f"/api/v1/leases/{lease_id}/messages",
        json={"content": "Please confirm your attendance."},
        headers=auth_headers("manager-1"),
    )
    assert send_r.status_code == 201
    message_id = send_r.json()["id"]

    # Mark as read
    read_r = await client.patch(
        f"/api/v1/leases/{lease_id}/messages/{message_id}/read",
        headers=auth_headers("tenant-1"),
    )
    assert read_r.status_code == 200
    assert read_r.json()["readAt"] is not None


@pytest.mark.asyncio
async def test_mark_message_read_idempotent(client: AsyncClient, ctx):
    """Marking an already-read message returns 200 without error."""
    lease_id = ctx["lease"].id

    send_r = await client.post(
        f"/api/v1/leases/{lease_id}/messages",
        json={"content": "Hello"},
        headers=auth_headers("manager-1"),
    )
    message_id = send_r.json()["id"]

    hdrs = auth_headers("tenant-1")
    r1 = await client.patch(f"/api/v1/leases/{lease_id}/messages/{message_id}/read", headers=hdrs)
    r2 = await client.patch(f"/api/v1/leases/{lease_id}/messages/{message_id}/read", headers=hdrs)
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["readAt"] == r2.json()["readAt"]


# ── 404 for unknown message ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_mark_nonexistent_message_read(client: AsyncClient, ctx):
    import uuid
    lease_id = ctx["lease"].id
    r = await client.patch(
        f"/api/v1/leases/{lease_id}/messages/{uuid.uuid4()}/read",
        headers=auth_headers(),
    )
    assert r.status_code == 404


# ── Cross-org isolation ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_messages_isolated_by_org(client: AsyncClient, ctx, db_session):
    """Messages scoped to org_dev are not visible to the other org's lease."""
    lease_id = ctx["lease"].id

    await client.post(
        f"/api/v1/leases/{lease_id}/messages",
        json={"content": "Org-dev message"},
        headers=auth_headers("manager-1"),
    )

    # Create a second org + lease with a different logto_org_id
    other_org = await make_organisation(db_session, logto_org_id="org_other_msgs")
    other_prop = await make_property(db_session, other_org)
    other_unit = await make_unit(db_session, other_prop)
    other_tenant = await make_tenant(db_session, other_org)
    other_lease = await make_lease(db_session, other_org, other_unit, other_tenant)
    await db_session.flush()

    # manager-1 belongs to org_dev; listing messages for other_lease should return 0
    r = await client.get(
        f"/api/v1/leases/{other_lease.id}/messages",
        headers=auth_headers("manager-1"),
    )
    assert r.status_code == 200
    assert r.json()["total"] == 0
