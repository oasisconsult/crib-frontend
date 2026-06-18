"""
Sprint H — Tenant Screening Checklist.

Runs the full sprint_h_screenings.yaml workflow:
  create property/unit → create screening → update checklist →
  approve → create second screening → reject → list screenings.

Run with:
    pytest tests/workflows/e2e/test_sprint_h_screenings.py -v
"""
from __future__ import annotations

from pathlib import Path

import pytest
from httpx import AsyncClient

import tests.workflows  # noqa: F401
from tests.workflows.engine import WorkflowRunner, WORKFLOWS_DIR



@pytest.mark.asyncio
async def test_sprint_h_screenings(client: AsyncClient, tmp_path):
    """
    Full screening lifecycle: create → checklist updates → approve → reject.
    Verifies status transitions, decision timestamps, and list pagination.
    """
    runner = WorkflowRunner(client, debug=False, snapshot_dir=tmp_path)
    ctx = await runner.run(WORKFLOWS_DIR / "sprint_h_screenings.yaml")

    # Initial screening
    assert ctx.get("screening.id") is not None
    assert ctx.get("screening.status") == "pending"
    assert ctx.get("screening.applicantName") == "Peter Ssali"
    assert isinstance(ctx.get("screening.checklist"), list)
    assert len(ctx.get("screening.checklist")) == 6, "Expected 6 default checklist items"

    # After checklist updates, still pending
    assert ctx.get("screening_after_employment.status") == "pending"

    # Approved screening
    assert ctx.get("approved_screening.status") == "approved"
    assert ctx.get("approved_screening.decidedAt") is not None
    assert "Recommended for tenancy" in (ctx.get("approved_screening.decisionNotes") or "")

    # Rejected screening
    assert ctx.get("rejected_screening.status") == "rejected"
    assert ctx.get("rejected_screening.decidedAt") is not None

    # List should contain at least 2 screenings for this unit
    screenings_list = ctx.get("screenings_list")
    assert screenings_list is not None
    assert screenings_list.get("total", 0) >= 2

    # Approved and rejected are different records
    assert ctx.get("screening.id") != ctx.get("rejected_screening_base.id")

    print("\n" + runner.summary())

