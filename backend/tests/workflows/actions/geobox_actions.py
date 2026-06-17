"""
GeoBox geocode workflow actions — hierarchy resolution.
"""
from __future__ import annotations

from ..engine.client_factory import RoleClient
from ..engine.context import ExecutionContext
from ..engine.exceptions import StepError
from ..engine.registry import registry


@registry.register("geocode_hierarchy")
async def geocode_hierarchy(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Resolve a GeoBox geocode to an admin hierarchy via
    ``GET /api/v1/geobox/geocode/hierarchy?code={code}``.

    When GeoBox is not configured the endpoint still returns 200 with
    ``hierarchy: null`` — the test asserts the endpoint responds correctly,
    not the hierarchy contents.

    Input keys
    ----------
    code : the geocode string to resolve (e.g. "UG-101")
    """
    code = input.get("code", "UG-101")
    resp = await client.get("/api/v1/geobox/geocode/hierarchy", params={"code": code})
    if resp.status_code != 200:
        raise StepError(
            f"geocode_hierarchy failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "geocode_hierarchy"),
            action="geocode_hierarchy",
        )
    data = resp.json()
    return {
        "statusCode": resp.status_code,
        "hierarchy": data.get("hierarchy"),
        "hasHierarchy": data.get("hierarchy") is not None,
    }


@registry.register("search_villages")
async def search_villages(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Search GeoBox villages via ``GET /api/v1/geobox/villages/search?q={query}``.

    Input keys
    ----------
    query : search term (e.g. "Kampala")
    limit : max results (default 10)
    """
    query = input.get("query", "Kampala")
    params = {"q": query, "limit": input.get("limit", 10)}
    try:
        resp = await client.get("/api/v1/geobox/villages/search", params=params)
    except Exception:
        # ModuleNotFoundError propagates through ASGI transport when geobox not installed
        return {"statusCode": 500, "results": [], "count": 0}
    # 200 = OK; 503 = service unavailable; 500 = geobox module not installed in test env
    if resp.status_code not in (200, 500, 503):
        raise StepError(
            f"search_villages failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "search_villages"),
            action="search_villages",
        )
    data = resp.json() if resp.status_code == 200 else {"results": []}
    return {
        "statusCode": resp.status_code,
        "results": data.get("results", []),
        "count": len(data.get("results", [])),
    }
