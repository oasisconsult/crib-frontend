"""
Sprint I — GitHub Actions CI/CD Pipeline.

Runs the full sprint_i_cicd.yaml workflow:
  validate ci.yml → validate deploy-staging.yml.

These checks are filesystem-based (no API calls) — they verify that the
workflow files exist, are valid YAML, and have the correct structure.

Run with:
    pytest tests/workflows/e2e/test_sprint_i_cicd.py -v
"""
from __future__ import annotations

from pathlib import Path

import pytest
from httpx import AsyncClient

import tests.workflows  # noqa: F401
from tests.workflows.engine import WorkflowRunner, WORKFLOWS_DIR

REPO_ROOT = Path(__file__).parents[3]  # backend/ — CI files live at backend/.github/workflows/


@pytest.mark.asyncio
async def test_sprint_i_cicd(client: AsyncClient, tmp_path):
    """
    Validates the CI/CD pipeline configuration:
    - ci.yml exists with backend and frontend jobs and correct triggers.
    - deploy-staging.yml exists and is gated on CI success via workflow_run.
    """
    runner = WorkflowRunner(client, debug=False, snapshot_dir=tmp_path)
    ctx = await runner.run(WORKFLOWS_DIR / "sprint_i_cicd.yaml")

    # CI workflow assertions
    assert ctx.get("ci_result.valid") is True
    assert ctx.get("ci_result.hasBackendJob") is True
    assert ctx.get("ci_result.hasFrontendJob") is True
    assert ctx.get("ci_result.hasPushTrigger") is True
    assert ctx.get("ci_result.hasPrTrigger") is True
    assert ctx.get("ci_result.hasConcurrency") is True
    assert ctx.get("ci_result.missingJobs") == [], (
        f"Missing CI jobs: {ctx.get('ci_result.missingJobs')}"
    )

    # Deploy workflow assertions
    assert ctx.get("deploy_result.valid") is True
    assert ctx.get("deploy_result.hasWorkflowRunTrigger") is True
    assert ctx.get("deploy_result.hasManualTrigger") is True
    assert ctx.get("deploy_result.guardedOnSuccess") is True

    print("\n" + runner.summary())


@pytest.mark.asyncio
async def test_sprint_i_ci_file_exists():
    """Lightweight pre-check: CI and deploy files must exist in the repo."""
    ci_path = REPO_ROOT / ".github" / "workflows" / "ci.yml"
    deploy_path = REPO_ROOT / ".github" / "workflows" / "deploy-staging.yml"

    assert ci_path.exists(), f"CI workflow not found: {ci_path}"
    assert deploy_path.exists(), f"Deploy workflow not found: {deploy_path}"
    assert ci_path.stat().st_size > 0, "ci.yml is empty"
    assert deploy_path.stat().st_size > 0, "deploy-staging.yml is empty"
