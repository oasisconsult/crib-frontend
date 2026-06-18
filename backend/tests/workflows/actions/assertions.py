"""
Assertion actions — first-class workflow steps that validate state.

These never call the API; they inspect resolved values from the context
and raise ``WorkflowAssertionError`` on failure so the runner can capture
a snapshot and surface a clear test failure.
"""
from __future__ import annotations

import re
from typing import Any

from ..engine.context import ExecutionContext
from ..engine.client_factory import RoleClient
from ..engine.exceptions import WorkflowAssertionError
from ..engine.registry import registry


def _eq(a: Any, b: Any) -> bool:
    """
    Compare two values for equality.

    Handles the common YAML type mismatches:
    - Both None → equal
    - bool vs bool → direct compare (avoids "True" == "1" via str())
    - int/float → numeric compare
    - Everything else → str() coerce (covers UUIDs, enums, etc.)
    """
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    if isinstance(a, bool) and isinstance(b, bool):
        return a == b
    if isinstance(a, bool) or isinstance(b, bool):
        # e.g. target=True, equals="true" in YAML
        return str(a).lower() == str(b).lower()
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return a == b
    return str(a) == str(b)


@registry.register("assert_field")
async def assert_field(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> None:
    """
    Assert that ``target`` satisfies one or more conditions.

    Input keys
    ----------
    target      : the already-interpolated value (use ``${var.field}`` in YAML)
    equals      : exact equality — handles None/bool/int/str correctly
    not_equals  : assert target differs from this value
    is_null     : if True, assert target IS None / null
    not_null    : if True, assert target is NOT None
    contains    : substring (str) or membership (list) check
    not_contains: assert value does NOT contain the substring / item
    one_of      : assert target is in a list of accepted values
    length_equals : assert len(target) == N (works on str and list)
    length_gte  : assert len(target) >= N
    length_lte  : assert len(target) <= N
    matches     : assert str(target) matches a regex pattern
    key_exists  : assert target (a dict) has this key
    type_is     : assert type — one of: string, number, boolean, array, object, null
    """
    target: Any = input.get("target")
    step_name = input.get("_step_name", "assert_field")

    if "equals" in input:
        expected = input["equals"]
        if not _eq(target, expected):
            raise WorkflowAssertionError(
                f"Expected {expected!r}, got {target!r}",
                step_name=step_name,
                expected=expected,
                actual=target,
            )

    if "not_equals" in input:
        not_expected = input["not_equals"]
        if _eq(target, not_expected):
            raise WorkflowAssertionError(
                f"Expected value to differ from {not_expected!r}, but got {target!r}",
                step_name=step_name,
                expected=f"!= {not_expected}",
                actual=target,
            )

    if input.get("is_null"):
        if target is not None:
            raise WorkflowAssertionError(
                f"Expected null/None, got {target!r}",
                step_name=step_name,
                expected=None,
                actual=target,
            )

    if input.get("not_null"):
        if target is None:
            raise WorkflowAssertionError(
                "Expected a non-null value, got None",
                step_name=step_name,
                expected="not None",
                actual=None,
            )

    if "contains" in input:
        needle = input["contains"]
        if isinstance(target, list):
            if needle not in target:
                raise WorkflowAssertionError(
                    f"Expected {needle!r} to be in list {target!r}",
                    step_name=step_name,
                    expected=needle,
                    actual=target,
                )
        elif needle not in str(target):
            raise WorkflowAssertionError(
                f"Expected {needle!r} to appear in {target!r}",
                step_name=step_name,
                expected=needle,
                actual=target,
            )

    if "not_contains" in input:
        needle = input["not_contains"]
        if isinstance(target, list):
            if needle in target:
                raise WorkflowAssertionError(
                    f"Expected {needle!r} NOT to be in list {target!r}",
                    step_name=step_name,
                    expected=f"not containing {needle}",
                    actual=target,
                )
        elif needle in str(target):
            raise WorkflowAssertionError(
                f"Expected {needle!r} NOT to appear in {target!r}",
                step_name=step_name,
                expected=f"not containing {needle}",
                actual=target,
            )

    if "one_of" in input:
        choices = input["one_of"]
        if not any(_eq(target, c) for c in choices):
            raise WorkflowAssertionError(
                f"Expected one of {choices!r}, got {target!r}",
                step_name=step_name,
                expected=choices,
                actual=target,
            )

    if "length_equals" in input:
        expected_len = int(input["length_equals"])
        try:
            actual_len = len(target)
        except TypeError:
            raise WorkflowAssertionError(
                f"Cannot compute len() of {type(target).__name__}",
                step_name=step_name,
                expected=f"len == {expected_len}",
                actual=target,
            )
        if actual_len != expected_len:
            raise WorkflowAssertionError(
                f"Expected length {expected_len}, got {actual_len}",
                step_name=step_name,
                expected=expected_len,
                actual=actual_len,
            )

    if "length_gte" in input:
        minimum = int(input["length_gte"])
        try:
            actual_len = len(target)
        except TypeError:
            raise WorkflowAssertionError(
                f"Cannot compute len() of {type(target).__name__}",
                step_name=step_name,
                expected=f"len >= {minimum}",
                actual=target,
            )
        if actual_len < minimum:
            raise WorkflowAssertionError(
                f"Expected length >= {minimum}, got {actual_len}",
                step_name=step_name,
                expected=f">= {minimum}",
                actual=actual_len,
            )

    if "length_lte" in input:
        maximum = int(input["length_lte"])
        try:
            actual_len = len(target)
        except TypeError:
            raise WorkflowAssertionError(
                f"Cannot compute len() of {type(target).__name__}",
                step_name=step_name,
                expected=f"len <= {maximum}",
                actual=target,
            )
        if actual_len > maximum:
            raise WorkflowAssertionError(
                f"Expected length <= {maximum}, got {actual_len}",
                step_name=step_name,
                expected=f"<= {maximum}",
                actual=actual_len,
            )

    if "matches" in input:
        pattern = input["matches"]
        if not re.search(pattern, str(target)):
            raise WorkflowAssertionError(
                f"Expected {target!r} to match pattern {pattern!r}",
                step_name=step_name,
                expected=f"matches /{pattern}/",
                actual=target,
            )

    if "key_exists" in input:
        key = input["key_exists"]
        if not isinstance(target, dict) or key not in target:
            raise WorkflowAssertionError(
                f"Expected dict with key {key!r}, got {target!r}",
                step_name=step_name,
                expected=f"has key '{key}'",
                actual=target,
            )

    if "type_is" in input:
        expected_type = input["type_is"]
        type_map = {
            "string":  str,
            "number":  (int, float),
            "boolean": bool,
            "array":   list,
            "object":  dict,
            "null":    type(None),
        }
        if expected_type not in type_map:
            raise WorkflowAssertionError(
                f"Unknown type_is value {expected_type!r}. "
                f"Use one of: {list(type_map)}",
                step_name=step_name,
                expected=expected_type,
                actual=type(target).__name__,
            )
        expected_py_type = type_map[expected_type]
        if not isinstance(target, expected_py_type):
            raise WorkflowAssertionError(
                f"Expected type {expected_type!r}, got {type(target).__name__!r} ({target!r})",
                step_name=step_name,
                expected=expected_type,
                actual=type(target).__name__,
            )

    return None


@registry.register("assert_status_code")
async def assert_status_code(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> None:
    """
    Re-issue a GET request and assert its HTTP status code.

    Input keys
    ----------
    url    : the endpoint path (e.g. ``/api/v1/maintenance/${issue.id}``)
    equals : expected HTTP status code (default 200)
    """
    url = input["url"]
    expected_code = int(input.get("equals", 200))
    resp = await client.get(url)
    if resp.status_code != expected_code:
        raise WorkflowAssertionError(
            f"GET {url} → {resp.status_code}, expected {expected_code}",
            step_name=input.get("_step_name", "assert_status_code"),
            expected=expected_code,
            actual=resp.status_code,
        )
    return None


@registry.register("assert_count")
async def assert_count(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> None:
    """
    Assert the length of a list variable.

    Input keys
    ----------
    target : the already-interpolated list value
    equals / gte / lte : comparison operators
    """
    target = input.get("target", [])
    if not isinstance(target, list):
        target = list(target) if target else []
    count = len(target)
    step_name = input.get("_step_name", "assert_count")

    if "equals" in input:
        expected = int(input["equals"])
        if count != expected:
            raise WorkflowAssertionError(
                f"Expected count {expected}, got {count}",
                step_name=step_name,
                expected=expected,
                actual=count,
            )
    if "gte" in input:
        minimum = int(input["gte"])
        if count < minimum:
            raise WorkflowAssertionError(
                f"Expected count >= {minimum}, got {count}",
                step_name=step_name,
                expected=f">={minimum}",
                actual=count,
            )
    if "lte" in input:
        maximum = int(input["lte"])
        if count > maximum:
            raise WorkflowAssertionError(
                f"Expected count <= {maximum}, got {count}",
                step_name=step_name,
                expected=f"<={maximum}",
                actual=count,
            )
    return None
