"""
GeoBox geocode resolution service.

`resolve(geocode, db)` is the single entry point used by Crib's property and unit
endpoints. It returns a structured dict or None — never raises.

Callers must treat None as "GeoBox unavailable / unconfigured" and degrade
gracefully (e.g. return { "geocode": null } to the API consumer) per Principle P1.
"""

from __future__ import annotations

from typing import Any

import structlog

from app.integrations.geobox.client import get_geobox_client

log = structlog.get_logger(__name__)


async def resolve(geocode: str, db) -> dict[str, Any] | None:  # type: ignore[no-untyped-def]
    """
    Resolve a GeoBox geocode to its structured address data.

    Returns a dict with the following keys (all optional from GeoBox — may be None):
      full_address, landmark_description, access_instructions,
      delivery_notes, nav_url, coordinates

    Returns None when:
      - GeoBox credentials are absent or geocoding is disabled
      - The geocode is not found (404 from GeoBox)
      - Any network or authentication error
    """
    async with get_geobox_client(db) as client:
        if client is None:
            return None
        raw = await client.geocoding.lookup(geocode)
        if raw is None:
            return None
        return {
            "geocode":               raw.get("geocode", geocode),
            "full_address":          raw.get("full_address") or raw.get("address"),
            "landmark_description":  raw.get("landmark_description"),
            "access_instructions":   raw.get("access_instructions"),
            "delivery_notes":        raw.get("delivery_notes"),
            "nav_url":               raw.get("nav_url"),
            "coordinates":           raw.get("coordinates"),
        }
