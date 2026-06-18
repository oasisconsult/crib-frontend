"""
Sprint A — WeasyPrint Statement PDF.

Runs the full sprint_a_statement_pdf.yaml workflow:
  property → unit → tenant → lease → activate → record payment →
  GET statement/pdf (assert application/pdf) → GET statement (assert text/csv).

Run with:
    pytest tests/workflows/e2e/test_sprint_a_statement_pdf.py -v
"""
from __future__ import annotations

from pathlib import Path

import pytest
from httpx import AsyncClient

import tests.workflows  # noqa: F401 — self-registers all action modules
from tests.workflows.engine import WorkflowRunner, WORKFLOWS_DIR



@pytest.mark.asyncio
async def test_sprint_a_statement_pdf(client: AsyncClient, tmp_path):
    """
    Full lifecycle: create lease → record rent payment → download PDF + CSV
    statement and assert correct content-types and non-empty responses.
    """
    runner = WorkflowRunner(client, debug=False, snapshot_dir=tmp_path)
    ctx = await runner.run(WORKFLOWS_DIR / "sprint_a_statement_pdf.yaml")

    # Post-run assertions on the resolved context
    assert ctx.get("pdf_result.statusCode") == 200, (
        f"Expected 200 from statement PDF, got {ctx.get('pdf_result.statusCode')}"
    )
    content_type = ctx.get("pdf_result.contentType")
    assert "application/pdf" in content_type, (
        f"Expected application/pdf content-type, got {content_type!r}"
    )
    assert ctx.get("pdf_result.size") > 0, "PDF statement was empty"

    assert ctx.get("csv_result.statusCode") == 200
    assert "text/csv" in ctx.get("csv_result.contentType")

    assert ctx.get("active_lease.status") == "active"
    assert ctx.get("payment.category") == "rent"

    print("\n" + runner.summary())

