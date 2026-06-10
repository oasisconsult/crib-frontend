"""
GeoBox SDK — Geocoding & geographic hierarchy service.
"""

from __future__ import annotations

from typing import Any, Optional

from ..http import HttpTransport
from ..models import AreaResult, GeocodeLookupResponse, NearbySearchResponse


class GeocodingService:
    """
    Forward geocoding, reverse geocoding, and geographic hierarchy queries.

    Obtain via ``client.geocoding`` — do not instantiate directly.
    """

    def __init__(self, http: HttpTransport) -> None:
        self._http = http

    # ------------------------------------------------------------------
    # Geocode lookup  GET /lookup/geocode/{geocode}
    # ------------------------------------------------------------------

    async def lookup(self, geocode: str) -> GeocodeLookupResponse:
        """
        Look up a customer address by its geocode.

        Returns full address details including GDPR-gated fields (access
        instructions, contact phone) if the owner has consented.

        Args:
            geocode: 9-character code, e.g. ``UGKAN-JF5``.

        Returns:
            GeocodeLookupResponse with address details and a secure nav URL.

        Example::

            result = await client.geocoding.lookup("UGKAN-JF5")
            if result.found:
                print(result.full_address)
                print(result.nav_url)
        """
        data = await self._http.get(f"lookup/geocode/{geocode.strip().upper()}")
        return GeocodeLookupResponse(
            found=True,
            geocode=data.get("geocode") or geocode,
            full_address=data.get("full_address") or data.get("address"),
            landmark=data.get("landmark_description") or data.get("landmark"),
            access_instructions=data.get("access_instructions"),
            delivery_notes=data.get("delivery_notes"),
            contact_phone=data.get("contact_phone"),
            nav_url=data.get("nav_url"),
            admin_hierarchy=data.get("admin_hierarchy"),
        )

    # ------------------------------------------------------------------
    # Nearby areas  GET /geo/areas/nearby
    # ------------------------------------------------------------------

    async def find_nearby(
        self,
        latitude: float,
        longitude: float,
        *,
        radius_m: int = 500,
        level: int = 5,
        limit: int = 5,
    ) -> NearbySearchResponse:
        """
        Find administrative areas near a GPS coordinate.

        Ideal for presenting village/parish options after a user shares their
        location pin in a mobile or WhatsApp flow.

        Args:
            latitude:   GPS latitude.
            longitude:  GPS longitude.
            radius_m:   Search radius in metres (default 500).
            level:      Administrative level (1=District … 5=Village).
            limit:      Maximum number of results (default 5).

        Returns:
            NearbySearchResponse with a list of AreaResult objects sorted by distance.

        Example::

            nearby = await client.geocoding.find_nearby(latitude=0.3476, longitude=32.6311)
            for area in nearby.areas:
                print(area.name, area.distance_meters, "m")
        """
        data = await self._http.get(
            "geo/areas/nearby",
            params={
                "latitude":      latitude,
                "longitude":     longitude,
                "radius_meters": radius_m,
                "level":         level,
                "limit":         limit,
            },
        )
        areas = [
            AreaResult(
                id=a.get("id", ""),
                name=a.get("name", ""),
                parent_name=a.get("parent_name"),
                level=a.get("level"),
                hierarchy=a.get("hierarchy", []),
                distance_meters=a.get("distance_meters"),
            )
            for a in data.get("areas", [])
        ]
        return NearbySearchResponse(
            areas=areas,
            total=data.get("total_found", len(areas)),
        )

    # ------------------------------------------------------------------
    # Text search  GET /geo/areas/search
    # ------------------------------------------------------------------

    async def search_villages(
        self,
        query: str,
        *,
        country_code: str = "UG",
        limit: int = 10,
    ) -> list[AreaResult]:
        """
        Search for villages by name or landmark.

        Args:
            query:        Village name or nearby landmark (e.g. "Shell Ntinda").
            country_code: ISO 3166-1 alpha-2.
            limit:        Maximum results.

        Returns:
            List of matching AreaResult objects.
        """
        data = await self._http.get(
            "geo/areas/search",
            params={"query": query, "country_code": country_code, "limit": limit, "level": 5},
        )
        return [
            AreaResult(
                id=a.get("id", ""),
                name=a.get("name", ""),
                parent_name=a.get("parent_name") or a.get("division"),
                hierarchy=a.get("admin_hierarchy") or a.get("hierarchy", []),
            )
            for a in data.get("results", data.get("areas", []))
        ]

    # ------------------------------------------------------------------
    # Geographic hierarchy
    # ------------------------------------------------------------------

    async def get_countries(self) -> list[dict[str, Any]]:
        """Return all supported countries."""
        data = await self._http.get("geo/countries")
        return data if isinstance(data, list) else data.get("countries", [])

    async def get_areas(
        self,
        country_code: str,
        *,
        level: Optional[int] = None,
        parent_id: Optional[str] = None,
        limit: int = 100,
    ) -> list[AreaResult]:
        """
        List administrative areas within a country, optionally filtered by level or parent.

        Args:
            country_code: ISO 3166-1 alpha-2 (e.g. "UG").
            level:        Admin level to filter (1–5).
            parent_id:    Only return areas under this parent.
            limit:        Maximum results.
        """
        params: dict = {"limit": limit}
        if level is not None:
            params["level"] = level
        if parent_id:
            params["parent_id"] = parent_id

        data = await self._http.get(f"geo/countries/{country_code}/areas", params=params)
        return [
            AreaResult(
                id=a.get("id", ""),
                name=a.get("name", ""),
                level=a.get("level"),
                parent_name=a.get("parent_name"),
                children_count=a.get("children_count"),
            )
            for a in data.get("areas", data.get("results", []))
        ]

    async def get_area_hierarchy(self, area_id: str) -> dict[str, Any]:
        """
        Retrieve the full hierarchy path for a specific administrative area.
        """
        return await self._http.get(f"geo/hierarchy/{area_id}")
