"""
Landlord invite workflow actions.

Covers the independent-owner onboarding flow:
  create invite → retrieve token → complete onboarding → verify property transfer.
"""
from __future__ import annotations

from ..engine.client_factory import RoleClient
from ..engine.context import ExecutionContext
from ..engine.exceptions import StepError
from ..engine.registry import registry


@registry.register("create_landlord_invite")
async def create_landlord_invite(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Create a landlord invite via ``POST /api/v1/landlords/invites``.

    Input keys
    ----------
    email       : invitee email
    firstName   : first name
    lastName    : last name
    propertyIds : list of property UUIDs to associate (optional)
    phone       : optional phone number
    """
    payload = {
        "email": input["email"],
        "firstName": input["firstName"],
        "lastName": input["lastName"],
        "propertyIds": input.get("propertyIds", []),
        "isIndependent": input.get("isIndependent", False),
    }
    if input.get("phone"):
        payload["phone"] = input["phone"]

    resp = await client.post("/api/v1/landlords/invites", json=payload)
    if resp.status_code not in (200, 201):
        raise StepError(
            f"create_landlord_invite failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "create_landlord_invite"),
            action="create_landlord_invite",
        )
    return resp.json()


@registry.register("list_landlord_invites")
async def list_landlord_invites(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    List landlord invites via ``GET /api/v1/landlords/invites``.

    Returns a dict with ``items`` (list) and ``total``.
    Saves the first invite as ``invite`` if save_as is provided.
    """
    resp = await client.get("/api/v1/landlords/invites")
    if resp.status_code != 200:
        raise StepError(
            f"list_landlord_invites failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "list_landlord_invites"),
            action="list_landlord_invites",
        )
    data = resp.json()
    # Normalise: endpoint may return a list or a paginated dict
    if isinstance(data, list):
        return {"items": data, "total": len(data)}
    return data


@registry.register("get_landlord_onboarding")
async def get_landlord_onboarding(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Fetch invite details via the public onboarding endpoint
    ``GET /api/v1/landlords/onboarding/{token}`` (no auth required).

    Input keys
    ----------
    token : the invite token
    """
    token = input["token"]
    resp = await client.get(f"/api/v1/landlords/onboarding/{token}")
    if resp.status_code != 200:
        raise StepError(
            f"get_landlord_onboarding failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "get_landlord_onboarding"),
            action="get_landlord_onboarding",
        )
    return resp.json()
