"""
Tenant screening workflow actions — create, update checklist, decide.
"""
from __future__ import annotations

from ..engine.client_factory import RoleClient
from ..engine.context import ExecutionContext
from ..engine.exceptions import StepError
from ..engine.registry import registry


@registry.register("create_screening")
async def create_screening(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Create a tenant screening via ``POST /api/v1/screenings``.

    Input keys
    ----------
    applicantName  : required
    unitId         : optional (UUID of unit being applied for)
    applicantPhone : optional
    applicantEmail : optional
    notes          : optional
    """
    payload = {
        "applicantName": input["applicantName"],
        "applicantPhone": input.get("applicantPhone"),
        "applicantEmail": input.get("applicantEmail"),
        "unitId": input.get("unitId"),
        "notes": input.get("notes"),
    }
    resp = await client.post("/api/v1/screenings", json=payload)
    if resp.status_code not in (200, 201):
        raise StepError(
            f"create_screening failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "create_screening"),
            action="create_screening",
        )
    return resp.json()


@registry.register("update_screening")
async def update_screening(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Update a screening (checklist patch) via ``PATCH /api/v1/screenings/{id}``.

    Input keys
    ----------
    screeningId : required
    checklist   : list of {key, checked, notes} partial updates
    notes       : optional general notes update
    """
    screening_id = input["screeningId"]
    payload: dict = {}
    if "checklist" in input:
        payload["checklist"] = input["checklist"]
    if "notes" in input:
        payload["notes"] = input["notes"]

    resp = await client.patch(f"/api/v1/screenings/{screening_id}", json=payload)
    if resp.status_code != 200:
        raise StepError(
            f"update_screening failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "update_screening"),
            action="update_screening",
        )
    return resp.json()


@registry.register("decide_screening")
async def decide_screening(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Approve or reject a screening via ``POST /api/v1/screenings/{id}/decide``.

    Input keys
    ----------
    screeningId : required
    decision    : "approved" | "rejected"
    notes       : optional decision notes
    """
    screening_id = input["screeningId"]
    payload = {
        "decision": input["decision"],
        "notes": input.get("notes"),
    }
    resp = await client.post(f"/api/v1/screenings/{screening_id}/decide", json=payload)
    if resp.status_code != 200:
        raise StepError(
            f"decide_screening failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "decide_screening"),
            action="decide_screening",
        )
    return resp.json()


@registry.register("get_screening")
async def get_screening(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Fetch a single screening via ``GET /api/v1/screenings/{id}``.

    Input keys
    ----------
    screeningId : required
    """
    screening_id = input["screeningId"]
    resp = await client.get(f"/api/v1/screenings/{screening_id}")
    if resp.status_code != 200:
        raise StepError(
            f"get_screening failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "get_screening"),
            action="get_screening",
        )
    return resp.json()


@registry.register("list_screenings")
async def list_screenings(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    List screenings via ``GET /api/v1/screenings``.

    Input keys (all optional filters)
    ----------------------------------
    unitId, status, page, pageSize
    """
    params: dict = {"page": input.get("page", 1), "pageSize": input.get("pageSize", 20)}
    if "unitId" in input:
        params["unit_id"] = input["unitId"]
    if "status" in input:
        params["status"] = input["status"]

    resp = await client.get("/api/v1/screenings", params=params)
    if resp.status_code != 200:
        raise StepError(
            f"list_screenings failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "list_screenings"),
            action="list_screenings",
        )
    return resp.json()
