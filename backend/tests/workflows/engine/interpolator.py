"""
Variable interpolator — resolves ``${var.field}`` placeholders in workflow
step inputs against the current ExecutionContext.
"""
from __future__ import annotations

import re
from typing import Any

from .context import ExecutionContext

_PLACEHOLDER = re.compile(r"\$\{([^}]+)\}")


def interpolate(value: Any, ctx: ExecutionContext) -> Any:
    """
    Recursively resolve all ``${path}`` placeholders in *value*.

    - Strings: each placeholder is replaced; if the whole string IS a single
      placeholder the original type of the resolved value is preserved (e.g.
      an ID that is a dict stays a dict, not its ``str()``).
    - Dicts / lists: recurse into each element.
    - Everything else (int, bool, None): returned unchanged.
    """
    if isinstance(value, str):
        matches = _PLACEHOLDER.findall(value)
        if not matches:
            return value
        # Single placeholder occupying the whole string → preserve type.
        if value == f"${{{matches[0]}}}" and len(matches) == 1:
            return ctx.get(matches[0])
        # Multiple or embedded placeholders → stringify each resolved value.
        def _replace(m: re.Match) -> str:
            return str(ctx.get(m.group(1)))
        return _PLACEHOLDER.sub(_replace, value)

    if isinstance(value, dict):
        return {k: interpolate(v, ctx) for k, v in value.items()}

    if isinstance(value, list):
        return [interpolate(item, ctx) for item in value]

    return value
