"""
Sprint B — Bulk Tenant Announcements.

Runs the full sprint_b_announcements.yaml workflow:
  create announcement → assert fields → create second announcement →
  list announcements → assert count and structure.

Run with:
    pytest tests/workflows/e2e/test_sprint_b_announcements.py -v
"""
from __future__ import annotations

from pathlib import Path

import pytest
from httpx import AsyncClient

import tests.workflows  # noqa: F401
from tests.workflows.engine import WorkflowRunner

DOCS_WORKFLOWS = Path(__file__).parents[4] / "docs" / "workflows"


@pytest.mark.asyncio
async def test_sprint_b_announcements(client: AsyncClient, tmp_path):
    """
    Create two announcements (in_app and multi-channel), then verify the
    history list endpoint returns them with correct structure.
    """
    runner = WorkflowRunner(client, debug=False, snapshot_dir=tmp_path)
    ctx = await runner.run(DOCS_WORKFLOWS / "sprint_b_announcements.yaml")

    # Announcement 1 assertions
    assert ctx.get("announcement.id") is not None
    assert ctx.get("announcement.title") == "Sprint-B Workflow Test"
    assert "in_app" in ctx.get("announcement.channels")
    assert ctx.get("announcement.organisationId") is not None

    # Announcement 2 assertions
    assert ctx.get("announcement2.id") is not None
    assert "email" in ctx.get("announcement2.channels")

    # Two different announcements should have different IDs
    assert ctx.get("announcement.id") != ctx.get("announcement2.id")

    # History list should contain both
    history = ctx.get("history")
    assert history is not None
    assert history.get("total", 0) >= 2
    assert isinstance(history.get("data"), list)
    assert len(history.get("data", [])) >= 2

    print("\n" + runner.summary())
