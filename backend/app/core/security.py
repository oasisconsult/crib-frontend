"""
JWT validation against Logto's JWKS endpoint.

Flow:
  1. Fetch JWKS from Logto (cached in Redis, refreshed every 5 min)
  2. Decode + verify the Bearer token
  3. Extract sub, organization_id, organization_roles claims
  4. In development mode, honour X-Dev-User-Id header for quick local testing

Token shape (Logto org-scoped token):
  {
    "sub":                "usr_abc123",
    "iss":                "http://localhost:3001/oidc",
    "aud":                "https://crib.app/api",
    "organization_id":    "org_xyz789",
    "organization_roles": ["manager"],
    ...
  }
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field

import httpx
from fastapi import HTTPException, Request, status
from jose import JWTError, jwt

from app.core.config import get_settings
from app.core.redis import get_redis

settings = get_settings()

JWKS_CACHE_KEY = "logto:jwks"
JWKS_CACHE_TTL = 300  # 5 minutes


# ── Dev fixture users ──────────────────────────────────────────────────────────

@dataclass
class TokenClaims:
    sub: str
    org_id: str | None = None
    org_roles: list[str] = field(default_factory=list)
    email: str | None = None
    name: str | None = None


DEV_USERS: dict[str, TokenClaims] = {
    "owner-1": TokenClaims(
        sub="dev_owner1",
        org_id="org_dev",
        org_roles=["owner"],
        email="owner@dev.local",
        name="Dev Owner",
    ),
    "manager-1": TokenClaims(
        sub="dev_manager1",
        org_id="org_dev",
        org_roles=["manager"],
        email="manager@dev.local",
        name="Dev Manager",
    ),
    "tenant-1": TokenClaims(
        sub="dev_tenant1",
        org_id="org_dev",
        org_roles=["tenant"],
        email="tenant@dev.local",
        name="Dev Tenant",
    ),
    "tenant-2": TokenClaims(
        sub="dev_tenant2",
        org_id="org_dev",
        org_roles=["tenant"],
        email="tenant2@dev.local",
        name="Dev Tenant 2",
    ),
    "superadmin-1": TokenClaims(
        sub="dev_superadmin1",
        org_id=None,
        org_roles=["superadmin"],
        email="superadmin@dev.local",
        name="Dev Superadmin",
    ),
}


# ── JWKS helpers ──────────────────────────────────────────────────────────────

async def _fetch_jwks() -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(settings.logto_jwks_uri)
        resp.raise_for_status()
        return resp.json()


async def _get_jwks() -> dict:
    """Return JWKS, using Redis as a short-lived cache."""
    redis = get_redis()
    cached = await redis.get(JWKS_CACHE_KEY)
    if cached:
        return json.loads(cached)

    jwks = await _fetch_jwks()
    await redis.setex(JWKS_CACHE_KEY, JWKS_CACHE_TTL, json.dumps(jwks))
    return jwks


# ── Token validation ──────────────────────────────────────────────────────────

async def decode_token(token: str) -> TokenClaims:
    """Validate a Logto JWT and extract our required claims."""
    try:
        jwks = await _get_jwks()
        payload = jwt.decode(
            token,
            jwks,
            algorithms=["RS256", "ES256"],
            audience=settings.logto_api_resource,
            issuer=settings.logto_issuer,
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable",
        ) from exc

    return TokenClaims(
        sub=payload["sub"],
        org_id=payload.get("organization_id"),
        org_roles=payload.get("organization_roles", []),
        email=payload.get("email"),
        name=payload.get("name"),
    )


# ── Request-level dependency ──────────────────────────────────────────────────

async def extract_token_claims(request: Request) -> TokenClaims:
    """
    FastAPI dependency: returns TokenClaims for the current request.

    In development mode, X-Dev-User-Id header is accepted as a bypass.
    In all other environments, a valid Bearer JWT is required.
    """
    if settings.is_dev:
        dev_id = request.headers.get("X-Dev-User-Id")
        if dev_id and dev_id in DEV_USERS:
            return DEV_USERS[dev_id]

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = auth_header.removeprefix("Bearer ").strip()
    return await decode_token(token)
