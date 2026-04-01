"""
M2M (Machine-to-Machine) token management for Celery workers and server-side tasks.

M2M tokens are used when the backend needs to call its own API (or another service)
without a user context — scheduled jobs, payment reconciliation, notification dispatch.

Flow:
  1. Fetch a token from Logto using client_credentials grant
  2. Cache it in Redis until 60s before expiry
  3. Return the cached token on subsequent calls

The M2M app must be registered in Logto with:
  - Application type: Machine-to-Machine
  - API resource: <logto_api_resource> (same as the user-facing API)
  - Roles: assign the roles this service account needs (e.g. "service" or "superadmin")

The resulting token has:
  - sub: <m2m_app_id>
  - aud: <logto_api_resource>
  - NO organization_id (M2M is cross-org by design)
  - roles: whatever roles are assigned to the M2M app in Logto
"""

from __future__ import annotations

import json
import time

import httpx

from app.core.config import get_settings
from app.core.redis import get_redis

settings = get_settings()

M2M_TOKEN_CACHE_KEY = "m2m:access_token"
M2M_REFRESH_BUFFER = 60  # refresh 60s before expiry


async def get_m2m_token() -> str:
    """
    Return a valid M2M access token, fetching a new one if needed.
    Cached in Redis to avoid hammering Logto on every task.
    """
    redis = get_redis()

    # Check cache first
    cached = await redis.get(M2M_TOKEN_CACHE_KEY)
    if cached:
        data = json.loads(cached)
        # Validate it's not about to expire
        if data.get("expires_at", 0) > time.time() + M2M_REFRESH_BUFFER:
            return data["token"]

    # Fetch a new token
    token_url = f"{settings.logto_endpoint}oidc/token"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            token_url,
            data={
                "grant_type": "client_credentials",
                "client_id": settings.logto_m2m_app_id,
                "client_secret": settings.logto_m2m_app_secret,
                "resource": settings.logto_api_resource,
                "scope": "all",  # adjust to the scopes your M2M app needs
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        resp.raise_for_status()
        token_data = resp.json()

    access_token: str = token_data["access_token"]
    expires_in: int = token_data.get("expires_in", 3600)

    # Cache with TTL slightly shorter than the token's actual expiry
    cache_ttl = max(expires_in - M2M_REFRESH_BUFFER, 30)
    await redis.setex(
        M2M_TOKEN_CACHE_KEY,
        cache_ttl,
        json.dumps({"token": access_token, "expires_at": time.time() + expires_in}),
    )

    return access_token
