"""
Sprint K — Inspector Full Lifecycle with Notifications.

End-to-end test covering:
  1. Create inspector contractor (isInspector=true, email set)
  2. Create inspection with 5-item checklist
  3. Assign inspector → DB: inspector_token set, Notification queued
  4. Resend inspector invite → DB: token rotated, new Notification queued
  5. Old token returns 404 (invalidated by resend)
  6. Inspector accesses portal via NEW token (no auth)
  7. Inspector submits full checklist + summary
  8. State auto-advances: scheduled → in_progress → completed
  9. Manager approves → state = approved
 10. Re-submission on expired/used token is rejected

Run with:
    pytest tests/workflows/e2e/test_sprint_k_inspector_full_lifecycle.py -v
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
async def test_sprint_k_inspector_full_lifecycle(
    client: AsyncClient,
    db_session: AsyncSession,
    tmp_path,
):
    """
    Full inspector lifecycle including invitation delivery and resend.

    YAML-driven:  property → contractor → inspection → assign → resend
    Python-driven: DB assertions on token rotation, notification records,
                   portal submit, state machine, approval, rejection of
                   re-submission.
    """
    runner = WorkflowRunner(client, debug=False, snapshot_dir=tmp_path)
    ctx = await runner.run(WORKFLOWS_DIR / "sprint_k_inspector_full_lifecycle.yaml")

    # ── Basic YAML-driven assertions ──────────────────────────────────────────

    assert ctx.get("property.id") is not None

    inspector_id = ctx.get("inspector.id")
    assert inspector_id is not None
    assert ctx.get("inspector.isInspector") is True
    assert ctx.get("inspector.isActive") is True
    assert ctx.get("inspector.name") == "Aisha Nakato (Inspector)"

    inspection_id = ctx.get("inspection.id")
    assert inspection_id is not None
    assert ctx.get("inspection.state") == "scheduled"
    assert ctx.get("inspection.type") == "move_in"
    assert isinstance(ctx.get("inspection.checklist"), list)
    assert len(ctx.get("inspection.checklist")) == 5, "Expected 5 checklist items"

    # After assign
    assert ctx.get("after_assign.inspectorContractorId") is not None
    assert ctx.get("after_assign.inspectorName") == "Aisha Nakato (Inspector)"
    assert ctx.get("after_assign.inspectorSubmittedAt") is None

    # After resend
    assert ctx.get("after_resend.inspectorContractorId") is not None
    assert ctx.get("after_resend.inspectorName") == "Aisha Nakato (Inspector)"
    assert ctx.get("after_resend.state") == "scheduled"

    # ── DB: fetch inspection row ──────────────────────────────────────────────

    from app.models.inspection import Inspection
    from app.models.notification import Notification

    insp_result = await db_session.execute(
        select(Inspection).where(Inspection.id == inspection_id)
    )
    insp = insp_result.scalar_one()

    # Token must be set after assign/resend
    token_after_resend = insp.inspector_token
    assert token_after_resend is not None, "inspector_token must be set"
    assert insp.inspector_token_expires_at is not None, "inspector_token_expires_at must be set"

    # ── DB: notification records created ─────────────────────────────────────
    # assign_inspector creates up to 2 notifications (email + whatsapp)
    # resend_inspector_invite creates up to 2 more
    # We expect at least 2 email notifications (trigger=inspector_invite)

    notif_result = await db_session.execute(
        select(Notification).where(
            Notification.trigger == "inspector_invite",
            Notification.recipient_email == "aisha.nakato.inspector@workflow.example.com",
        )
    )
    invite_notifs = notif_result.scalars().all()
    assert len(invite_notifs) >= 2, (
        f"Expected >=2 inspector_invite email notifications (assign + resend), "
        f"got {len(invite_notifs)}"
    )
    for notif in invite_notifs:
        assert notif.channel == "email"
        assert notif.state == "queued", f"Notification state should be queued, got {notif.state}"
        assert notif.recipient_name == "Aisha Nakato (Inspector)"
        assert "inspect/portal/" in notif.body, "Email body must contain portal link"

    # WhatsApp notifications also expected (contractor has a phone)
    wa_result = await db_session.execute(
        select(Notification).where(
            Notification.trigger == "inspector_invite",
            Notification.channel == "whatsapp",
        )
    )
    wa_notifs = wa_result.scalars().all()
    assert len(wa_notifs) >= 2, (
        f"Expected >=2 WhatsApp inspector_invite notifications, got {len(wa_notifs)}"
    )
    for wa in wa_notifs:
        assert "inspect/portal/" in wa.body, "WhatsApp body must contain portal link"

    # Each resend generates a fresh token — the notifications should contain
    # the latest portal URL. Sort by queued_at and check the last one.
    email_notifs_sorted = sorted(invite_notifs, key=lambda n: n.queued_at)
    latest_email = email_notifs_sorted[-1]
    assert token_after_resend in latest_email.body, (
        "Latest invite email must contain the current (resent) token"
    )

    # ── Token rotation: the token in the latest notification body is the resent token ──
    # (Sprint J stored the token from assign; we now have a different resent token)
    # Verify the OLD token (first notification body) differs from the new one.
    first_email = email_notifs_sorted[0]
    # Extract the token from the body URL by finding "inspect/portal/" prefix
    def _extract_token(body: str) -> str:
        marker = "inspect/portal/"
        start = body.find(marker)
        if start == -1:
            return ""
        start += len(marker)
        end = body.find("\n", start)
        return body[start:end].strip() if end != -1 else body[start:].strip()

    first_token = _extract_token(first_email.body)
    resent_token = _extract_token(latest_email.body)
    assert first_token != resent_token, (
        "Token must rotate on resend — first and resent tokens must differ"
    )
    assert resent_token == token_after_resend, (
        "Resent token in email must match current inspector_token in DB"
    )

    # ── Old token is invalidated (returns 404) ────────────────────────────────

    old_token_resp = await client.get(
        f"/api/v1/inspections/portal/{first_token}",
        headers={},
    )
    assert old_token_resp.status_code == 404, (
        f"Old token should return 404 after resend, got {old_token_resp.status_code}"
    )

    # ── Inspector portal GET with the NEW (resent) token ─────────────────────

    portal_get_resp = await client.get(
        f"/api/v1/inspections/portal/{token_after_resend}",
        headers={},  # no auth
    )
    assert portal_get_resp.status_code == 200, (
        f"Portal GET with resent token failed: {portal_get_resp.status_code} {portal_get_resp.text}"
    )
    portal_data = portal_get_resp.json()
    assert portal_data["id"] == inspection_id
    assert portal_data["state"] == "scheduled"
    assert portal_data["inspectorName"] == "Aisha Nakato (Inspector)"
    checklist_items = portal_data.get("checklist", [])
    assert len(checklist_items) == 5, f"Expected 5 checklist items in portal, got {len(checklist_items)}"

    # ── Inspector submits inspection via portal (no auth) ─────────────────────

    submit_payload = {
        "checklist": [
            {
                "id": "sk-001",
                "area": "Living Room",
                "description": "Walls, ceiling, floors — cracks, damp, damage",
                "condition": "good",
                "notes": "Freshly painted. Minor scuff near door frame.",
                "photoUrls": [],
                "required": True,
            },
            {
                "id": "sk-002",
                "area": "Kitchen",
                "description": "Fixtures, appliances, sink, drainage",
                "condition": "excellent",
                "notes": "New gas cooker installed. Drainage clear.",
                "photoUrls": [],
                "required": True,
            },
            {
                "id": "sk-003",
                "area": "Bathroom",
                "description": "Toilet, shower, water pressure, mould",
                "condition": "fair",
                "notes": "Slight discolouration on grout. Recommend re-grouting within 3 months.",
                "photoUrls": [],
                "required": True,
            },
            {
                "id": "sk-004",
                "area": "Bedroom",
                "description": "Walls, windows, floor, storage",
                "condition": "good",
                "notes": "Wardrobe door hinge slightly loose. Otherwise good.",
                "photoUrls": [],
                "required": True,
            },
            {
                "id": "sk-005",
                "area": "Compound & Entry",
                "description": "Gate, pathway, exterior lighting",
                "condition": "excellent",
                "notes": "Well maintained. Security light functional.",
                "photoUrls": [],
                "required": False,
            },
        ],
        "overallCondition": "good",
        "summary": "Property is move-in ready. Minor cosmetic items noted in bathroom and bedroom.",
        "recommendations": "Re-grout bathroom tiles within 3 months. Tighten bedroom wardrobe hinge.",
        "photoUrls": [],
    }

    submit_resp = await client.post(
        f"/api/v1/inspections/portal/{token_after_resend}",
        json=submit_payload,
        headers={},
    )
    assert submit_resp.status_code == 200, (
        f"Inspector submit failed: {submit_resp.status_code} {submit_resp.text}"
    )
    submitted = submit_resp.json()

    # State auto-advances: scheduled → in_progress → completed
    assert submitted["state"] == "completed", (
        f"Expected state=completed after submit, got {submitted['state']}"
    )
    assert submitted["inspectorSubmittedAt"] is not None, (
        "inspectorSubmittedAt must be set after submission"
    )
    assert submitted["overallCondition"] == "good"
    assert "move-in ready" in submitted["summary"]

    # Per-item conditions preserved
    submitted_checklist = submitted.get("checklist", [])
    assert len(submitted_checklist) == 5
    bathroom = next((i for i in submitted_checklist if i.get("area") == "Bathroom"), None)
    assert bathroom is not None
    assert bathroom.get("condition") == "fair"
    kitchen = next((i for i in submitted_checklist if i.get("area") == "Kitchen"), None)
    assert kitchen is not None
    assert kitchen.get("condition") == "excellent"

    # ── Manager approves ──────────────────────────────────────────────────────

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
        f"Expected state=approved, got {approved['state']}"
    )

    # ── Re-submission is rejected after approval ──────────────────────────────

    resubmit_resp = await client.post(
        f"/api/v1/inspections/portal/{token_after_resend}",
        json={**submit_payload, "overallCondition": "poor"},
        headers={},
    )
    assert resubmit_resp.status_code in (400, 409, 410, 422), (
        f"Re-submission after approval should be rejected, got {resubmit_resp.status_code}"
    )

    print("\n" + runner.summary())
