"""
Inspector onboarding workflow actions.

Covers the full lifecycle:
  create inspector contractor → create inspection → assign inspector →
  inspector portal GET → inspector portal submit → verify state transition.
"""
from __future__ import annotations

from ..engine.client_factory import RoleClient
from ..engine.context import ExecutionContext
from ..engine.exceptions import StepError
from ..engine.registry import registry


@registry.register("create_inspection")
async def create_inspection(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Create an inspection via ``POST /api/v1/inspections``.

    Input keys
    ----------
    propertyId      : required
    unitId          : optional
    type            : required (move_in | move_out | routine | maintenance | complaint)
    scheduledDate   : required (YYYY-MM-DD)
    scheduledTimeSlot : optional
    inspectorName   : optional free-text inspector name
    checklist       : optional list of checklist item dicts
    """
    payload = {
        "propertyId": input["propertyId"],
        "unitId": input.get("unitId"),
        "type": input["type"],
        "scheduledDate": input["scheduledDate"],
        "scheduledTimeSlot": input.get("scheduledTimeSlot"),
        "inspectorName": input.get("inspectorName"),
        "checklist": input.get("checklist", []),
    }
    payload = {k: v for k, v in payload.items() if v is not None}

    resp = await client.post("/api/v1/inspections", json=payload)
    if resp.status_code not in (200, 201):
        raise StepError(
            f"create_inspection failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "create_inspection"),
            action="create_inspection",
        )
    return resp.json()


@registry.register("get_inspection")
async def get_inspection(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Fetch a single inspection via ``GET /api/v1/inspections/{id}``.

    Input keys
    ----------
    inspectionId : required
    """
    iid = input["inspectionId"]
    resp = await client.get(f"/api/v1/inspections/{iid}")
    if resp.status_code != 200:
        raise StepError(
            f"get_inspection failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "get_inspection"),
            action="get_inspection",
        )
    return resp.json()


@registry.register("create_inspector_contractor")
async def create_inspector_contractor(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Create a contractor with is_inspector=true via ``POST /api/v1/contractors``.

    Input keys
    ----------
    name    : required
    email   : optional (used for invite notification)
    phone   : optional
    """
    payload = {
        "name": input["name"],
        "email": input.get("email"),
        "phone": input.get("phone"),
        "isInspector": True,
        "isActive": True,
    }
    payload = {k: v for k, v in payload.items() if v is not None}

    resp = await client.post("/api/v1/contractors", json=payload)
    if resp.status_code not in (200, 201):
        raise StepError(
            f"create_inspector_contractor failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "create_inspector_contractor"),
            action="create_inspector_contractor",
        )
    return resp.json()


@registry.register("assign_inspector")
async def assign_inspector(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Assign an inspector-contractor to an inspection via
    ``POST /api/v1/inspections/{id}/assign-inspector``.

    Input keys
    ----------
    inspectionId  : required
    contractorId  : required
    expiresInDays : optional (default 7)
    """
    iid = input["inspectionId"]
    payload = {
        "contractorId": input["contractorId"],
        "expiresInDays": input.get("expiresInDays", 7),
    }
    resp = await client.post(f"/api/v1/inspections/{iid}/assign-inspector", json=payload)
    if resp.status_code != 200:
        raise StepError(
            f"assign_inspector failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "assign_inspector"),
            action="assign_inspector",
        )
    return resp.json()


@registry.register("inspector_portal_get")
async def inspector_portal_get(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Retrieve the inspector portal data via the public token endpoint
    ``GET /api/v1/inspections/portal/{token}`` (no auth).

    Input keys
    ----------
    inspectorToken : required
    """
    token = input["inspectorToken"]
    # Use an unauthenticated GET — the token is the auth mechanism
    resp = await client.get(
        f"/api/v1/inspections/portal/{token}",
        headers={"Authorization": ""},  # clear any JWT
    )
    if resp.status_code != 200:
        raise StepError(
            f"inspector_portal_get failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "inspector_portal_get"),
            action="inspector_portal_get",
        )
    return resp.json()


@registry.register("inspector_portal_submit")
async def inspector_portal_submit(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Submit inspector findings via the public token endpoint
    ``POST /api/v1/inspections/portal/{token}`` (no auth).

    Input keys
    ----------
    inspectorToken     : required
    checklist          : list of checklist item dicts with condition/notes
    overallCondition   : optional
    summary            : optional
    recommendations    : optional
    photoUrls          : optional list of URL strings
    """
    token = input["inspectorToken"]
    payload = {
        "checklist": input.get("checklist", []),
        "overallCondition": input.get("overallCondition"),
        "summary": input.get("summary"),
        "recommendations": input.get("recommendations"),
        "photoUrls": input.get("photoUrls", []),
    }
    payload = {k: v for k, v in payload.items() if v is not None}

    resp = await client.post(
        f"/api/v1/inspections/portal/{token}",
        json=payload,
        headers={"Authorization": ""},  # clear any JWT
    )
    if resp.status_code != 200:
        raise StepError(
            f"inspector_portal_submit failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "inspector_portal_submit"),
            action="inspector_portal_submit",
        )
    return resp.json()


@registry.register("transition_inspection")
async def transition_inspection(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Transition an inspection state via
    ``POST /api/v1/inspections/{id}/transition``.

    Input keys
    ----------
    inspectionId : required
    event        : required (INSPECTION_APPROVED, INSPECTION_FAILED, etc.)
    """
    iid = input["inspectionId"]
    payload = {"event": input["event"]}
    resp = await client.post(f"/api/v1/inspections/{iid}/transition", json=payload)
    if resp.status_code != 200:
        raise StepError(
            f"transition_inspection failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "transition_inspection"),
            action="transition_inspection",
        )
    return resp.json()
