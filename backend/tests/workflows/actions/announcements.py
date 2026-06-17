"""
Announcement workflow actions — create and list bulk tenant announcements.
"""
from __future__ import annotations

from ..engine.client_factory import RoleClient
from ..engine.context import ExecutionContext
from ..engine.exceptions import StepError
from ..engine.registry import registry


@registry.register("create_announcement")
async def create_announcement(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Create a bulk announcement via ``POST /api/v1/announcements``.

    Input keys
    ----------
    title    : required
    body     : required
    channels : list of channels (default ["in_app"])
    """
    payload = {
        "title": input.get("title", "Test Announcement"),
        "body": input.get("body", "This is a workflow test announcement."),
        "channels": input.get("channels", ["in_app"]),
    }
    resp = await client.post("/api/v1/announcements", json=payload)
    if resp.status_code not in (200, 201):
        raise StepError(
            f"create_announcement failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "create_announcement"),
            action="create_announcement",
        )
    return resp.json()


@registry.register("list_announcements")
async def list_announcements(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    List announcements via ``GET /api/v1/announcements``.

    Returns the paginated response dict including ``data`` list and ``total``.
    """
    params = {
        "page": input.get("page", 1),
        "pageSize": input.get("pageSize", 20),
    }
    resp = await client.get("/api/v1/announcements", params=params)
    if resp.status_code != 200:
        raise StepError(
            f"list_announcements failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "list_announcements"),
            action="list_announcements",
        )
    return resp.json()
