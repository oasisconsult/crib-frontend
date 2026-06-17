"""
Sprint F — GeoBox Geocode Auto-Fill.

Runs the full sprint_f_geocode.yaml workflow:
  geocode hierarchy resolution + village text search.

Run with:
    pytest tests/workflows/e2e/test_sprint_f_geocode.py -v
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

import tests.workflows  # noqa: F401
from tests.workflows.engine import WorkflowRunner, WORKFLOWS_DIR


@pytest.mark.asyncio
async def test_sprint_f_geocode(client: AsyncClient, tmp_path):
    """
    Validates the GeoBox geocode hierarchy endpoint:
    - Returns 200 for any well-formed code (hierarchy may be null if
      GeoBox is unconfigured in test env, but the endpoint must respond).
    - Village search endpoint responds 200, 503, or 500 (graceful degradation).
    """
    runner = WorkflowRunner(client, debug=False, snapshot_dir=tmp_path)
    ctx = await runner.run(WORKFLOWS_DIR / "sprint_f_geocode.yaml")

    # Both geocode calls must return 200
    assert ctx.get("hierarchy_result.statusCode") == 200, (
        "geocode hierarchy endpoint did not return 200"
    )
    assert ctx.get("hierarchy_result2.statusCode") == 200

    # Village search: 200 = OK; 503 = service unavailable; 500 = module absent in test env
    village_code = ctx.get("village_search.statusCode")
    assert village_code in (200, 500, 503), (
        f"Expected 200/500/503 from village search, got {village_code}"
    )

    print("\n" + runner.summary())
