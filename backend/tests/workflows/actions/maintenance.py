"""
Maintenance workflow actions.

Covers the full lifecycle:
  reported → assigned → in_progress → resolved → closed

All actions call real FastAPI endpoints; no business logic is bypassed.
"""
from __future__ import annotations

from ..engine.client_factory import RoleClient
from ..engine.context import ExecutionContext
from ..engine.exceptions import StepError
from ..engine.registry import registry

# Map human-friendly state names to the backend event strings.
_STATE_TO_EVENT: dict[str, str] = {
    "assigned":    "ISSUE_ASSIGNED",
    "in_progress": "ISSUE_STARTED",
    "resolved":    "ISSUE_RESOLVED",
    "closed":      "ISSUE_CLOSED",
    "cancelled":   "ISSUE_CANCELLED",
}


@registry.register("create_maintenance")
async def create_maintenance(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Report a new maintenance issue via ``POST /api/v1/maintenance``.

    Input keys
    ----------
    propertyId   : required
    title        : required
    description  : required
    category     : required (plumbing | electrical | structural | appliance | pest | security | other)
    priority     : low | medium | high | urgent  (default medium)
    reportedBy   : display name of reporter (default "Manager")
    reportedById : ID string for reporter (default "workflow-reporter")
    unitId       : optional
    leaseId      : optional
    notes        : optional
    """
    payload = {
        "propertyId": input["propertyId"],
        "title": input["title"],
        "description": input["description"],
        "category": input["category"],
        "priority": input.get("priority", "medium"),
        "reportedBy": input.get("reportedBy", "Manager"),
        "reportedById": input.get("reportedById", "workflow-reporter"),
        "unitId": input.get("unitId"),
        "leaseId": input.get("leaseId"),
        "notes": input.get("notes"),
        "photoUrls": input.get("photoUrls", []),
        "currency": input.get("currency", "UGX"),
    }
    payload = {k: v for k, v in payload.items() if v is not None}

    resp = await client.post("/api/v1/maintenance", json=payload)
    if resp.status_code not in (200, 201):
        raise StepError(
            f"create_maintenance failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "create_maintenance"),
            action="create_maintenance",
        )
    return resp.json()


@registry.register("get_maintenance")
async def get_maintenance(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Fetch a maintenance issue via ``GET /api/v1/maintenance/{id}``.

    Input keys
    ----------
    issueId : required
    """
    issue_id = input["issueId"]
    resp = await client.get(f"/api/v1/maintenance/{issue_id}")
    if resp.status_code != 200:
        raise StepError(
            f"get_maintenance failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "get_maintenance"),
            action="get_maintenance",
        )
    return resp.json()


@registry.register("transition_maintenance")
async def transition_maintenance(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Advance a maintenance issue to the next state.

    Uses ``POST /api/v1/maintenance/{id}/transition``.

    Input keys
    ----------
    issueId      : required
    toState      : human-friendly state name (assigned | in_progress | resolved | closed | cancelled)
    contractorId : optional — required when toState is 'assigned' and a specific contractor is used
    assignedTo   : optional — free-text fallback when no contractor_id
    """
    issue_id = input["issueId"]
    to_state = input["toState"]

    event = _STATE_TO_EVENT.get(to_state)
    if event is None:
        raise StepError(
            f"Unknown toState '{to_state}'. Valid values: {list(_STATE_TO_EVENT)}",
            step_name=input.get("_step_name", "transition_maintenance"),
            action="transition_maintenance",
        )

    payload: dict = {"event": event}
    if "contractorId" in input:
        payload["contractorId"] = input["contractorId"]
    if "assignedTo" in input:
        payload["assignedTo"] = input["assignedTo"]

    resp = await client.post(f"/api/v1/maintenance/{issue_id}/transition", json=payload)
    if resp.status_code not in (200, 201):
        raise StepError(
            f"transition_maintenance({to_state}) failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "transition_maintenance"),
            action="transition_maintenance",
        )
    return resp.json()


@registry.register("update_maintenance")
async def update_maintenance(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Update a maintenance issue's metadata via ``PUT /api/v1/maintenance/{id}``.

    Input keys
    ----------
    issueId     : required
    title, description, category, priority, notes, actualCost, estimatedCost : all optional
    """
    issue_id = input["issueId"]
    payload = {k: v for k, v in input.items() if k not in ("issueId", "_step_name") and v is not None}
    resp = await client.put(f"/api/v1/maintenance/{issue_id}", json=payload)
    if resp.status_code not in (200, 201):
        raise StepError(
            f"update_maintenance failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "update_maintenance"),
            action="update_maintenance",
        )
    return resp.json()


@registry.register("list_maintenance")
async def list_maintenance(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    List maintenance issues via ``GET /api/v1/maintenance``.

    Input keys (all optional)
    ----------
    state, propertyId, page, pageSize
    """
    params: dict = {}
    if "state" in input:
        params["state"] = input["state"]
    if "propertyId" in input:
        params["propertyId"] = input["propertyId"]
    params["page"] = input.get("page", 1)
    params["pageSize"] = input.get("pageSize", 50)

    resp = await client.get("/api/v1/maintenance", params=params)
    if resp.status_code != 200:
        raise StepError(
            f"list_maintenance failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "list_maintenance"),
            action="list_maintenance",
        )
    return resp.json()
