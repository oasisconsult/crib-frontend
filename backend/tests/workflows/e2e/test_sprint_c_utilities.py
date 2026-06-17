"""
Sprint C — Utility Billing.

Runs the full sprint_c_utilities.yaml workflow:
  lease setup → metered water (manual bill) → fixed internet (auto-bill) →
  list utilities.

Run with:
    pytest tests/workflows/e2e/test_sprint_c_utilities.py -v
"""
from __future__ import annotations

from pathlib import Path

import pytest
from httpx import AsyncClient

import tests.workflows  # noqa: F401
from tests.workflows.engine import WorkflowRunner

DOCS_WORKFLOWS = Path(__file__).parents[4] / "docs" / "workflows"


@pytest.mark.asyncio
async def test_sprint_c_utilities(client: AsyncClient, tmp_path):
    """
    Record metered + fixed utilities on a lease, bill them, and verify
    the list endpoint returns both readings with correct billed status.
    """
    runner = WorkflowRunner(client, debug=False, snapshot_dir=tmp_path)
    ctx = await runner.run(DOCS_WORKFLOWS / "sprint_c_utilities.yaml")

    # Metered: created unbilled, then billed via /bill endpoint
    assert ctx.get("metered_reading.isBilled") is False
    assert ctx.get("metered_reading.utilityType") == "water"
    assert ctx.get("metered_reading.unitsConsumed") == 50.0

    assert ctx.get("billed_reading.isBilled") is True
    assert ctx.get("billed_reading.paymentId") is not None

    # Fixed: auto-billed at creation
    assert ctx.get("fixed_reading.isBilled") is True
    assert ctx.get("fixed_reading.utilityType") == "internet"

    # History list
    history = ctx.get("utility_history")
    assert history is not None
    assert history.get("total", 0) >= 2
    assert isinstance(history.get("data"), list)

    print("\n" + runner.summary())
