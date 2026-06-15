"""Custom exceptions for the workflow engine."""
from __future__ import annotations


class WorkflowError(Exception):
    """Raised when a workflow definition is invalid or cannot be loaded."""
    def __init__(self, message: str, workflow_name: str | None = None):
        super().__init__(message)
        self.workflow_name = workflow_name


class StepError(Exception):
    """Raised when a workflow step fails during execution."""
    def __init__(
        self,
        message: str,
        step_name: str,
        action: str,
        context_snapshot: dict | None = None,
    ):
        super().__init__(message)
        self.step_name = step_name
        self.action = action
        self.context_snapshot = context_snapshot or {}


class WorkflowAssertionError(AssertionError):
    """Raised when a workflow assertion step fails."""
    def __init__(self, message: str, step_name: str, expected, actual):
        super().__init__(message)
        self.step_name = step_name
        self.expected = expected
        self.actual = actual
