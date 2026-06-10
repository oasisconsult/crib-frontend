"""
GeoBox Smart Addressing — factory for the official GeoBox Python SDK client.

Usage:
    async with get_geobox_client(db) as client:
        if client is None:
            # GeoBox not configured or disabled — caller degrades gracefully
            return None
        result = await client.geocoding.lookup("UGKAN-JF5")

Design principles:
  P1 — Yields None rather than raising when credentials are absent or the
       feature is disabled.  Callers must handle None without surfacing
       errors to users.
  P3 — All GeoBox HTTP calls go through this module; credentials never reach
       the Next.js frontend.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

import structlog

log = structlog.get_logger(__name__)


@asynccontextmanager
async def get_geobox_client(db):  # type: ignore[no-untyped-def]
    """
    Async context manager that yields an official GeoBoxClient or None.

    Yields None (without raising) when:
      - geobox.client_id or geobox.client_secret are not configured
      - geobox.geocoding_enabled is false
      - the token exchange or connection setup fails

    The yielded value is the official GeoBox Python SDK's GeoBoxClient,
    authenticated via OAuth 2.0 client credentials.
    """
    from geobox import GeoBoxClient
    from app.services.settings_service import get_geobox_config

    config = await get_geobox_config(db)
    if not config["geocoding_enabled"] or not config["client_id"] or not config["client_secret"]:
        yield None
        return

    environment = config["environment"]
    sandbox = environment != "production"

    try:
        async with GeoBoxClient(
            client_id=config["client_id"],
            client_secret=config["client_secret"],
            sandbox=sandbox,
            scope="address:search address:read address:verify areas:read",
        ) as client:
            yield client
    except Exception as exc:
        log.warning("geobox.client_init_failed", error=str(exc))
        yield None
