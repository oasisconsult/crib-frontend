"""
System settings workflow actions — read, write, and test platform settings.
"""
from __future__ import annotations

from ..engine.client_factory import RoleClient
from ..engine.context import ExecutionContext
from ..engine.exceptions import StepError
from ..engine.registry import registry


@registry.register("get_system_setting")
async def get_system_setting(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Read a single system setting via ``GET /api/v1/admin/settings/{key}``.

    Input keys
    ----------
    key : the setting key (e.g. "whatsapp.meta.api_key")
    """
    key = input["key"]
    resp = await client.get(f"/api/v1/admin/settings/{key}")
    if resp.status_code != 200:
        raise StepError(
            f"get_system_setting failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "get_system_setting"),
            action="get_system_setting",
        )
    return resp.json()


@registry.register("update_system_setting")
async def update_system_setting(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Update a system setting via ``PUT /api/v1/admin/settings/{key}``.

    Input keys
    ----------
    key   : the setting key
    value : the new value string
    """
    key = input["key"]
    payload = {"value": str(input["value"])}
    resp = await client.put(f"/api/v1/admin/settings/{key}", json=payload)
    if resp.status_code not in (200, 201):
        raise StepError(
            f"update_system_setting failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "update_system_setting"),
            action="update_system_setting",
        )
    return resp.json()


@registry.register("test_whatsapp_connection")
async def test_whatsapp_connection(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Send a WhatsApp test message via ``POST /api/v1/admin/settings/test/whatsapp``.

    In test environments where WhatsApp is not configured, the endpoint still
    returns 200 with ``success: false`` and a descriptive message.

    Input keys
    ----------
    recipient : phone number to test-message (e.g. "+256700000001")
    """
    payload = {"recipient": input.get("recipient", "+256700000001")}
    resp = await client.post("/api/v1/admin/settings/test/whatsapp", json=payload)
    if resp.status_code != 200:
        raise StepError(
            f"test_whatsapp_connection failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "test_whatsapp_connection"),
            action="test_whatsapp_connection",
        )
    return resp.json()


@registry.register("list_system_settings")
async def list_system_settings(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    List all system settings via ``GET /api/v1/admin/settings``.
    """
    resp = await client.get("/api/v1/admin/settings")
    if resp.status_code != 200:
        raise StepError(
            f"list_system_settings failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "list_system_settings"),
            action="list_system_settings",
        )
    return resp.json()
