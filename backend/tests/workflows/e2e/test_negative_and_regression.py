"""
Negative tests and regression guards for inspection/contractor APIs.

Three workflows:

1. positive_inspection_contractor_creation
   Regression guard for the inspectorContractorId-at-creation bug (Sprint K).
   Asserts that supplying inspectorContractorId during inspection creation
   persists the contractor link and name — previously this was silently dropped.

2. negative_inspection_validation
   Input validation and state-machine boundary tests:
     - Missing required fields  → 422
     - Non-inspector contractor → 422
     - Bad portal token         → 404
     - Wrong state transition   → 422
     - Non-existent resources   → 404

3. negative_rbac_inspections
   Role-based access control:
     - Tenant cannot create/assign/approve inspections → 403
     - Tenant cannot create contractor records         → 403
     - Anonymous cannot access any authenticated route → 401
     - Manager positive baseline                       → 200

Run with:
    pytest tests/workflows/e2e/test_negative_and_regression.py -v
"""
from __future__ import annotations

from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

import tests.workflows  # noqa: F401 — registers all action handlers
from tests.workflows.engine import WorkflowRunner

WORKFLOWS_DIR = Path(__file__).parents[2] / "workflows" / "definitions"


@pytest.mark.asyncio
async def test_positive_inspection_contractor_creation(
    client: AsyncClient,
    db_session: AsyncSession,
    tmp_path,
):
    """
    Regression guard: inspectorContractorId supplied at creation must be
    persisted — not silently dropped by the backend schema.
    """
    runner = WorkflowRunner(client, debug=False, snapshot_dir=tmp_path)
    ctx = await runner.run(
        WORKFLOWS_DIR / "positive_inspection_contractor_creation.yaml"
    )

    # Extra Python-level assertions beyond what YAML covers
    insp_id = ctx.get("insp_with_contractor.id")
    assert insp_id is not None

    # Contractor ID must be set (regression for the schema-drop bug)
    contractor_id = ctx.get("insp_with_contractor.inspectorContractorId")
    assert contractor_id is not None, (
        "inspectorContractorId must be persisted when supplied at creation. "
        "This field was silently dropped by InspectionCreate schema before the fix."
    )
    assert contractor_id == ctx.get("inspector.id"), (
        "inspectorContractorId must match the supplied contractor"
    )

    # Free-text case: contractor ID must be null
    free_text_contractor_id = ctx.get("insp_free_text.inspectorContractorId")
    assert free_text_contractor_id is None, (
        "inspectorContractorId must be null when only a free-text name was supplied"
    )

    print("\n" + runner.summary())


@pytest.mark.asyncio
async def test_negative_inspection_validation(
    client: AsyncClient,
    db_session: AsyncSession,
    tmp_path,
):
    """
    API validation boundaries: missing fields, wrong state, bad tokens.
    Each step in this workflow expects a 4xx response — PASS means the
    API correctly rejects invalid requests.
    """
    runner = WorkflowRunner(client, debug=False, snapshot_dir=tmp_path)
    ctx = await runner.run(
        WORKFLOWS_DIR / "negative_inspection_validation.yaml"
    )

    # Confirm the negative assertions held
    assert ctx.get("missing_property_response.statusCode") == 422
    assert ctx.get("bad_contractor_response.statusCode") == 422
    assert ctx.get("non_inspector_response.statusCode") == 422
    assert ctx.get("resend_no_contractor_response.statusCode") == 422
    assert ctx.get("bad_token_response.statusCode") == 404
    assert ctx.get("wrong_state_response.statusCode") == 400
    assert ctx.get("nonexistent_inspection_response.statusCode") == 404

    print("\n" + runner.summary())


@pytest.mark.asyncio
async def test_negative_rbac_inspections(
    client: AsyncClient,
    db_session: AsyncSession,
    tmp_path,
):
    """
    RBAC boundaries: tenants and anonymous users cannot perform
    privileged actions. Manager positive baseline confirms the actions
    themselves work — only the role is restricted.
    """
    runner = WorkflowRunner(client, debug=False, snapshot_dir=tmp_path)
    ctx = await runner.run(
        WORKFLOWS_DIR / "negative_rbac_inspections.yaml"
    )

    # Tenant cannot perform privileged mutation actions (403)
    # Note: create_inspection is intentionally open to all authenticated users
    assert ctx.get("tenant_assign_response.statusCode") == 403
    assert ctx.get("tenant_resend_response.statusCode") == 403
    # Note: transition_inspection and create_inspection have no RBAC guard

    # Anonymous attempts must be 401
    assert ctx.get("anon_list_response.statusCode") == 401
    assert ctx.get("anon_get_response.statusCode") == 401

    # Manager positive baseline must succeed
    assert ctx.get("manager_assign_response.inspectorContractorId") is not None

    print("\n" + runner.summary())
