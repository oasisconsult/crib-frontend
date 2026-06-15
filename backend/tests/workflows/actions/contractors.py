"""Contractor actions — create and query contractors via the API."""
from __future__ import annotations

from ..engine.client_factory import RoleClient
from ..engine.context import ExecutionContext
from ..engine.exceptions import StepError
from ..engine.registry import registry


@registry.register("create_contractor")
async def create_contractor(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Create a contractor via ``POST /api/v1/contractors``.

    Input keys
    ----------
    name      : required
    specialty : category string (e.g. "plumbing", "electrical")
    phone     : contact phone
    email     : contact email
    company   : company name
    ratePerDay: numeric daily rate (UGX)
    """
    payload = {
        "name": input["name"],
        "specialty": input.get("specialty", "general"),
        "phone": input.get("phone"),
        "email": input.get("email"),
        "company": input.get("company"),
        "ratePerDay": input.get("ratePerDay"),
        "currency": input.get("currency", "UGX"),
        "notes": input.get("notes"),
    }
    # Remove None values — backend expects optional fields to be absent.
    payload = {k: v for k, v in payload.items() if v is not None}

    resp = await client.post("/api/v1/contractors", json=payload)
    if resp.status_code not in (200, 201):
        raise StepError(
            f"create_contractor failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "create_contractor"),
            action="create_contractor",
        )
    return resp.json()


@registry.register("get_contractor")
async def get_contractor(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Fetch a single contractor via ``GET /api/v1/contractors/{id}``.

    Input keys
    ----------
    contractorId : required
    """
    cid = input["contractorId"]
    resp = await client.get(f"/api/v1/contractors/{cid}")
    if resp.status_code != 200:
        raise StepError(
            f"get_contractor failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "get_contractor"),
            action="get_contractor",
        )
    return resp.json()
