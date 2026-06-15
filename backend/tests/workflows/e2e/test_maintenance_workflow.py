"""
E2E workflow tests — maintenance lifecycle.

These tests drive the FastAPI application end-to-end via the workflow engine.
Each test loads a YAML definition and executes it through real API endpoints
against the in-memory test database.  No business logic is bypassed.

Run with:
    pytest tests/workflows/e2e/test_maintenance_workflow.py -v

Or the full workflow suite:
    pytest tests/workflows/ -v
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

import tests.workflows  # noqa: F401 — self-registers all action modules
from tests.workflows.engine import WorkflowRunner, WORKFLOWS_DIR
from tests.workflows.engine.exceptions import WorkflowAssertionError


# ── Full lifecycle ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_maintenance_lifecycle(client: AsyncClient, tmp_path):
    """
    Runs the complete maintenance lifecycle workflow:
      property created → contractor created → issue reported →
      assigned → in_progress → resolved → closed.

    Asserts state at each transition and verifies the final state via
    a fresh GET request to the maintenance endpoint.
    """
    runner = WorkflowRunner(client, debug=False, snapshot_dir=tmp_path)
    ctx = await runner.run(WORKFLOWS_DIR / "maintenance_lifecycle.yaml")

    # Post-run assertions on the final context
    assert ctx.get("issue_final.state") == "closed"
    assert ctx.get("issue_final.contractorId") == ctx.get("contractor.id")
    assert ctx.get("issue_final.resolvedAt") is not None
    assert ctx.get("issue_final.closedAt") is not None

    print("\n" + runner.summary())


# ── Contractor assignment + cancellation ───────────────────────────────────────

@pytest.mark.asyncio
async def test_contractor_assignment_and_cancellation(client: AsyncClient, tmp_path):
    """
    Assigns a contractor to an issue then cancels the issue.
    Verifies the cancellation state is set correctly.
    """
    runner = WorkflowRunner(client, debug=False, snapshot_dir=tmp_path)
    ctx = await runner.run(WORKFLOWS_DIR / "contractor_assignment.yaml")

    assert ctx.get("issue_cancelled.state") == "cancelled"


# ── Invalid transitions ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_invalid_transition_raises_step_error(client: AsyncClient, tmp_path):
    """
    Attempting to transition a 'reported' issue directly to 'resolved'
    (skipping 'assigned' → 'in_progress') must be rejected by the API.
    The StepError surfaces the API's 422/409 response.
    """
    from tests.workflows.engine.exceptions import StepError
    from tests.workflows.engine import WorkflowRunner
    from tests.workflows.engine.client_factory import ClientFactory
    from tests.workflows.actions import maintenance  # noqa: F401

    factory = ClientFactory(client)
    mgr = factory.for_role("manager")

    # Create a property and report an issue directly.
    prop_resp = await mgr.post("/api/v1/properties", json={
        "name": "Invalid Transition Test",
        "type": "flat",
        "status": "active",
        "address": {
            "line1": "1 Test Lane", "city": "Kampala",
            "state": "Central", "postcode": "00256", "country": "UG",
        },
        "rules": {
            "gracePeriodDays": 5, "lateFeeType": "flat", "lateFeeValue": 50000,
            "depositMonths": 1, "noticePeriodDays": 30, "allowSubletting": False,
            "allowPets": False, "allowSmoking": False, "rentDayOfMonth": 1,
            "billingCurrency": "UGX", "maintenanceWindowHours": 24,
        },
        "images": [], "tags": [], "amenities": [], "isSingleUnit": False,
    })
    assert prop_resp.status_code in (200, 201)
    property_id = prop_resp.json()["id"]

    issue_resp = await mgr.post("/api/v1/maintenance", json={
        "propertyId": property_id,
        "title": "Test invalid transition",
        "description": "Should not skip to resolved",
        "category": "other",
        "priority": "low",
        "reportedBy": "Manager",
        "reportedById": "manager-1",
    })
    assert issue_resp.status_code in (200, 201)
    issue_id = issue_resp.json()["id"]

    # Try to jump from 'reported' directly to 'resolved' — must fail.
    bad_resp = await mgr.post(
        f"/api/v1/maintenance/{issue_id}/transition",
        json={"event": "ISSUE_RESOLVED"},
    )
    assert bad_resp.status_code in (400, 409, 422), (
        f"Expected rejection of invalid transition, got {bad_resp.status_code}: {bad_resp.text}"
    )


# ── Debug mode ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_workflow_debug_mode_runs_without_error(client: AsyncClient, tmp_path):
    """
    Smoke-test that debug=True produces output but does not affect correctness.
    Runs only the contractor_assignment workflow (faster than the full lifecycle).
    """
    runner = WorkflowRunner(client, debug=True, snapshot_dir=tmp_path)
    ctx = await runner.run(WORKFLOWS_DIR / "contractor_assignment.yaml")
    assert ctx.get("issue_cancelled.state") == "cancelled"
    assert len(runner.results) > 0


# ── Assertion system ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_assertion_step_raises_on_mismatch(client: AsyncClient):
    """
    Unit-test the assertion action in isolation: mismatched values must raise
    ``WorkflowAssertionError``, not a generic exception.
    """
    from tests.workflows.engine import ExecutionContext
    from tests.workflows.engine.client_factory import ClientFactory
    from tests.workflows.actions.assertions import assert_field

    factory = ClientFactory(client)
    mgr = factory.for_role("manager")
    ctx = ExecutionContext()

    with pytest.raises(WorkflowAssertionError):
        await assert_field(
            mgr,
            {"target": "reported", "equals": "closed"},
            ctx,
        )


@pytest.mark.asyncio
async def test_assertion_step_passes_on_match(client: AsyncClient):
    """assert_field must return None (no exception) when the value matches."""
    from tests.workflows.engine import ExecutionContext
    from tests.workflows.engine.client_factory import ClientFactory
    from tests.workflows.actions.assertions import assert_field

    factory = ClientFactory(client)
    mgr = factory.for_role("manager")
    ctx = ExecutionContext()

    result = await assert_field(
        mgr,
        {"target": "closed", "equals": "closed"},
        ctx,
    )
    assert result is None
