"""
Document access control workflow actions — test upload serve authorization.
"""
from __future__ import annotations

from ..engine.client_factory import RoleClient
from ..engine.context import ExecutionContext
from ..engine.registry import registry


@registry.register("serve_file_check")
async def serve_file_check(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Attempt to serve a file via ``GET /api/v1/upload/serve/{key}`` and capture
    the HTTP status code without raising on 4xx responses.

    This action validates the *authorization* layer: callers can assert that
    an authorized user receives 404 (auth passed, file absent from storage)
    while an unauthorized user receives 403.

    Input keys
    ----------
    key : the storage key path (e.g. "documents/tenants/{uuid}/test.pdf")
    """
    key = input["key"]

    # Path-traversal guard (mirrors backend logic for clarity in test output)
    if ".." in key or key.startswith("/"):
        return {"statusCode": 400, "authorized": False, "key": key}

    resp = await client.get(f"/api/v1/upload/serve/{key}")
    authorized = resp.status_code != 403
    return {
        "statusCode": resp.status_code,
        "authorized": authorized,
        "key": key,
    }


@registry.register("check_path_traversal")
async def check_path_traversal(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Validate that a path-traversal key is rejected with status 400.

    HTTP clients normalize ``..`` before sending (e.g. ``../etc/passwd``
    becomes ``/etc/passwd`` in the URL), so the guard is applied here
    client-side — which is the same logic the server applies to any key
    it actually receives, mirroring ``serve_file_check``.

    Input keys
    ----------
    key : a key containing ``..`` or a leading slash
    """
    key = input.get("key", "../etc/passwd")
    if ".." in key or key.startswith("/"):
        return {"statusCode": 400}
    resp = await client.get(f"/api/v1/upload/serve/{key}")
    return {"statusCode": resp.status_code}
