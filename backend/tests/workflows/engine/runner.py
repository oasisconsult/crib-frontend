"""
WorkflowRunner — loads a YAML workflow definition and executes it step-by-step.

Usage (inside a pytest test)::

    async def test_maintenance_workflow(client, tmp_path):
        runner = WorkflowRunner(client, debug=True)
        await runner.run(WORKFLOWS_DIR / "maintenance_lifecycle.yaml")
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Any

import yaml
from httpx import AsyncClient

from .client_factory import ClientFactory
from .context import ExecutionContext
from .exceptions import StepError, WorkflowAssertionError, WorkflowError
from .interpolator import interpolate
from .registry import registry

logger = logging.getLogger("workflow.runner")

# Directory containing bundled workflow definitions.
WORKFLOWS_DIR = Path(__file__).parent.parent / "definitions"


class StepResult:
    """Captures timing and output for one executed step."""

    def __init__(
        self,
        name: str,
        action: str,
        output: dict | None,
        duration_ms: float,
        retries: int = 0,
    ) -> None:
        self.name = name
        self.action = action
        self.output = output
        self.duration_ms = duration_ms
        self.retries = retries


class WorkflowRunner:
    """
    Executes a declarative YAML workflow against the FastAPI test application.

    Parameters
    ----------
    client:
        An ``httpx.AsyncClient`` already wired to the FastAPI ASGI app
        (as provided by the ``client`` fixture in ``conftest.py``).
    debug:
        When ``True``, log each step's input, output and timing at DEBUG level.
    snapshot_dir:
        If provided, write a JSON failure snapshot to this directory on error.
    """

    def __init__(
        self,
        client: AsyncClient,
        debug: bool = False,
        snapshot_dir: Path | None = None,
    ) -> None:
        self._factory = ClientFactory(client)
        self.debug = debug
        self.snapshot_dir = snapshot_dir
        self.results: list[StepResult] = []
        self.ctx = ExecutionContext()

        if debug:
            logging.basicConfig(level=logging.DEBUG)
            logger.setLevel(logging.DEBUG)

    # ── Public API ─────────────────────────────────────────────────────────────

    async def run(self, workflow_path: str | Path) -> ExecutionContext:
        """
        Load and execute *workflow_path*.

        Returns the final ``ExecutionContext`` (useful for post-run assertions).
        Raises ``StepError`` or ``WorkflowAssertionError`` on failure, writing
        a snapshot to ``snapshot_dir`` if configured.
        """
        definition = self._load(workflow_path)
        workflow_name = definition.get("name", str(workflow_path))
        steps = definition.get("steps", [])

        if not steps:
            raise WorkflowError("Workflow has no steps", workflow_name=workflow_name)

        logger.info("▶ Starting workflow '%s' (%d steps)", workflow_name, len(steps))

        for step in steps:
            await self._execute_step(step, workflow_name)

        logger.info("✓ Workflow '%s' completed successfully", workflow_name)
        return self.ctx

    # ── Step execution ─────────────────────────────────────────────────────────

    async def _execute_step(self, step: dict, workflow_name: str) -> None:
        step_name = step.get("name", "<unnamed>")
        action_name = step.get("action")
        if not action_name:
            raise WorkflowError(
                f"Step '{step_name}' is missing 'action'", workflow_name=workflow_name
            )

        role = step.get("as", "manager")
        raw_input = step.get("input", {})
        save_as = step.get("save_as")
        retry_cfg = step.get("retry", {})
        max_retries = int(retry_cfg.get("max", 0))
        retry_delay = float(retry_cfg.get("delay", 0.5))

        # Resolve ${...} placeholders in the input dict.
        resolved_input = interpolate(raw_input, self.ctx)

        action_fn = registry.get(action_name)
        client = self._factory.for_role(role)

        if self.debug:
            logger.debug(
                "  → step='%s' action='%s' as='%s' input=%s",
                step_name, action_name, role, resolved_input,
            )

        attempt = 0
        last_exc: Exception | None = None
        t0 = time.perf_counter()

        while attempt <= max_retries:
            try:
                output = await action_fn(client, resolved_input, self.ctx)
                break
            except (StepError, WorkflowAssertionError):
                raise
            except Exception as exc:
                last_exc = exc
                attempt += 1
                if attempt <= max_retries:
                    logger.warning(
                        "  ↺ step='%s' attempt %d/%d failed: %s — retrying in %.1fs",
                        step_name, attempt, max_retries, exc, retry_delay,
                    )
                    await asyncio.sleep(retry_delay)
        else:
            self._write_snapshot(workflow_name, step_name)
            raise StepError(
                f"Step '{step_name}' failed after {max_retries} retries: {last_exc}",
                step_name=step_name,
                action=action_name,
                context_snapshot=self.ctx.snapshot(),
            ) from last_exc

        duration_ms = (time.perf_counter() - t0) * 1000

        if output is not None and save_as:
            self.ctx.set(save_as, output)

        self.results.append(
            StepResult(step_name, action_name, output, duration_ms, retries=attempt)
        )

        if self.debug:
            logger.debug(
                "  ✓ step='%s' → saved_as='%s' (%.0fms)",
                step_name, save_as or "(not saved)", duration_ms,
            )

    # ── Helpers ────────────────────────────────────────────────────────────────

    @staticmethod
    def _load(path: str | Path) -> dict:
        path = Path(path)
        if not path.is_absolute():
            path = WORKFLOWS_DIR / path
        if not path.exists():
            raise WorkflowError(f"Workflow file not found: {path}")
        with path.open("r", encoding="utf-8") as fh:
            definition = yaml.safe_load(fh)
        if not isinstance(definition, dict):
            raise WorkflowError(f"Workflow file must be a YAML mapping: {path}")
        return definition

    def _write_snapshot(self, workflow_name: str, failed_step: str) -> None:
        if not self.snapshot_dir:
            return
        self.snapshot_dir.mkdir(parents=True, exist_ok=True)
        filename = f"snapshot_{workflow_name}_{failed_step}.json".replace(" ", "_")
        dest = self.snapshot_dir / filename
        payload: dict[str, Any] = {
            "workflow": workflow_name,
            "failed_step": failed_step,
            "context": self.ctx.snapshot(),
            "steps_completed": [
                {"name": r.name, "action": r.action, "duration_ms": r.duration_ms}
                for r in self.results
            ],
        }
        dest.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
        logger.info("  ✗ Failure snapshot written to %s", dest)

    def summary(self) -> str:
        lines = ["Workflow Step Summary", "─" * 40]
        for r in self.results:
            retries = f" ({r.retries} retries)" if r.retries else ""
            lines.append(f"  ✓ {r.name:<30} [{r.action}] {r.duration_ms:.0f}ms{retries}")
        return "\n".join(lines)
