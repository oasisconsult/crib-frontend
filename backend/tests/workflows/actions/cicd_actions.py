"""
CI/CD workflow validation actions — validate GitHub Actions workflow files.
"""
from __future__ import annotations

from pathlib import Path

import yaml

from ..engine.client_factory import RoleClient
from ..engine.context import ExecutionContext
from ..engine.exceptions import StepError, WorkflowAssertionError
from ..engine.registry import registry

# Backend root is 3 levels above this file (accessible inside Docker as /app):
# actions/ → tests/workflows/ → tests/ → backend/
# CI files are stored under backend/.github/workflows/ so they are
# reachable from inside the Docker container without mounting the repo root.
_REPO_ROOT = Path(__file__).parents[3]


@registry.register("validate_ci_yml")
async def validate_ci_yml(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Validate the GitHub Actions CI workflow file structure.

    Checks:
    - File exists at the given path (relative to repo root)
    - Parses as valid YAML
    - Has the expected triggers (push + pull_request, or workflow_run)
    - Has required jobs with correct names

    Input keys
    ----------
    path         : path relative to repo root (default ".github/workflows/ci.yml")
    expectJobs   : list of expected job keys (default ["backend", "frontend"])
    """
    rel_path = input.get("path", ".github/workflows/ci.yml")
    workflow_path = _REPO_ROOT / rel_path

    if not workflow_path.exists():
        raise StepError(
            f"CI workflow file not found: {workflow_path}",
            step_name=input.get("_step_name", "validate_ci_yml"),
            action="validate_ci_yml",
        )

    try:
        with workflow_path.open("r", encoding="utf-8") as fh:
            definition = yaml.safe_load(fh)
    except Exception as exc:
        raise StepError(
            f"CI workflow file is not valid YAML: {exc}",
            step_name=input.get("_step_name", "validate_ci_yml"),
            action="validate_ci_yml",
        ) from exc

    expected_jobs = input.get("expectJobs", ["backend", "frontend"])
    actual_jobs = list(definition.get("jobs", {}).keys())
    missing = [j for j in expected_jobs if j not in actual_jobs]

    # PyYAML 5.x parses bare `on:` as boolean True (YAML 1.1); handle both.
    triggers = definition.get("on", definition.get(True, {})) or {}
    has_push = "push" in triggers
    has_pr = "pull_request" in triggers

    return {
        "valid": True,
        "path": str(workflow_path),
        "name": definition.get("name", ""),
        "jobs": actual_jobs,
        "missingJobs": missing,
        "hasAllJobs": len(missing) == 0,
        "hasBackendJob": "backend" in actual_jobs,
        "hasFrontendJob": "frontend" in actual_jobs,
        "hasPushTrigger": has_push,
        "hasPrTrigger": has_pr,
        "hasConcurrency": "concurrency" in definition,
    }


@registry.register("validate_deploy_yml")
async def validate_deploy_yml(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Validate the GitHub Actions deploy workflow file.

    Checks that the deploy workflow is gated on a successful CI run
    (``workflow_run`` trigger with ``conclusion == 'success'``).

    Input keys
    ----------
    path : path relative to repo root (default ".github/workflows/deploy-staging.yml")
    """
    rel_path = input.get("path", ".github/workflows/deploy-staging.yml")
    workflow_path = _REPO_ROOT / rel_path

    if not workflow_path.exists():
        raise StepError(
            f"Deploy workflow file not found: {workflow_path}",
            step_name=input.get("_step_name", "validate_deploy_yml"),
            action="validate_deploy_yml",
        )

    with workflow_path.open("r", encoding="utf-8") as fh:
        definition = yaml.safe_load(fh)

    triggers = definition.get("on", definition.get(True, {})) or {}
    has_workflow_run = "workflow_run" in triggers
    has_dispatch = "workflow_dispatch" in triggers

    deploy_job = definition.get("jobs", {}).get("deploy", {})
    job_if = deploy_job.get("if", "")
    guards_on_success = "success" in str(job_if)

    return {
        "valid": True,
        "path": str(workflow_path),
        "name": definition.get("name", ""),
        "hasWorkflowRunTrigger": has_workflow_run,
        "hasManualTrigger": has_dispatch,
        "guardedOnSuccess": guards_on_success,
    }
