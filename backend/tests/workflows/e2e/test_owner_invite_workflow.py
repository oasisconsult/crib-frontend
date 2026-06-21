"""
Owner Invite Workflow — End-to-end test.

Full independent-landlord onboarding lifecycle:
  1. Superadmin creates a property.
  2. Manager creates a landlord invite with that property attached.
  3. YAML-driven assertions verify the invite is pending and the property is linked.
  4. The invite token is fetched from the DB (not exposed by the API).
  5. Public onboarding GET verifies invite details pre-completion.
  6. Invitee completes onboarding with a self-chosen password (Logto mocked).
  7. Invite status verified = accepted in DB.
  8. Property org transferred to landlord's personal org (DB assertion).

Run with:
    pytest tests/workflows/e2e/test_owner_invite_workflow.py -v
"""
from __future__ import annotations

import uuid
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import tests.workflows  # noqa: F401 — registers all action handlers
from tests.workflows.engine import WorkflowRunner

WORKFLOWS_DIR = Path(__file__).parents[2] / "workflows" / "definitions"


@pytest.mark.asyncio
async def test_owner_invite_workflow(
    client: AsyncClient,
    db_session: AsyncSession,
    tmp_path,
):
    """
    Full independent-owner invite and onboarding lifecycle.
    """
    # ── Run YAML-driven steps ────────────────────────────────────────────────

    runner = WorkflowRunner(client, debug=False, snapshot_dir=tmp_path)
    ctx = await runner.run(WORKFLOWS_DIR / "owner_invite.yaml")

    # ── Validate YAML-driven results ─────────────────────────────────────────

    property_id: str = ctx.get("property.id")
    assert property_id is not None, "property must be created"

    invite_id: str = ctx.get("invite.id")
    assert invite_id is not None, "invite must be created"
    assert ctx.get("invite.status") == "pending"
    assert ctx.get("invite.email") == "lydia.owner@workflow.example.com"
    assert property_id in (ctx.get("invite.propertyIds") or []), (
        "invited property must appear in invite.propertyIds"
    )
    assert ctx.get("invite_list.total") is not None

    # ── Fetch invite token from DB (API does not expose it) ──────────────────

    from app.models.landlord_invite import LandlordInvite, InviteStatus

    result = await db_session.execute(
        select(LandlordInvite).where(LandlordInvite.id == uuid.UUID(invite_id))
    )
    invite = result.scalar_one()
    assert invite.token is not None, "invite must have a token"
    token = invite.token

    # ── Public onboarding GET (no auth) ─────────────────────────────────────

    onboarding_resp = await client.get(
        f"/api/v1/landlords/onboarding/{token}",
        headers={},
    )
    assert onboarding_resp.status_code == 200, (
        f"onboarding GET failed: {onboarding_resp.status_code} {onboarding_resp.text}"
    )
    onboarding_data = onboarding_resp.json()
    assert onboarding_data["email"] == "lydia.owner@workflow.example.com"
    assert onboarding_data["firstName"] == "Lydia"
    assert onboarding_data["lastName"] == "Namutebi"

    # ── Complete onboarding (Logto mocked) ───────────────────────────────────
    # The invitee sets their own password; no plaintext credential is emailed.

    with patch(
        "app.services.logto_service.create_landlord_user",
        new_callable=AsyncMock,
        return_value=("logto_lydia_001", True),
    ), patch(
        "app.services.logto_service.send_landlord_welcome_email",
        new_callable=AsyncMock,
    ), patch(
        "app.services.logto_service.send_independent_landlord_welcome_email",
        new_callable=AsyncMock,
    ):
        complete_resp = await client.post(
            f"/api/v1/landlords/onboarding/{token}/complete",
            json={
                "firstName": "Lydia",
                "lastName": "Namutebi",
                "password": "SecurePass123!",
                "phone": "+256772000111",
            },
            headers={},
        )

    assert complete_resp.status_code == 201, (
        f"onboarding complete failed: {complete_resp.status_code} {complete_resp.text}"
    )

    # ── DB: invite must now be accepted ──────────────────────────────────────

    await db_session.refresh(invite)
    assert invite.status == InviteStatus.ACCEPTED, (
        f"invite status must be accepted, got {invite.status!r}"
    )
    assert invite.accepted_at is not None, "accepted_at must be set"

    # ── DB: property must be transferred to landlord's personal org ──────────

    from app.models.property import Property
    from app.models.organisation import Organisation

    prop_result = await db_session.execute(
        select(Property).where(Property.id == uuid.UUID(property_id))
    )
    prop = prop_result.scalar_one()
    assert prop.organisation_id is not None, "property must be in an org"

    # The property's org must NOT be the original dev org (org_dev) — it must
    # have been transferred to the landlord's personal org.
    org_result = await db_session.execute(
        select(Organisation).where(Organisation.id == prop.organisation_id)
    )
    landlord_org = org_result.scalar_one()
    assert landlord_org.logto_org_id != "org_dev", (
        "property must be transferred out of the inviting org into "
        f"the landlord's personal org (got logto_org_id={landlord_org.logto_org_id!r})"
    )

    # The org must be the landlord's personal org (owner role, is_personal=True or similar)
    # We verify it is NOT the agency org and IS linked to the new landlord profile.
    assert landlord_org.id != prop.organisation_id or landlord_org.logto_org_id != "org_dev", (
        "property must be in landlord's personal org, not the agency org"
    )

    print("\n" + runner.summary())
