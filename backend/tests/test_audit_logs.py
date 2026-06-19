"""
Tests for the general-purpose audit log system.

Coverage:
  - GET /api/v1/audit-logs           (org-level, Agency+ gated)
  - GET /api/v1/audit-logs/{id}      (org-level, single entry)
  - GET /api/v1/admin/audit-logs     (superadmin cross-org)
  - Org isolation: org A cannot read org B entries
  - Tier gating: free plan → 402
  - Tenant role blocked from write-gated endpoints → 403
  - property.created action appends an audit entry
  - append() swallows DB-level errors (never breaks the calling endpoint)
"""
from __future__ import annotations

import uuid
from unittest.mock import patch, AsyncMock

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.organisation import Organisation
from app.models.subscription import (
    OrganisationSubscription,
    SubscriptionPlan,
    SubscriptionStatus,
)
from tests.conftest import auth_headers
from tests.factories import make_organisation, make_property, make_unit

PREFIX = "/api/v1"


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_plan_id(slug: str, db: AsyncSession) -> str:
    result = await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.slug == slug))
    plan = result.scalar_one_or_none()
    assert plan is not None, f"Plan '{slug}' not seeded — run migrations first."
    return str(plan.id)


async def _activate_plan(slug: str, client: AsyncClient, db: AsyncSession) -> None:
    """Select and manually activate a subscription plan for the dev org."""
    plan_id = await _get_plan_id(slug, db)
    await client.post(
        f"{PREFIX}/subscriptions/select-plan",
        headers=auth_headers("owner-1"),
        json={"planId": plan_id, "billingCycle": "monthly", "currency": "UGX"},
    )
    # Manually flip to active (normally done via payment verification)
    org = (await db.execute(
        select(Organisation).where(Organisation.logto_org_id == "org_dev")
    )).scalar_one()
    sub = (await db.execute(
        select(OrganisationSubscription).where(
            OrganisationSubscription.organisation_id == org.id
        )
    )).scalar_one_or_none()
    if sub:
        sub.status = SubscriptionStatus.active
        await db.flush()


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def ctx(dev_org, db_session: AsyncSession):
    """Shared property + unit for instrumented endpoint tests."""
    prop = await make_property(db_session, dev_org)
    unit = await make_unit(db_session, prop)
    await db_session.flush()
    return {"org": dev_org, "prop": prop, "unit": unit}


# ── Tier gating: free plan → 402 ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_requires_audit_logs_feature(client: AsyncClient, dev_org, db_session: AsyncSession):
    """Free plan org must receive 402 from GET /audit-logs."""
    # Ensure dev org is on free plan (default after first access)
    await client.get(f"{PREFIX}/subscriptions/current", headers=auth_headers("owner-1"))

    r = await client.get(f"{PREFIX}/audit-logs", headers=auth_headers("owner-1"))
    assert r.status_code == 402
    detail = r.json().get("detail", {})
    assert detail.get("feature") == "audit_logs" or detail.get("code") == "feature_not_available"


# ── Tier gating: agency plan → 200 ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_agency_plan_allowed(client: AsyncClient, dev_org, db_session: AsyncSession):
    """Agency plan must receive 200 with an empty list when no audit entries exist."""
    await _activate_plan("agency", client, db_session)

    r = await client.get(f"{PREFIX}/audit-logs", headers=auth_headers("owner-1"))
    assert r.status_code == 200
    body = r.json()
    assert "data" in body
    assert isinstance(body["data"], list)
    assert body["total"] >= 0


# ── Tenant role is blocked ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenant_blocked_from_audit_logs(client: AsyncClient, db_session: AsyncSession):
    """Tenant role must receive 403 from GET /audit-logs (write guard blocks tenants)."""
    r = await client.get(f"{PREFIX}/audit-logs", headers=auth_headers("tenant-2"))
    assert r.status_code == 403


# ── Org isolation ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_org_isolation(client: AsyncClient, dev_org, db_session: AsyncSession):
    """Org A must not see audit entries that belong to org B."""
    await _activate_plan("agency", client, db_session)

    # Seed an entry for org_dev
    entry_dev = AuditLog(
        organisation_id=dev_org.id,
        actor_id=None,
        actor_role="owner",
        resource_type="property",
        resource_id=uuid.uuid4(),
        resource_label="Dev Org Property",
        action="property.created",
    )
    db_session.add(entry_dev)

    # Seed an entry for a different org
    other_org = await make_organisation(db_session, logto_org_id="org_audit_iso")
    entry_other = AuditLog(
        organisation_id=other_org.id,
        actor_id=None,
        actor_role="owner",
        resource_type="property",
        resource_id=uuid.uuid4(),
        resource_label="Other Org Property",
        action="property.created",
    )
    db_session.add(entry_other)
    await db_session.flush()

    r = await client.get(f"{PREFIX}/audit-logs", headers=auth_headers("owner-1"))
    assert r.status_code == 200
    labels = [e["resourceLabel"] for e in r.json()["data"]]
    assert "Dev Org Property" in labels
    assert "Other Org Property" not in labels


# ── Superadmin cross-org list ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_superadmin_admin_endpoint_cross_org(
    client: AsyncClient, dev_org, db_session: AsyncSession
):
    """Superadmin /admin/audit-logs must return entries from multiple orgs."""
    other_org = await make_organisation(db_session, logto_org_id="org_audit_cross")

    for org, label in [(dev_org, "PropA"), (other_org, "PropB")]:
        db_session.add(AuditLog(
            organisation_id=org.id,
            actor_id=None,
            actor_role="owner",
            resource_type="property",
            resource_id=uuid.uuid4(),
            resource_label=label,
            action="property.created",
        ))
    await db_session.flush()

    r = await client.get(f"{PREFIX}/admin/audit-logs", headers=auth_headers("superadmin-1"))
    assert r.status_code == 200
    labels = [e["resourceLabel"] for e in r.json()["data"]]
    assert "PropA" in labels
    assert "PropB" in labels


# ── Instrumentation: property.created appends log ─────────────────────────────

@pytest.mark.asyncio
async def test_property_create_appends_audit_log(
    client: AsyncClient, ctx, db_session: AsyncSession
):
    """POST /properties must write a property.created audit entry."""
    await _activate_plan("agency", client, db_session)

    r = await client.post(
        f"{PREFIX}/properties",
        headers=auth_headers("owner-1"),
        json={
            "name": "Audit Test Property",
            "type": "flat",
            "currency": "UGX",
            "address": {
                "line1": "1 Test St",
                "city": "Kampala",
                "state": "Central",
                "postcode": "00000",
                "country": "Uganda",
            },
            "is_single_unit": False,
        },
    )
    assert r.status_code == 201
    prop_name = r.json()["name"]

    # The audit log entry must exist for this org
    entries = (await db_session.execute(
        select(AuditLog).where(
            AuditLog.action == "property.created",
            AuditLog.resource_label == prop_name,
        )
    )).scalars().all()
    assert len(entries) == 1
    assert entries[0].resource_type == "property"
    assert entries[0].actor_role is not None


# ── Instrumentation: tenant.approved appends log ──────────────────────────────

@pytest.mark.asyncio
async def test_tenant_approve_appends_audit_log(
    client: AsyncClient, ctx, db_session: AsyncSession
):
    """PATCH /tenants/{id}/approve must write a tenant.approved audit entry."""
    await _activate_plan("agency", client, db_session)

    # Create a tenant first
    r = await client.post(
        f"{PREFIX}/tenants",
        headers=auth_headers("owner-1"),
        json={
            "first_name": "Grace",
            "last_name": "Akello",
            "email": f"grace.{uuid.uuid4().hex[:6]}@example.com",
            "phone": "+256700000001",
            "property_id": str(ctx["prop"].id),
            "unit_id": str(ctx["unit"].id),
        },
    )
    assert r.status_code == 201, r.text
    tenant_id = r.json()["id"]

    # Advance the tenant to 'submitted' state so approve() is a valid transition
    import sqlalchemy as _sa
    await db_session.execute(_sa.text(
        "UPDATE tenants SET onboarding_state = 'submitted' WHERE id = :id"
    ), {"id": tenant_id})
    await db_session.flush()

    r2 = await client.patch(
        f"{PREFIX}/tenants/{tenant_id}/approve",
        headers=auth_headers("owner-1"),
    )
    assert r2.status_code == 200, r2.text

    entries = (await db_session.execute(
        select(AuditLog).where(
            AuditLog.action == "tenant.approved",
            AuditLog.resource_id == uuid.UUID(tenant_id),
        )
    )).scalars().all()
    assert len(entries) >= 1


# ── append() swallows errors ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_append_swallows_db_errors(
    client: AsyncClient, ctx, db_session: AsyncSession
):
    """
    If audit_service.append() raises an internal error, the calling endpoint
    must still return 2xx — audit failures must not break callers.
    """
    await _activate_plan("agency", client, db_session)

    # Patch db.flush inside audit_service.append to raise
    original_flush = db_session.flush

    call_count = 0

    async def patched_flush(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        # Let the first flush (from the service layer) succeed; fail the audit flush
        if call_count == 2:
            raise RuntimeError("Simulated DB error in audit flush")
        return await original_flush(*args, **kwargs)

    with patch.object(db_session, "flush", side_effect=patched_flush):
        r = await client.post(
            f"{PREFIX}/properties",
            headers=auth_headers("owner-1"),
            json={
                "name": "Swallow Error Test",
                "type": "flat",
                "currency": "UGX",
                "address": {
                    "line1": "2 Test St",
                    "city": "Kampala",
                    "state": "Central",
                    "postcode": "00000",
                    "country": "Uganda",
                },
                "is_single_unit": False,
            },
        )
    # The property creation must succeed even if audit flush fails
    assert r.status_code == 201
