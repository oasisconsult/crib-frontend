"""
GeoBox geographic search proxy endpoints.

GET /geobox/villages/search  — text search for Ugandan villages
GET /geobox/areas/nearby     — GPS-based nearby area lookup

Both endpoints:
  - Require an authenticated org user (allow_tenant_own=True — Phase 4 will use these
    endpoints during tenant onboarding)
  - Return { areas: [], total: 0 } when GeoBox is unconfigured — never 500
  - Are cached in Redis (search: 1 h, nearby: 24 h) to stay within GeoBox rate limits

DPPA 2019 — nearby endpoint:
  - GPS coordinates are validated to Uganda's bounding box; coordinates outside are
    rejected with 422 rather than forwarded to GeoBox
  - Coordinate values are not logged or echoed back in the response
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_org_access
from app.core.database import get_db
from app.integrations.geobox import search_service
from app.schemas.common import CamelModel

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/geobox", tags=["geobox"])

# Intentionally allow_tenant_own=True — Phase 4 WhatsApp onboarding will need tenants
# to search villages during their onboarding flow.
_auth = Depends(require_org_access(allow_tenant_own=True))

# Uganda bounding box — lat/lng outside this range are rejected (not silently clamped)
_UG_LAT_MIN, _UG_LAT_MAX = -1.5, 4.2
_UG_LNG_MIN, _UG_LNG_MAX = 29.5, 35.0


# ── Response schema ──────────────────────────────────────────────────────────

class AreaOut(CamelModel):
    id: str
    name: str
    parent_name: str | None = None


class AreaSearchResponse(CamelModel):
    areas: list[AreaOut]
    total: int


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/villages/search", response_model=AreaSearchResponse)
async def search_villages(
    q: str = Query(..., min_length=2, max_length=100, description="Village name or landmark"),
    limit: int = Query(10, ge=1, le=20),
    _: object = _auth,
    db: AsyncSession = Depends(get_db),
) -> AreaSearchResponse:
    """
    Search for Ugandan villages or administrative areas by name.

    Returns up to `limit` matching areas. Returns an empty list (not an error) when
    GeoBox credentials are not configured or the service is unreachable.

    Results are cached for 1 hour — geographic names change rarely.
    """
    areas = await search_service.search_villages(q.strip(), limit, db)
    return AreaSearchResponse(areas=[AreaOut(**a) for a in areas], total=len(areas))


@router.get("/areas/nearby", response_model=AreaSearchResponse)
async def areas_nearby(
    lat: float = Query(..., description="GPS latitude"),
    lng: float = Query(..., description="GPS longitude"),
    limit: int = Query(5, ge=1, le=10),
    _: object = _auth,
    db: AsyncSession = Depends(get_db),
) -> AreaSearchResponse:
    """
    Find administrative areas near a GPS coordinate.

    Coordinates must be within Uganda's geographic bounds; requests outside this range
    are rejected with 422. GPS values are not logged or returned in the response.

    Results are cached for 24 hours — geographic boundaries do not change.
    """
    if not (_UG_LAT_MIN <= lat <= _UG_LAT_MAX and _UG_LNG_MIN <= lng <= _UG_LNG_MAX):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Coordinates are outside Uganda. Only Ugandan locations are supported.",
        )

    # DPPA s.12 data minimisation: round to 3 d.p. before forwarding to service/cache
    lat = round(lat, 3)
    lng = round(lng, 3)
    areas = await search_service.find_nearby(lat, lng, limit, db)
    return AreaSearchResponse(areas=[AreaOut(**a) for a in areas], total=len(areas))
