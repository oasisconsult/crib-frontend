"""
Action registry — maps action name strings to async callables.

Each action is a coroutine with the signature:

    async def my_action(
        client: RoleClient,
        input: dict,
        ctx: ExecutionContext,
    ) -> dict | None:

The return value (if not None) becomes the step's output, optionally stored
in the context under ``save_as``.

Actions are registered at import time via ``@registry.register("name")`` or
by calling ``registry.add("name", fn)`` directly.
"""
from __future__ import annotations

from collections.abc import Callable, Coroutine
from typing import Any

from .context import ExecutionContext
from .client_factory import RoleClient

ActionFn = Callable[
    [RoleClient, dict, ExecutionContext],
    Coroutine[Any, Any, dict | None],
]


class ActionRegistry:
    """Central registry for all workflow action implementations."""

    def __init__(self) -> None:
        self._actions: dict[str, ActionFn] = {}

    def register(self, name: str) -> Callable[[ActionFn], ActionFn]:
        """Decorator: ``@registry.register("create_contractor")``."""
        def decorator(fn: ActionFn) -> ActionFn:
            self._actions[name] = fn
            return fn
        return decorator

    def add(self, name: str, fn: ActionFn) -> None:
        """Programmatic registration."""
        self._actions[name] = fn

    def get(self, name: str) -> ActionFn:
        if name not in self._actions:
            raise KeyError(
                f"Unknown action '{name}'. "
                f"Registered actions: {sorted(self._actions)}"
            )
        return self._actions[name]

    def all_names(self) -> list[str]:
        return sorted(self._actions)


# Module-level singleton imported by both the runner and all action modules.
registry = ActionRegistry()
