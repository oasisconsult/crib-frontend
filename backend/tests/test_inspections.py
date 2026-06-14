"""
Tests for the inspections and maintenance endpoints.

Coverage:
  Inspections: list, create, get, update, transition (full happy path), add photos
  Maintenance: list, create, get, update, transition (full happy path)
  State machine guards: invalid transition → 400
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers
from tests.factories import (
    make_inspection,
    make_maintenance_issue,
    make_organisation,
    make_property,
    make_unit,
)


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def ctx(dev_org, db_session: AsyncSession):
    """Shared org + property + unit used across most tests."""
    prop = await make_property(db_session, dev_org)
    unit = await make_unit(db_session, prop)
    await db_session.flush()
    return {"org": dev_org, "prop": prop, "unit": unit}


# ── Inspection list ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_inspections_empty(client: AsyncClient, ctx):  # ctx seeds the org via db_session
    r = await client.get("/api/v1/inspections", headers=auth_headers())
    assert r.status_code == 200
    body = r.json()
    assert body["data"] == []
    assert body["total"] == 0


@pytest.mark.asyncio
async def test_list_inspections_returns_own_org(client: AsyncClient, ctx, db_session):
    await make_inspection(db_session, ctx["org"], ctx["prop"])
    other_org = await make_organisation(db_session, logto_org_id="org_other_insp")
    other_prop = await make_property(db_session, other_org)
    await make_inspection(db_session, other_org, other_prop)
    await db_session.flush()

    r = await client.get("/api/v1/inspections", headers=auth_headers())
    assert r.status_code == 200
    assert r.json()["total"] == 1


# ── Inspection create ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_inspection(client: AsyncClient, ctx):
    payload = {
        "property_id": str(ctx["prop"].id),
        "unit_id": str(ctx["unit"].id),
        "type": "routine",
        "scheduled_date": "2026-05-10",
        "inspector_name": "John Doe",
        "checklist": [
            {
                "id": "cl-1",
                "area": "Kitchen",
                "description": "Check sink",
                "required": True,
                "photo_urls": [],
            }
        ],
    }
    r = await client.post("/api/v1/inspections", json=payload, headers=auth_headers())
    assert r.status_code == 201
    body = r.json()
    assert body["type"] == "routine"
    assert body["state"] == "scheduled"
    assert body["inspectorName"] == "John Doe"
    assert len(body["checklist"]) == 1


# ── Inspection get ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_inspection(client: AsyncClient, ctx, db_session):
    insp = await make_inspection(db_session, ctx["org"], ctx["prop"])

    r = await client.get(f"/api/v1/inspections/{insp.id}", headers=auth_headers())
    assert r.status_code == 200
    assert r.json()["id"] == str(insp.id)


@pytest.mark.asyncio
async def test_get_inspection_not_found(client: AsyncClient, ctx):  # ctx ensures org exists
    import uuid
    r = await client.get(f"/api/v1/inspections/{uuid.uuid4()}", headers=auth_headers())
    assert r.status_code == 404


# ── Inspection update ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_inspection(client: AsyncClient, ctx, db_session):
    insp = await make_inspection(db_session, ctx["org"], ctx["prop"])

    r = await client.put(
        f"/api/v1/inspections/{insp.id}",
        json={"summary": "All good", "overall_condition": "good"},
        headers=auth_headers(),
    )
    assert r.status_code == 200
    assert r.json()["summary"] == "All good"
    assert r.json()["overallCondition"] == "good"


# ── Inspection state machine ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_inspection_full_lifecycle(client: AsyncClient, ctx, db_session):
    insp = await make_inspection(db_session, ctx["org"], ctx["prop"])
    iid = str(insp.id)
    hdrs = auth_headers()

    # scheduled → in_progress
    r = await client.post(
        f"/api/v1/inspections/{iid}/transition",
        json={"event": "INSPECTION_STARTED"},
        headers=hdrs,
    )
    assert r.status_code == 200
    assert r.json()["state"] == "in_progress"
    assert r.json()["startedAt"] is not None

    # in_progress → completed
    r = await client.post(
        f"/api/v1/inspections/{iid}/transition",
        json={"event": "INSPECTION_COMPLETED"},
        headers=hdrs,
    )
    assert r.status_code == 200
    assert r.json()["state"] == "completed"
    assert r.json()["completedAt"] is not None

    # completed → approved
    r = await client.post(
        f"/api/v1/inspections/{iid}/transition",
        json={"event": "INSPECTION_APPROVED"},
        headers=hdrs,
    )
    assert r.status_code == 200
    assert r.json()["state"] == "approved"
    assert r.json()["approvedAt"] is not None


@pytest.mark.asyncio
async def test_inspection_invalid_transition(client: AsyncClient, ctx, db_session):
    insp = await make_inspection(db_session, ctx["org"], ctx["prop"])

    # Cannot go from scheduled → approved directly
    r = await client.post(
        f"/api/v1/inspections/{insp.id}/transition",
        json={"event": "INSPECTION_APPROVED"},
        headers=auth_headers(),
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_inspection_cancel_and_reschedule(client: AsyncClient, ctx, db_session):
    insp = await make_inspection(db_session, ctx["org"], ctx["prop"])
    iid = str(insp.id)
    hdrs = auth_headers()

    r = await client.post(
        f"/api/v1/inspections/{iid}/transition",
        json={"event": "INSPECTION_CANCELLED"},
        headers=hdrs,
    )
    assert r.status_code == 200
    assert r.json()["state"] == "cancelled"

    # Reschedule
    r = await client.post(
        f"/api/v1/inspections/{iid}/transition",
        json={"event": "INSPECTION_CREATED"},
        headers=hdrs,
    )
    assert r.status_code == 200
    assert r.json()["state"] == "scheduled"


# ── Inspection photos ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_add_inspection_photos(client: AsyncClient, ctx, db_session):
    insp = await make_inspection(db_session, ctx["org"], ctx["prop"])

    r = await client.patch(
        f"/api/v1/inspections/{insp.id}/photos",
        json={"urls": ["https://cdn.example.com/photo1.jpg", "https://cdn.example.com/photo2.jpg"]},
        headers=auth_headers(),
    )
    assert r.status_code == 200
    assert len(r.json()["photoUrls"]) == 2


# ── Maintenance list ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_maintenance_empty(client: AsyncClient, ctx):  # ctx ensures org exists
    r = await client.get("/api/v1/maintenance", headers=auth_headers())
    assert r.status_code == 200
    assert r.json()["data"] == []


@pytest.mark.asyncio
async def test_list_maintenance_with_filters(client: AsyncClient, ctx, db_session):
    await make_maintenance_issue(db_session, ctx["org"], ctx["prop"], priority="high")
    await make_maintenance_issue(db_session, ctx["org"], ctx["prop"], priority="low")
    await db_session.flush()

    r = await client.get("/api/v1/maintenance?priority=high", headers=auth_headers())
    assert r.status_code == 200
    assert r.json()["total"] == 1
    assert r.json()["data"][0]["priority"] == "high"


# ── Maintenance create ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_maintenance_issue(client: AsyncClient, ctx):
    payload = {
        "property_id": str(ctx["prop"].id),
        "unit_id": str(ctx["unit"].id),
        "reported_by": "tenant",
        "reported_by_id": "dev_tenant1",
        "title": "Broken window latch",
        "description": "Window in bedroom cannot be secured",
        "category": "structural",
        "priority": "high",
        "currency": "UGX",
    }
    r = await client.post("/api/v1/maintenance", json=payload, headers=auth_headers())
    assert r.status_code == 201
    body = r.json()
    assert body["title"] == "Broken window latch"
    assert body["state"] == "reported"
    assert body["priority"] == "high"


# ── Maintenance get ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_maintenance_issue(client: AsyncClient, ctx, db_session):
    issue = await make_maintenance_issue(db_session, ctx["org"], ctx["prop"])

    r = await client.get(f"/api/v1/maintenance/{issue.id}", headers=auth_headers())
    assert r.status_code == 200
    assert r.json()["id"] == str(issue.id)


# ── Maintenance update ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_maintenance_issue(client: AsyncClient, ctx, db_session):
    issue = await make_maintenance_issue(db_session, ctx["org"], ctx["prop"])

    r = await client.put(
        f"/api/v1/maintenance/{issue.id}",
        json={"priority": "urgent", "estimated_cost": 150000},
        headers=auth_headers(),
    )
    assert r.status_code == 200
    assert r.json()["priority"] == "urgent"
    assert r.json()["estimatedCost"] == 150000.0


# ── Maintenance state machine ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_maintenance_full_lifecycle(client: AsyncClient, ctx, db_session):
    issue = await make_maintenance_issue(db_session, ctx["org"], ctx["prop"])
    iid = str(issue.id)
    hdrs = auth_headers()

    # reported → assigned
    r = await client.post(
        f"/api/v1/maintenance/{iid}/transition",
        json={"event": "ISSUE_ASSIGNED", "assigned_to": "Bob Plumber"},
        headers=hdrs,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["state"] == "assigned"
    assert body["assignedTo"] == "Bob Plumber"
    assert body["assignedAt"] is not None

    # assigned → in_progress
    r = await client.post(
        f"/api/v1/maintenance/{iid}/transition",
        json={"event": "ISSUE_STARTED"},
        headers=hdrs,
    )
    assert r.status_code == 200
    assert r.json()["state"] == "in_progress"
    assert r.json()["startedAt"] is not None

    # in_progress → resolved
    r = await client.post(
        f"/api/v1/maintenance/{iid}/transition",
        json={"event": "ISSUE_RESOLVED"},
        headers=hdrs,
    )
    assert r.status_code == 200
    assert r.json()["state"] == "resolved"
    assert r.json()["resolvedAt"] is not None

    # resolved → closed
    r = await client.post(
        f"/api/v1/maintenance/{iid}/transition",
        json={"event": "ISSUE_CLOSED"},
        headers=hdrs,
    )
    assert r.status_code == 200
    assert r.json()["state"] == "closed"
    assert r.json()["closedAt"] is not None


@pytest.mark.asyncio
async def test_maintenance_invalid_transition(client: AsyncClient, ctx, db_session):
    issue = await make_maintenance_issue(db_session, ctx["org"], ctx["prop"])

    # Cannot close from reported
    r = await client.post(
        f"/api/v1/maintenance/{issue.id}/transition",
        json={"event": "ISSUE_CLOSED"},
        headers=auth_headers(),
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_maintenance_cancel(client: AsyncClient, ctx, db_session):
    issue = await make_maintenance_issue(db_session, ctx["org"], ctx["prop"])

    r = await client.post(
        f"/api/v1/maintenance/{issue.id}/transition",
        json={"event": "ISSUE_CANCELLED"},
        headers=auth_headers(),
    )
    assert r.status_code == 200
    assert r.json()["state"] == "cancelled"


@pytest.mark.asyncio
async def test_maintenance_unknown_event(client: AsyncClient, ctx, db_session):
    issue = await make_maintenance_issue(db_session, ctx["org"], ctx["prop"])

    r = await client.post(
        f"/api/v1/maintenance/{issue.id}/transition",
        json={"event": "NOT_A_REAL_EVENT"},
        headers=auth_headers(),
    )
    assert r.status_code == 400


# ── Lease-scoped inspection filter ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_inspections_filter_by_lease_id(client, ctx, db_session):
    from tests.factories import make_tenant, make_lease

    tenant = await make_tenant(db_session, ctx["org"])
    lease_a = await make_lease(db_session, ctx["org"], ctx["unit"], tenant)
    lease_b = await make_lease(db_session, ctx["org"], ctx["unit"], tenant)
    await db_session.flush()

    await make_inspection(db_session, ctx["org"], ctx["prop"], lease_id=lease_a.id, type="move_in")
    await make_inspection(db_session, ctx["org"], ctx["prop"], lease_id=lease_b.id, type="move_out")
    await make_inspection(db_session, ctx["org"], ctx["prop"])
    await db_session.flush()

    r = await client.get(f"/api/v1/inspections?leaseId={lease_a.id}", headers=auth_headers())
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    assert body["data"][0]["leaseId"] == str(lease_a.id)
    assert body["data"][0]["type"] == "move_in"

    r = await client.get("/api/v1/inspections", headers=auth_headers())
    assert r.status_code == 200
    assert r.json()["total"] == 3


@pytest.mark.asyncio
async def test_create_move_in_inspection_for_lease(client, ctx, db_session):
    from tests.factories import make_tenant, make_lease

    tenant = await make_tenant(db_session, ctx["org"])
    lease = await make_lease(db_session, ctx["org"], ctx["unit"], tenant)
    await db_session.flush()

    payload = {
        "property_id": str(ctx["prop"].id),
        "unit_id": str(ctx["unit"].id),
        "lease_id": str(lease.id),
        "type": "move_in",
        "scheduled_date": "2026-07-01",
        "inspector_name": "Grace Namutebi",
        "checklist": [],
    }
    r = await client.post("/api/v1/inspections", json=payload, headers=auth_headers())
    assert r.status_code == 201
    body = r.json()
    assert body["type"] == "move_in"
    assert body["leaseId"] == str(lease.id)
    assert body["state"] == "scheduled"
    assert body["inspectorName"] == "Grace Namutebi"

    r2 = await client.get(f"/api/v1/inspections?leaseId={lease.id}", headers=auth_headers())
    assert r2.status_code == 200
    assert r2.json()["total"] == 1


# ── Public sign token endpoint ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_inspection_by_sign_token_not_found(client: AsyncClient):
    r = await client.get("/api/v1/inspections/sign/no-such-token")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_get_inspection_by_sign_token_expired(client: AsyncClient, ctx, db_session):
    from datetime import datetime, timedelta, timezone
    from app.models.inspection import Inspection, InspectionState, InspectionType

    insp = Inspection(
        organisation_id=ctx["org"].id,
        property_id=ctx["prop"].id,
        type=InspectionType.move_out,
        state=InspectionState.approved,
        scheduled_date=__import__("datetime").date(2026, 6, 1),
        checklist=[],
        photo_urls=[],
        video_urls=[],
        maintenance_issue_ids=[],
        sign_token="expired-tok-xyz",
        sign_token_expires_at=datetime.now(timezone.utc) - timedelta(days=1),
    )
    db_session.add(insp)
    await db_session.flush()

    r = await client.get("/api/v1/inspections/sign/expired-tok-xyz")
    assert r.status_code == 410


@pytest.mark.asyncio
async def test_get_inspection_by_sign_token_rewrites_photo_urls(client: AsyncClient, ctx, db_session):
    """Authenticated serve URLs in photo_urls are rewritten to serve-public URLs with sign_token."""
    import secrets
    from datetime import datetime, timedelta, timezone
    from app.models.inspection import Inspection, InspectionState, InspectionType

    token = secrets.token_urlsafe(32)
    serve_url = f"/api/v1/upload/serve/inspections/{ctx['prop'].id}/uuid/photo.jpg"
    insp = Inspection(
        organisation_id=ctx["org"].id,
        property_id=ctx["prop"].id,
        type=InspectionType.move_in,
        state=InspectionState.approved,
        scheduled_date=__import__("datetime").date(2026, 6, 1),
        checklist=[],
        photo_urls=[serve_url],
        video_urls=[],
        maintenance_issue_ids=[],
        sign_token=token,
        sign_token_expires_at=datetime.now(timezone.utc) + timedelta(days=14),
    )
    db_session.add(insp)
    await db_session.flush()

    r = await client.get(f"/api/v1/inspections/sign/{token}")
    assert r.status_code == 200
    body = r.json()
    assert len(body["photoUrls"]) == 1
    url = body["photoUrls"][0]
    assert "/upload/serve-public/" in url
    assert f"sign_token={token}" in url
    assert "/upload/serve/" not in url


@pytest.mark.asyncio
async def test_get_inspection_by_sign_token_rewrites_checklist_photo_urls(client: AsyncClient, ctx, db_session):
    """Authenticated serve URLs inside checklist items are also rewritten."""
    import secrets
    from datetime import datetime, timedelta, timezone
    from app.models.inspection import Inspection, InspectionState, InspectionType

    token = secrets.token_urlsafe(32)
    serve_url = f"/api/v1/upload/serve/inspections/{ctx['prop'].id}/uuid/checklist.jpg"
    insp = Inspection(
        organisation_id=ctx["org"].id,
        property_id=ctx["prop"].id,
        type=InspectionType.routine,
        state=InspectionState.approved,
        scheduled_date=__import__("datetime").date(2026, 6, 1),
        checklist=[{"id": "cl-1", "area": "Kitchen", "description": "Check sink", "photoUrls": [serve_url]}],
        photo_urls=[],
        video_urls=[],
        maintenance_issue_ids=[],
        sign_token=token,
        sign_token_expires_at=datetime.now(timezone.utc) + timedelta(days=14),
    )
    db_session.add(insp)
    await db_session.flush()

    r = await client.get(f"/api/v1/inspections/sign/{token}")
    assert r.status_code == 200
    body = r.json()
    assert len(body["checklist"]) == 1
    item_url = body["checklist"][0]["photoUrls"][0]
    assert "/upload/serve-public/" in item_url
    assert f"sign_token={token}" in item_url


@pytest.mark.asyncio
async def test_get_inspection_by_sign_token_non_serve_urls_unchanged(client: AsyncClient, ctx, db_session):
    """Non-serve URLs (CDN, local dev) pass through unchanged."""
    import secrets
    from datetime import datetime, timedelta, timezone
    from app.models.inspection import Inspection, InspectionState, InspectionType

    token = secrets.token_urlsafe(32)
    cdn_url = "https://cdn.example.com/inspections/photo.jpg"
    insp = Inspection(
        organisation_id=ctx["org"].id,
        property_id=ctx["prop"].id,
        type=InspectionType.routine,
        state=InspectionState.approved,
        scheduled_date=__import__("datetime").date(2026, 6, 1),
        checklist=[],
        photo_urls=[cdn_url],
        video_urls=[],
        maintenance_issue_ids=[],
        sign_token=token,
        sign_token_expires_at=datetime.now(timezone.utc) + timedelta(days=14),
    )
    db_session.add(insp)
    await db_session.flush()

    r = await client.get(f"/api/v1/inspections/sign/{token}")
    assert r.status_code == 200
    assert r.json()["photoUrls"][0] == cdn_url
