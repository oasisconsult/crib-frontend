"""
GeoBox Smart Addressing — async HTTP client for the Crib backend.

The GeoBox Python SDK does not exist; this thin client mirrors the TypeScript SDK's
authentication model (OAuth 2.0 client credentials, token cached until expiry - 60s)
and exposes the GeoBox API namespaces that Crib needs.

Usage:
    async with get_geobox_client(db) as client:
        if client is None:
            # GeoBox not configured or disabled — caller degrades gracefully
            return None
        result = await client.geocoding.lookup("UGKAN-JF5")

Design principles (from the integration plan):
  P1 — Returns None rather than raising when credentials are absent or the feature
       is disabled.  Callers must handle None without surfacing errors to users.
  P3 — All GeoBox HTTP calls go through this module; credentials never reach the
       Next.js frontend.
"""

from __future__ import annotations

import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any

import httpx
import structlog

log = structlog.get_logger(__name__)

_PRODUCTION_BASE = "https://api.geoboxafrica.com/v1"
_STAGING_BASE    = "https://api.staging.geoboxafrica.com/v1"
_PRODUCTION_TOKEN_URL = "https://api.geoboxafrica.com/billing/auth/clients/token"
_STAGING_TOKEN_URL    = "https://api.staging.geoboxafrica.com/billing/auth/clients/token"
_PRODUCTION_RESOURCE  = "https://api.geoboxafrica.com"
_STAGING_RESOURCE     = "https://api.staging.geoboxafrica.com/v1"

_REFRESH_BUFFER_S = 60   # refresh token this many seconds before expiry


# ── Token cache (process-level, one per environment) ─────────────────────────

@dataclass
class _TokenCache:
    access_token: str = ""
    expires_at: float = 0.0   # time.monotonic()


_cache: dict[str, _TokenCache] = {}   # keyed by environment ("sandbox" / "production")


async def _get_token(
    client_id: str,
    client_secret: str,
    environment: str,
    http: httpx.AsyncClient,
) -> str:
    cache = _cache.setdefault(environment, _TokenCache())
    if cache.access_token and time.monotonic() < cache.expires_at - _REFRESH_BUFFER_S:
        return cache.access_token

    is_sandbox = environment != "production"
    token_url = _STAGING_TOKEN_URL if is_sandbox else _PRODUCTION_TOKEN_URL
    resource  = _STAGING_RESOURCE  if is_sandbox else _PRODUCTION_RESOURCE

    resp = await http.post(
        token_url,
        data={
            "grant_type":    "client_credentials",
            "client_id":     client_id,
            "client_secret": client_secret,
            "resource":      resource,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    resp.raise_for_status()
    body = resp.json()
    cache.access_token = body["access_token"]
    cache.expires_at   = time.monotonic() + int(body.get("expires_in", 3600))
    return cache.access_token


# ── Service namespaces ────────────────────────────────────────────────────────

class GeocodingClient:
    """Proxies GeoBox geocoding endpoints."""

    def __init__(self, http: httpx.AsyncClient, base_url: str) -> None:
        self._http = http
        self._base = base_url

    async def lookup(self, geocode: str) -> dict[str, Any] | None:
        try:
            resp = await self._http.get(f"{self._base}/lookup/geocode/{geocode.strip().upper()}")
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            log.warning("geobox.geocoding.lookup_failed", geocode=geocode, error=str(exc))
            return None

    async def search_villages(
        self,
        query: str,
        limit: int = 10,
    ) -> dict[str, Any]:
        try:
            resp = await self._http.get(
                f"{self._base}/geo/areas/search",
                params={"query": query, "country_code": "UG", "limit": limit, "level": 5},
            )
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            log.warning("geobox.geocoding.search_failed", query=query, error=str(exc))
            return {"areas": [], "total": 0}

    async def find_nearby(
        self,
        lat: float,
        lng: float,
        limit: int = 5,
    ) -> dict[str, Any]:
        try:
            resp = await self._http.get(
                f"{self._base}/geo/areas/nearby",
                params={"latitude": lat, "longitude": lng, "radius_meters": 500, "level": 5, "limit": limit},
            )
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            log.warning("geobox.geocoding.nearby_failed", lat=lat, lng=lng, error=str(exc))
            return {"areas": [], "total": 0}


class GeoBoxClient:
    """Top-level GeoBox client — mirrors the TypeScript SDK's namespace layout."""

    def __init__(self, http: httpx.AsyncClient, base_url: str) -> None:
        self.geocoding = GeocodingClient(http, base_url)


# ── Factory ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def get_geobox_client(db):  # type: ignore[no-untyped-def]
    """
    Async context manager that yields a GeoBoxClient or None.

    Yields None (without raising) when:
      - geobox.client_id or geobox.client_secret are not configured
      - geobox.geocoding_enabled is false
      - the token exchange fails

    Example:
        async with get_geobox_client(db) as client:
            if client is None:
                return None   # degrade gracefully
            result = await client.geocoding.lookup(geocode)
    """
    from app.services.settings_service import get_geobox_config

    config = await get_geobox_config(db)
    if not config["geocoding_enabled"] or not config["client_id"] or not config["client_secret"]:
        yield None
        return

    environment = config["environment"]
    base_url    = _STAGING_BASE if environment != "production" else _PRODUCTION_BASE

    async with httpx.AsyncClient(timeout=20.0) as http:
        try:
            token = await _get_token(
                config["client_id"],
                config["client_secret"],
                environment,
                http,
            )
            http.headers.update({"Authorization": f"Bearer {token}"})
            yield GeoBoxClient(http, base_url)
        except Exception as exc:
            log.warning("geobox.client_init_failed", error=str(exc))
            yield None
