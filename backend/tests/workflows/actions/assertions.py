"""
Assertion actions — first-class workflow steps that validate state.

These never call the API; they inspect resolved values from the context
and raise ``WorkflowAssertionError`` on failure so the runner can capture
a snapshot and surface a clear test failure.
"""
from __future__ import annotations

from typing import Any

from ..engine.context import ExecutionContext
from ..engine.client_factory import RoleClient
from ..engine.exceptions import WorkflowAssertionError
from ..engine.registry import registry


@registry.register("assert_field")
async def assert_field(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> None:
    """
    Assert that ``target`` equals, contains, or matches ``expected``.

    Input keys
    ----------
    target   : the already-interpolated value to check (use ``${var.field}`` in YAML)
    equals   : exact equality check (string or numeric)
    contains : substring check (strings) or membership check (lists)
    not_null : if True, assert target is not None
    not_equals : assert target differs from this value
    one_of   : assert target is one of a list of accepted values
    """
    target: Any = input.get("target")
    step_name = input.get("_step_name", "assert_field")

    if "equals" in input:
        expected = input["equals"]
        if str(target) != str(expected):
            raise WorkflowAssertionError(
                f"Expected {expected!r}, got {target!r}",
                step_name=step_name,
                expected=expected,
                actual=target,
            )

    if "not_equals" in input:
        not_expected = input["not_equals"]
        if str(target) == str(not_expected):
            raise WorkflowAssertionError(
                f"Expected value to differ from {not_expected!r}, but got {target!r}",
                step_name=step_name,
                expected=f"!= {not_expected}",
                actual=target,
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

    if input.get("not_null"):
        if target is None:
            raise WorkflowAssertionError(
                "Expected a non-null value, got None",
                step_name=step_name,
                expected="not None",
                actual=None,
            )

    if "one_of" in input:
        choices = input["one_of"]
        # Normalize both sides to strings so int status codes match YAML string literals
        if str(target) not in [str(c) for c in choices]:
            raise WorkflowAssertionError(
                f"Expected one of {choices!r}, got {target!r}",
                step_name=step_name,
                expected=choices,
                actual=target,
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
