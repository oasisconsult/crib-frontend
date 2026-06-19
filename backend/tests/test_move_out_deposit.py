"""
Tests for Sprint 2.4 (move-out inspection) and Sprint 2.5 (security deposit management).

Coverage:
  1. Move-out inspection auto-copies checklist from completed move-in baseline
  2. Move-out inspection standalone (no baseline) does not auto-populate checklist
  3. Get deposit for a lease
  4. Return deposit in full → status becomes fully_returned
  5. Return deposit with deductions → status partially_returned, net correct
  6. Return amount exceeding held → 422
  7. Move-out inspection response includes baselineInspectionId
  8. Return deposit with moveOutInspectionId → stored and returned
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers
from tests.factories import (
    make_deposit,
    make_inspection,
    make_lease,
    make_property,
    make_tenant,
    make_unit,
)


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(autouse=True)
async def professional_plan(db_session: AsyncSession):
    """Upgrade dev org to professional so inspection_reports/esignature features are available."""
    import sqlalchemy as _sa
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


@pytest_asyncio.fixture
async def org(dev_org):
    """Use the pre-seeded dev org so auth tokens match."""
    return dev_org


@pytest_asyncio.fixture
async def prop(db_session: AsyncSession, org):
    return await make_property(db_session, org)


@pytest_asyncio.fixture
async def unit(db_session: AsyncSession, prop):
    return await make_unit(db_session, prop)


@pytest_asyncio.fixture
async def tenant(db_session: AsyncSession, org):
    from app.models.tenant import OnboardingState, TenantStatus
    return await make_tenant(
        db_session, org,
        status=TenantStatus.active,
        onboarding_state=OnboardingState.approved,
    )


@pytest_asyncio.fixture
async def active_lease(db_session: AsyncSession, org, unit, tenant):
    """Active lease with a pre-funded deposit."""
    from datetime import date
    from dateutil.relativedelta import relativedelta
    from app.models.lease import LeaseStatus

    lease_start = date.today().replace(day=1) + relativedelta(months=1)
    lease_end = lease_start + relativedelta(months=11, day=31)
    lease = await make_lease(
        db_session, org, unit, tenant,
        status=LeaseStatus.active,
        start_date=lease_start,
        end_date=lease_end,
        monthly_rent=500_000,
        deposit_amount=500_000,
    )
    await make_deposit(db_session, org, lease, amount_held=500_000)
    await db_session.flush()
    return lease


@pytest_asyncio.fixture
async def completed_move_in(db_session: AsyncSession, org, prop, unit, active_lease):
    """A completed move-in inspection linked to the active lease."""
    from app.models.inspection import InspectionState, InspectionType
    checklist = [
        {
            "id": "item-1",
            "area": "Kitchen",
            "description": "Check sink",
            "condition": "good",
            "notes": "No issues",
            "photo_urls": [],
            "required": True,
        },
        {
            "id": "item-2",
            "area": "Bedroom",
            "description": "Check walls",
            "condition": "excellent",
            "notes": "Freshly painted",
            "photo_urls": [],
            "required": True,
        },
    ]
    insp = await make_inspection(
        db_session, org, prop,
        unit_id=unit.id,
        lease_id=active_lease.id,
        type=InspectionType.move_in,
        state=InspectionState.completed,
        checklist=checklist,
    )
    await db_session.flush()
    return insp


# ── Move-out inspection tests ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_move_out_inspection_copies_checklist(
    client: AsyncClient, active_lease, completed_move_in, prop, unit
):
    """Creating a move-out inspection auto-copies checklist from the completed move-in baseline."""
    resp = await client.post(
        "/api/v1/inspections",
        json={
            "property_id": str(prop.id),
            "unit_id": str(unit.id),
            "lease_id": str(active_lease.id),
            "type": "move_out",
            "scheduled_date": "2026-12-31",
            "inspector_name": "Jane Inspector",
            # No checklist provided — should be auto-copied
        },
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()

    # Should have baseline_inspection_id set
    assert body["baselineInspectionId"] == str(completed_move_in.id)

    # Checklist should be copied from move-in with move_in_condition preserved
    assert len(body["checklist"]) == 2
    kitchen = next(item for item in body["checklist"] if item["area"] == "Kitchen")
    assert kitchen["move_in_condition"] == "good"
    assert kitchen["condition"] is None  # cleared for fresh assessment
    assert kitchen["notes"] is None      # cleared

    bedroom = next(item for item in body["checklist"] if item["area"] == "Bedroom")
    assert bedroom["move_in_condition"] == "excellent"


@pytest.mark.asyncio
async def test_move_out_inspection_standalone(
    client: AsyncClient, active_lease, prop, unit
):
    """Move-out with no move-in baseline does not auto-populate checklist."""
    resp = await client.post(
        "/api/v1/inspections",
        json={
            "property_id": str(prop.id),
            "unit_id": str(unit.id),
            "lease_id": str(active_lease.id),
            "type": "move_out",
            "scheduled_date": "2026-12-31",
            "inspector_name": "Jane Inspector",
        },
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    # No baseline → no baselineInspectionId, empty checklist
    assert body["baselineInspectionId"] is None
    assert body["checklist"] == []


@pytest.mark.asyncio
async def test_move_out_baseline_inspection_id_in_response(
    client: AsyncClient, active_lease, completed_move_in, prop, unit
):
    """The move-out inspection response includes baselineInspectionId as a string UUID."""
    resp = await client.post(
        "/api/v1/inspections",
        json={
            "property_id": str(prop.id),
            "unit_id": str(unit.id),
            "lease_id": str(active_lease.id),
            "type": "move_out",
            "scheduled_date": "2026-12-31",
        },
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert "baselineInspectionId" in body
    assert body["baselineInspectionId"] == str(completed_move_in.id)


# ── Deposit tests ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_deposit(client: AsyncClient, active_lease):
    """GET /leases/{id}/deposit returns the deposit details."""
    resp = await client.get(
        f"/api/v1/leases/{active_lease.id}/deposit",
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["amountHeld"] == 500_000.0
    assert body["status"] == "held"
    assert body["amountReturned"] == 0.0
    assert body["deductions"] == []


@pytest.mark.asyncio
async def test_return_deposit_full(client: AsyncClient, active_lease):
    """Returning the full amount sets status to fully_returned."""
    resp = await client.patch(
        f"/api/v1/leases/{active_lease.id}/deposit/return",
        json={"amountReturned": 500_000, "deductions": []},
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "fully_returned"
    assert body["amountReturned"] == 500_000.0


@pytest.mark.asyncio
async def test_return_deposit_with_deductions(client: AsyncClient, active_lease):
    """Partial return with deductions: status is partially_returned, deductions stored."""
    resp = await client.patch(
        f"/api/v1/leases/{active_lease.id}/deposit/return",
        json={
            "amountReturned": 350_000,
            "deductions": [
                {"reason": "Broken window", "amount": 100_000},
                {"reason": "Damaged carpet", "amount": 50_000},
            ],
            "notes": "Damage found during move-out",
        },
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "partially_returned"
    assert body["amountReturned"] == 350_000.0
    assert len(body["deductions"]) == 2
    reasons = {d["reason"] for d in body["deductions"]}
    assert "Broken window" in reasons
    assert "Damaged carpet" in reasons
    assert body["notes"] == "Damage found during move-out"


@pytest.mark.asyncio
async def test_return_deposit_exceeds_held(client: AsyncClient, active_lease):
    """Return amount + deductions exceeding amount_held → 422."""
    resp = await client.patch(
        f"/api/v1/leases/{active_lease.id}/deposit/return",
        json={
            "amountReturned": 400_000,
            "deductions": [{"reason": "Too much damage", "amount": 200_000}],
        },
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_deposit_move_out_inspection_link(
    client: AsyncClient, active_lease, completed_move_in, prop, unit
):
    """Return deposit with moveOutInspectionId → stored and returned in response."""
    # First create a move-out inspection
    insp_resp = await client.post(
        "/api/v1/inspections",
        json={
            "property_id": str(prop.id),
            "unit_id": str(unit.id),
            "lease_id": str(active_lease.id),
            "type": "move_out",
            "scheduled_date": "2026-12-31",
        },
        headers=auth_headers("manager-1"),
    )
    assert insp_resp.status_code == 201, insp_resp.text
    move_out_id = insp_resp.json()["id"]

    # Return deposit linked to the move-out inspection
    resp = await client.patch(
        f"/api/v1/leases/{active_lease.id}/deposit/return",
        json={
            "amountReturned": 400_000,
            "deductions": [{"reason": "Broken sink", "amount": 100_000}],
            "moveOutInspectionId": move_out_id,
        },
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["moveOutInspectionId"] == move_out_id
    assert body["status"] == "partially_returned"
