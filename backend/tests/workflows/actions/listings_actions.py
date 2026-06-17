"""
Vacancy listings workflow actions — public listing discovery.
"""
from __future__ import annotations

from ..engine.client_factory import RoleClient
from ..engine.context import ExecutionContext
from ..engine.exceptions import StepError
from ..engine.registry import registry


@registry.register("list_public_listings")
async def list_public_listings(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Fetch public vacancy listings via ``GET /api/v1/public/listings``.
    No authentication required — this is a public endpoint.

    Input keys (all optional filters)
    ----------------------------------
    unitType, district, minRent, maxRent, page, pageSize
    """
    # Endpoint uses snake_case query params: page_size, unit_type, max_rent, min_rent
    params: dict = {"page": input.get("page", 1), "page_size": input.get("pageSize", 20)}
    if "unitType" in input:
        params["unit_type"] = input["unitType"]
    if "district" in input:
        params["district"] = input["district"]
    if "minRent" in input:
        params["min_rent"] = input["minRent"]
    if "maxRent" in input:
        params["max_rent"] = input["maxRent"]

    resp = await client.get("/api/v1/public/listings", params=params)
    if resp.status_code != 200:
        raise StepError(
            f"list_public_listings failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "list_public_listings"),
            action="list_public_listings",
        )
    data = resp.json()
    return {
        "statusCode": resp.status_code,
        "items": data.get("items", []),
        "total": data.get("total", 0),
        "page": data.get("page", 1),
        "pageSize": data.get("pageSize", 20),
    }


@registry.register("update_org_settings")
async def update_org_settings(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Update organisation contact settings via ``PATCH /api/v1/organisations/me``.

    Input keys (all optional)
    --------------------------
    contactPhone, contactEmail
    """
    payload: dict = {}
    if "contactPhone" in input:
        payload["contactPhone"] = input["contactPhone"]
    if "contactEmail" in input:
        payload["contactEmail"] = input["contactEmail"]

    resp = await client.patch("/api/v1/organisations/me", json=payload)
    if resp.status_code != 200:
        raise StepError(
            f"update_org_settings failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "update_org_settings"),
            action="update_org_settings",
        )
    return resp.json()
