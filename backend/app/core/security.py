"""
JWT validation for both user tokens and M2M tokens.

Two token types are accepted:

1. User token (from Logto OIDC flow):
   {
     "sub":                "usr_abc123",       ← Logto user ID
     "iss":                "http://logto/oidc",
     "aud":                "http://localhost:8001",
     "organization_id":    "org_xyz",
     "organization_roles": ["owner"],
   }

2. M2M token (from client_credentials grant):
   {
     "sub":   "m2m_app_id",                    ← M2M app ID, not a user
     "iss":   "http://logto/oidc",
     "aud":   "http://localhost:8001",
     "roles": ["service"],                     ← app-level roles, no org context
   }

Both are validated against the same JWKS endpoint and audience.
The caller distinguishes them via TokenClaims.is_m2m.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field

import httpx
from fastapi import HTTPException, Request, status
from jose import JWTError, jwt

from app.core.config import get_settings
from app.core.redis import get_redis

settings = get_settings()

JWKS_CACHE_KEY = "logto:jwks"
JWKS_CACHE_TTL = 300  # 5 minutes


# ── Token claims ──────────────────────────────────────────────────────────────


@dataclass
class TokenClaims:
    sub: str
    org_id: str | None = None
    org_roles: list[str] = field(default_factory=list)
    app_roles: list[str] = field(default_factory=list)  # M2M app-level roles
    email: str | None = None
    name: str | None = None
    is_m2m: bool = False  # True when sub is an M2M app, not a user

    def has_org_role(self, *roles: str) -> bool:
        return any(r in self.org_roles for r in roles)

    def has_app_role(self, *roles: str) -> bool:
        return any(r in self.app_roles for r in roles)


# ── Dev fixture users (development only) ─────────────────────────────────────

DEV_USERS: dict[str, TokenClaims] = {
    "user-landlord-1": TokenClaims(
        sub="dev_owner1",
        org_id="org_dev",
        org_roles=["owner"],
        email="robert@crib.ug",
        name="Robert Mukasa",
    ),
    "user-manager-1": TokenClaims(
        sub="dev_manager1",
        org_id="org_dev",
        org_roles=["manager"],
        email="sarah@crib.ug",
        name="Sarah Nalwanga",
    ),
    "user-superadmin-1": TokenClaims(
        sub="dev_superadmin1",
        org_roles=["superadmin"],
        email="admin@crib.ug",
        name="Crib Admin",
    ),
    "tenant-1": TokenClaims(
        sub="dev_tenant1",
        org_id="org_dev",
        org_roles=["tenant"],
        email="tenant@dev.local",
        name="Dev Tenant",
    ),
    # Multi-role fixtures — e.g. a platform superadmin who also manages an org
    "superadmin-manager-1": TokenClaims(
        sub="dev_superadmin_manager1",
        org_id="org_dev",
        org_roles=["superadmin", "manager"],
        email="super.manager@crib.ug",
        name="Super Manager",
    ),
    "owner-manager-1": TokenClaims(
        sub="dev_owner_manager1",
        org_id="org_dev",
        org_roles=["owner", "manager"],
        email="owner.manager@crib.ug",
        name="Owner Manager",
    ),
    # Short aliases for tests
    "tenant-2": TokenClaims(sub="dev_tenant2", org_id="org_dev", org_roles=["tenant"], email="tenant2@dev.local"),
    "owner-1": TokenClaims(sub="dev_owner1", org_id="org_dev", org_roles=["owner"], email="owner@dev.local"),
    "manager-1": TokenClaims(
        sub="dev_manager1", org_id="org_dev", org_roles=["manager"], email="manager@dev.local"
    ),
    "superadmin-1": TokenClaims(sub="dev_superadmin1", org_roles=["superadmin"], email="superadmin@dev.local"),
    # Cross-org isolation test fixtures — org_alpha and org_beta must be seeded by the test.
    "org-a-owner": TokenClaims(sub="org_a_owner_1", org_id="org_alpha", org_roles=["owner"], email="owner@org-alpha.test"),
    "org-b-owner": TokenClaims(sub="org_b_owner_1", org_id="org_beta",  org_roles=["owner"], email="owner@org-beta.test"),
    "org-a-ro-landlord": TokenClaims(sub="org_a_landlord_1", org_id="org_alpha", org_roles=["landlord"], email="landlord@org-alpha.test"),
    # Landlord fixture — no org, uses app-level landlord role
    "landlord-1": TokenClaims(
        sub="dev_landlord1",
        org_id=None,
        org_roles=["landlord"],
        app_roles=["landlord"],
        email="landlord@dev.local",
        name="Dev Landlord",
    ),
}


# ── JWKS helpers ──────────────────────────────────────────────────────────────


async def _fetch_jwks() -> dict:
    # Use JWKS override URL if set (Docker-internal hostname)
    jwks_url = settings.logto_jwks_uri
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(jwks_url)
        resp.raise_for_status()
        return resp.json()


async def _get_jwks() -> dict:
    redis = get_redis()
    cached = await redis.get(JWKS_CACHE_KEY)
    if cached:
        return json.loads(cached)
    jwks = await _fetch_jwks()
    await redis.setex(JWKS_CACHE_KEY, JWKS_CACHE_TTL, json.dumps(jwks))
    return jwks


# ── Token validation ──────────────────────────────────────────────────────────


async def decode_token(token: str) -> TokenClaims:
    """
    Validate a JWT (user or M2M) and return normalised TokenClaims.
    Both token types share the same JWKS and audience — only the claims differ.
    """
    try:
        jwks = await _get_jwks()
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        if not kid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing kid",
                headers={"WWW-Authenticate": "Bearer"},
            )

        keys = jwks.get("keys", [])
        key = next((k for k in keys if k.get("kid") == kid), None)
        if not key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: unknown kid",
                headers={"WWW-Authenticate": "Bearer"},
            )

        payload = jwt.decode(
            token,
            key,
            # Logto may issue ES384 tokens depending on tenant/app config.
            # Accept common asymmetric algs we support.
            algorithms=["RS256", "ES256", "ES384"],
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

    # Detect M2M: Logto M2M tokens have no organization_id and their sub
    # matches the M2M app ID (not a usr_ prefixed user ID).
    # More reliably: M2M tokens have a "client_id" claim equal to the app ID.
    is_m2m = (
        payload.get("client_id") == settings.logto_m2m_app_id
        or payload["sub"] == settings.logto_m2m_app_id
    )

    return TokenClaims(
        sub=payload["sub"],
        org_id=payload.get("organization_id"),
        org_roles=payload.get("organization_roles", []),
        app_roles=payload.get("roles", []),  # top-level roles = M2M app roles
        email=payload.get("email"),
        name=payload.get("name"),
        is_m2m=is_m2m,
    )


# ── Request-level dependency ──────────────────────────────────────────────────


async def extract_token_claims(request: Request) -> TokenClaims:
    """
    FastAPI dependency: validates the Bearer token and returns TokenClaims.

    Accepts both user tokens and M2M tokens.
    In development, X-Dev-User-Id header bypasses JWT validation.
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
