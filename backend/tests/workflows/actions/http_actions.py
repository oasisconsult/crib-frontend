"""
Generic HTTP actions for positive and negative test scenarios.

``http_request`` lets a YAML workflow fire any HTTP method at any endpoint
and assert the expected status code — including 4xx/5xx for negative tests.

Use ``as: tenant`` (or any other role) on the step to control which auth
identity fires the request.  Use ``as: anonymous`` for unauthenticated calls.

Example — assert a tenant is forbidden from approving an inspection:

    - name: tenant_cannot_approve
      action: http_request
      as: tenant
      input:
        method: POST
        url: "/api/v1/inspections/${inspection.id}/transition"
        body:
          event: INSPECTION_APPROVED
        expectStatus: 403
      save_as: forbidden_response

    - name: assert_error_message
      action: assert_field
      input:
        target: "${forbidden_response.detail}"
        contains: "manager"
"""
from __future__ import annotations

from ..engine.client_factory import RoleClient
from ..engine.context import ExecutionContext
from ..engine.exceptions import StepError, WorkflowAssertionError
from ..engine.registry import registry


@registry.register("http_request")
async def http_request(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Fire an HTTP request and assert the response status code.

    Input keys
    ----------
    method        : HTTP verb — GET, POST, PUT, PATCH, DELETE (default: GET)
    url           : API path, e.g. ``/api/v1/inspections/${inspection.id}``
    body          : JSON body dict (for POST/PUT/PATCH)
    params        : query-string params dict (for GET)
    expectStatus  : expected HTTP status code (default: 200)
                    Set to a 4xx/5xx value for negative tests.

    Returns
    -------
    dict with:
      statusCode : actual HTTP status code
      body       : parsed JSON response (or empty dict if no body)
      ok         : True when statusCode < 400
    """
    method = str(input.get("method", "GET")).upper()
    url = input["url"]
    body = input.get("body")
    params = input.get("params")
    expect_status = int(input.get("expectStatus", 200))
    step_name = input.get("_step_name", "http_request")

    kwargs: dict = {}
    if params:
        kwargs["params"] = params

    if method == "GET":
        resp = await client.get(url, **kwargs)
    elif method == "POST":
        resp = await client.post(url, json=body or {}, **kwargs)
    elif method == "PUT":
        resp = await client.put(url, json=body or {}, **kwargs)
    elif method == "PATCH":
        resp = await client.patch(url, json=body or {}, **kwargs)
    elif method == "DELETE":
        resp = await client.delete(url, **kwargs)
    else:
        raise StepError(
            f"Unknown HTTP method '{method}'",
            step_name=step_name,
            action="http_request",
        )

    actual_status = resp.status_code

    try:
        resp_body = resp.json()
    except Exception:
        resp_body = {"_raw": resp.text}

    if actual_status != expect_status:
        raise WorkflowAssertionError(
            f"{method} {url} → {actual_status}, expected {expect_status}. "
            f"Body: {resp_body}",
            step_name=step_name,
            expected=expect_status,
            actual=actual_status,
        )

    return {
        "statusCode": actual_status,
        "body": resp_body,
        # Flatten top-level body keys for easy YAML access:
        # ${response.detail}  →  resp_body["detail"]
        **(resp_body if isinstance(resp_body, dict) else {}),
        "ok": actual_status < 400,
    }
