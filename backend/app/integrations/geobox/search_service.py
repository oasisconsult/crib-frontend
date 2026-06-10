"""
GeoBox geographic search service.

Two functions: search_villages (text search) and find_nearby (GPS-based).
Both return plain dicts and never raise — callers receive [] on any failure.

DPPA 2019 compliance:
  - GPS coordinates are NOT logged (location data = personal data under DPPA s.2)
  - lat/lng rounded to 3 d.p. (~110 m) before forwarding — data minimisation (s.12)
  - centroid coordinates stripped from all responses — no frontend use case
  - Results cached in Redis so coordinates are not re-transmitted on repeated queries
"""

from __future__ import annotations

import json
from typing import Any

import structlog

from app.core.redis import get_redis
from app.integrations.geobox.client import get_geobox_client

log = structlog.get_logger(__name__)

# Uganda bounding box (validated in router, used here for documentation only)
_UG_LAT_MIN, _UG_LAT_MAX = -1.5, 4.2
_UG_LNG_MIN, _UG_LNG_MAX = 29.5, 35.0

_SEARCH_TTL  = 3600      # 1 hour  — village names change rarely
_NEARBY_TTL  = 86400     # 24 hours — geography is stable


def _area_to_dict(area: Any) -> dict[str, Any]:
    """Strip coordinate fields; keep admin hierarchy for address autofill."""
    return {
        "id":         area.id,
        "name":       area.name,
        "parentName": area.parent_name,
        # [district, county, division, parish, village] — may be empty list
        "hierarchy":  area.hierarchy if area.hierarchy else [],
    }


async def search_villages(query: str, limit: int, db: Any) -> list[dict[str, Any]]:
    """
    Text search for Ugandan villages / administrative areas.

    Args:
        query: User-supplied search string (already validated: 2–100 chars, stripped).
        limit: Maximum results (1–20).
        db:    AsyncSession for settings lookup.

    Returns:
        List of { id, name, parentName } dicts, or [] when GeoBox unavailable.
    """
    cache_key = f"geobox:search:{query.lower()}:{limit}"
    redis = get_redis()

    cached = await redis.get(cache_key)
    if cached:
        try:
            return json.loads(cached)
        except Exception:
            pass  # corrupted cache entry — fall through to live call

    async with get_geobox_client(db) as client:
        if client is None:
            return []
        try:
            areas = await client.geocoding.search_villages(
                query, country_code="UG", limit=limit
            )
            results = [_area_to_dict(a) for a in areas]
        except Exception as exc:
            # Log at DEBUG — query string not included to avoid location-intent leakage
            log.debug("geobox.search_villages.failed", error=str(exc))
            return []

    await redis.setex(cache_key, _SEARCH_TTL, json.dumps(results))
    return results


async def find_nearby(lat: float, lng: float, limit: int, db: Any) -> list[dict[str, Any]]:
    """
    Find administrative areas near a GPS coordinate.

    GPS coordinates are personal data under Uganda DPPA 2019 s.2 (location data).
    They are:
      - Rounded to 3 decimal places (~110 m precision) before use — data minimisation
      - NOT included in log output
      - NOT echoed back in the response
      - Cached so the same coordinate is not re-transmitted on repeated calls

    Args:
        lat:   GPS latitude (validated in router: within Uganda bounds).
        lng:   GPS longitude (validated in router: within Uganda bounds).
        limit: Maximum results.
        db:    AsyncSession for settings lookup.

    Returns:
        List of { id, name, parentName } dicts, or [] when GeoBox unavailable.
    """
    # Round to 3 d.p. (~110 m) — sufficient for village-level lookup, minimises precision
    lat_r = round(lat, 3)
    lng_r = round(lng, 3)

    cache_key = f"geobox:nearby:{lat_r:.3f}:{lng_r:.3f}:{limit}"
    redis = get_redis()

    cached = await redis.get(cache_key)
    if cached:
        try:
            return json.loads(cached)
        except Exception:
            pass

    async with get_geobox_client(db) as client:
        if client is None:
            return []
        try:
            # Coordinates NOT logged here — see module docstring
            response = await client.geocoding.find_nearby(
                latitude=lat_r,
                longitude=lng_r,
                level=5,
                limit=limit,
            )
            results = [_area_to_dict(a) for a in response.areas]
        except Exception as exc:
            log.debug("geobox.find_nearby.failed", error=str(exc))
            return []

    await redis.setex(cache_key, _NEARBY_TTL, json.dumps(results))
    return results
