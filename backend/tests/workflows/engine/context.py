"""ExecutionContext — stores step outputs and resolves dotted-path variable access."""
from __future__ import annotations

from typing import Any


class ExecutionContext:
    """
    Holds all named outputs captured during workflow execution.

    Variables are stored by their `save_as` key and can be accessed
    with dotted paths: ``context.get("issue.state")`` → ``"reported"``.
    """

    def __init__(self) -> None:
        self._store: dict[str, Any] = {}

    # ── Write ──────────────────────────────────────────────────────────────────

    def set(self, name: str, value: Any) -> None:
        self._store[name] = value

    # ── Read ───────────────────────────────────────────────────────────────────

    def get(self, path: str) -> Any:
        """
        Resolve a dotted path like ``"issue.state"`` or ``"property.id"``.

        The first segment is the variable name; remaining segments are
        attribute / key lookups traversed in order.
        """
        parts = path.split(".")
        value: Any = self._store.get(parts[0])
        for part in parts[1:]:
            if value is None:
                raise KeyError(f"Context path '{path}' failed at segment '{part}': parent is None")
            if isinstance(value, dict):
                value = value[part]
            else:
                value = getattr(value, part)
        return value

    def snapshot(self) -> dict[str, Any]:
        """Return a shallow copy of the store for debugging / failure snapshots."""
        return dict(self._store)

    def __repr__(self) -> str:
        return f"ExecutionContext(keys={list(self._store)})"
