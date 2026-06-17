"""
Sprint G — Public Vacancy Listings.

Runs the full sprint_g_listings.yaml workflow:
  enable listings for test org → create property/unit →
  GET public/listings (assert 200 + items) → filtered fetch → price cap.

Note: ``listings_enabled`` is set on the org via the db_session fixture
before running the workflow, since there is no API endpoint to toggle it.

Run with:
    pytest tests/workflows/e2e/test_sprint_g_listings.py -v
"""
from __future__ import annotations

from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

import tests.workflows  # noqa: F401
from tests.workflows.engine import WorkflowRunner

DOCS_WORKFLOWS = Path(__file__).parents[4] / "docs" / "workflows"


@pytest.mark.asyncio
async def test_sprint_g_listings(client: AsyncClient, db_session: AsyncSession, tmp_path):
    """
    Enable org listings opt-in, then verify the public listings endpoint
    returns newly created properties, and that filters behave correctly.
    """
    from sqlalchemy import select
    from app.models.organisation import Organisation

    # Enable listings for the dev org (no public API for this toggle)
    result = await db_session.execute(
        select(Organisation).where(Organisation.logto_org_id == "org_dev")
    )
    org = result.scalar_one()
    settings = dict(org.settings or {})
    settings["listings_enabled"] = "true"
    settings["listings_contact_phone"] = "+256700000000"
    settings["listings_contact_email"] = "listings@dev.local"
    org.settings = settings
    await db_session.flush()

    runner = WorkflowRunner(client, debug=False, snapshot_dir=tmp_path)
    ctx = await runner.run(DOCS_WORKFLOWS / "sprint_g_listings.yaml")

    # Unit was created successfully
    assert ctx.get("unit.id") is not None

    # Public listings endpoint responds 200 with the expected structure
    assert ctx.get("listings.statusCode") == 200
    assert ctx.get("listings.items") is not None
    # At least 1 listing (the unit we just created)
    assert ctx.get("listings.total") >= 1

    # Filtered listing by type responds 200
    assert ctx.get("filtered_listings.statusCode") == 200

    # Price cap below the unit rent → 0 results
    assert ctx.get("capped_listings.total") == 0

    print("\n" + runner.summary())
