"""
Sprint J — Inspector Onboarding.

Runs the YAML workflow:
  create property → create inspector contractor → create inspection →
  assign inspector → verify token set → inspector GET portal →
  inspector POST submit checklist → verify state=completed →
  manager transition to approved.

Run with:
    pytest tests/workflows/e2e/test_sprint_j_inspector_onboarding.py -v
"""
from __future__ import annotations

from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import tests.workflows  # noqa: F401 — registers all action handlers
from tests.workflows.engine import WorkflowRunner

WORKFLOWS_DIR = Path(__file__).parents[2] / "workflows" / "definitions"


@pytest.mark.asyncio
async def test_sprint_j_inspector_onboarding(client: AsyncClient, db_session: AsyncSession, tmp_path):
    """
    Full inspector onboarding lifecycle:
      - Create inspector contractor (isInspector=true)
      - Create routine inspection with checklist
      - Assign inspector → verify inspector_contractor_id and inspector_name set
      - Fetch inspector_token from DB (not exposed by API for security)
      - Inspector retrieves portal via token (unauthenticated)
      - Inspector submits checklist findings via token
      - Verify inspection state auto-advances to 'completed'
      - Manager approves via transition endpoint
    """
    runner = WorkflowRunner(client, debug=False, snapshot_dir=tmp_path)
    ctx = await runner.run(WORKFLOWS_DIR / "sprint_j_inspector_onboarding.yaml")

    # ── YAML-driven assertions ────────────────────────────────────────────────

    # Property created
    assert ctx.get("property.id") is not None

    # Inspector contractor created with is_inspector flag
    inspector_id = ctx.get("inspector.id")
    assert inspector_id is not None
    assert ctx.get("inspector.isInspector") is True
    assert ctx.get("inspector.name") == "Emmanuel Okwir (Inspector)"

    # Inspection created in scheduled state
    inspection_id = ctx.get("inspection.id")
    assert inspection_id is not None
    assert ctx.get("inspection.state") == "scheduled"
    assert ctx.get("inspection.type") == "routine"
    checklist = ctx.get("inspection.checklist")
    assert isinstance(checklist, list)
    assert len(checklist) == 4, f"Expected 4 checklist items, got {len(checklist)}"

    # Inspector assigned — contractor id linked, name set, not yet submitted
    assert ctx.get("assigned_inspection.inspectorContractorId") is not None
    assert ctx.get("assigned_inspection.inspectorName") == "Emmanuel Okwir (Inspector)"
    assert ctx.get("assigned_inspection.inspectorSubmittedAt") is None

    # State unchanged before submit
    assert ctx.get("inspection_with_token.state") == "scheduled"
    assert ctx.get("inspection_with_token.inspectorContractorId") is not None

    # ── Fetch inspector_token from DB (API doesn't expose it) ─────────────────

    from app.models.inspection import Inspection

    result = await db_session.execute(
        select(Inspection).where(Inspection.id == inspection_id)
    )
    insp = result.scalar_one()

    assert insp.inspector_token is not None, "inspector_token must be set after assign"
    assert insp.inspector_token_expires_at is not None, "inspector_token_expires_at must be set"
    token = insp.inspector_token

    # ── Inspector portal GET (no auth header) ─────────────────────────────────

    portal_get_resp = await client.get(
        f"/api/v1/inspections/portal/{token}",
        headers={},  # no X-Dev-User-Id, no Authorization
    )
    assert portal_get_resp.status_code == 200, (
        f"Inspector portal GET failed: {portal_get_resp.status_code} {portal_get_resp.text}"
    )
    portal_data = portal_get_resp.json()
    assert portal_data["id"] == inspection_id
    assert portal_data["state"] == "scheduled"
    assert portal_data["inspectorName"] == "Emmanuel Okwir (Inspector)"
    assert isinstance(portal_data.get("checklist"), list)
    assert len(portal_data["checklist"]) == 4

    # ── Inspector submits findings via portal (no auth) ───────────────────────

    submit_payload = {
        "checklist": [
            {
                "id": "jt-001",
                "area": "Living Room",
                "description": "Check walls and ceiling for cracks or damp",
                "condition": "good",
                "notes": "No visible cracks. Minor paint scuff on east wall.",
                "photoUrls": [],
                "required": True,
            },
            {
                "id": "jt-002",
                "area": "Kitchen",
                "description": "Inspect sink, taps and drainage",
                "condition": "good",
                "notes": "Drainage slightly slow — recommend clearing trap.",
                "photoUrls": [],
                "required": True,
            },
            {
                "id": "jt-003",
                "area": "Bathroom",
                "description": "Check toilet, shower and water pressure",
                "condition": "fair",
                "notes": "Water pressure lower than expected. Shower head mineral buildup.",
                "photoUrls": [],
                "required": True,
            },
            {
                "id": "jt-004",
                "area": "Electrical",
                "description": "Test all light switches and power sockets",
                "condition": "excellent",
                "notes": "All switches functional. RCD breaker tested.",
                "photoUrls": [],
                "required": False,
            },
        ],
        "overallCondition": "good",
        "summary": "Property is in good general condition. Minor maintenance items noted.",
        "recommendations": "Clear kitchen drain trap. Replace shower head.",
        "photoUrls": [],
    }

    portal_submit_resp = await client.post(
        f"/api/v1/inspections/portal/{token}",
        json=submit_payload,
        headers={},  # no auth
    )
    assert portal_submit_resp.status_code == 200, (
        f"Inspector portal submit failed: {portal_submit_resp.status_code} {portal_submit_resp.text}"
    )
    submitted = portal_submit_resp.json()

    # Verify auto-state-advance: scheduled → in_progress → completed
    assert submitted["state"] == "completed", (
        f"Expected state=completed after submit, got: {submitted['state']}"
    )
    assert submitted["inspectorSubmittedAt"] is not None, (
        "inspectorSubmittedAt must be set after submission"
    )
    assert submitted["overallCondition"] == "good"
    assert submitted["summary"] == "Property is in good general condition. Minor maintenance items noted."

    # Checklist items should be populated with conditions
    submitted_checklist = submitted.get("checklist", [])
    assert len(submitted_checklist) == 4
    bathroom_item = next(
        (i for i in submitted_checklist if i.get("area") == "Bathroom"), None
    )
    assert bathroom_item is not None
    assert bathroom_item.get("condition") == "fair"

    # ── Manager approves the completed inspection ─────────────────────────────

    approve_resp = await client.post(
        f"/api/v1/inspections/{inspection_id}/transition",
        json={"event": "INSPECTION_APPROVED"},
        headers={"X-Dev-User-Id": "manager-1"},
    )
    assert approve_resp.status_code == 200, (
        f"Approve transition failed: {approve_resp.status_code} {approve_resp.text}"
    )
    approved = approve_resp.json()
    assert approved["state"] == "approved", (
        f"Expected state=approved after manager approval, got: {approved['state']}"
    )

    # ── Portal token should now be invalidated (inspection completed/approved) ─
    # The portal may still be readable (no hard expiry on completion), but
    # re-submission should be rejected since state != scheduled/in_progress.
    resubmit_resp = await client.post(
        f"/api/v1/inspections/portal/{token}",
        json={**submit_payload, "overallCondition": "excellent"},
        headers={},
    )
    # Should be rejected — inspection already completed
    assert resubmit_resp.status_code in (400, 409, 410, 422), (
        f"Re-submission of completed inspection should fail, got: {resubmit_resp.status_code}"
    )

    print("\n" + runner.summary())
