"""
Sprint D — Document Access Control.

Runs the full sprint_d_document_access.yaml workflow:
  create tenant → serve own-org document (expect 404, not 403) →
  serve unknown tenant UUID (expect 403) → path traversal (expect 400).

Run with:
    pytest tests/workflows/e2e/test_sprint_d_document_access.py -v
"""
from __future__ import annotations

from pathlib import Path

import pytest
from httpx import AsyncClient

import tests.workflows  # noqa: F401
from tests.workflows.engine import WorkflowRunner

DOCS_WORKFLOWS = Path(__file__).parents[4] / "docs" / "workflows"


@pytest.mark.asyncio
async def test_sprint_d_document_access(client: AsyncClient, tmp_path):
    """
    Validates the serve-file authorization layer:
    - Auth-passing request gets 404 (storage miss), not 403.
    - Unknown tenant UUID → 403.
    - Path traversal → 400.
    """
    runner = WorkflowRunner(client, debug=False, snapshot_dir=tmp_path)
    ctx = await runner.run(DOCS_WORKFLOWS / "sprint_d_document_access.yaml")

    # Authorized manager access: auth passes → storage returns 404 (no real S3)
    authorized_code = ctx.get("authorized_result.statusCode")
    assert authorized_code != 403, (
        f"Expected auth to pass (not 403), got {authorized_code}"
    )
    assert ctx.get("authorized_result.authorized") is True

    # Unauthorized: unknown UUID should be 403
    assert ctx.get("unauthorized_result.statusCode") == 403
    assert ctx.get("unauthorized_result.authorized") is False

    # Path traversal must be rejected 400
    assert ctx.get("traversal_result.statusCode") == 400

    print("\n" + runner.summary())
