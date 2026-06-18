"""
Role-based API client factory.

Maps workflow role names to the dev-user IDs defined in the backend's
DEV_USERS fixture (app/core/config.py), injecting the ``X-Dev-User-Id``
header that activates the auth bypass in development/test mode.

The factory wraps an existing ``httpx.AsyncClient`` rather than creating
new connections — the test-session client is passed in so all requests
share the same DB transaction context set up by the conftest fixtures.
"""
from __future__ import annotations

from httpx import AsyncClient

# Maps workflow role names → dev-user IDs (from app/core/config.py DEV_USERS).
ROLE_USER_MAP: dict[str, str | None] = {
    "superadmin":  "superadmin-1",
    "admin":       "superadmin-1",   # alias
    "owner":       "owner-1",
    "manager":     "manager-1",
    "landlord":    "landlord-1",
    "tenant":      "tenant-1",
    "contractor":  "contractor-1",
    "maintenance": "maintenance-1",
    # anonymous: no auth header — for public/portal endpoints
    "anonymous":   None,
}


class RoleClient:
    """
    Thin wrapper that prefixes every request with the auth header for the
    given role.  Delegates to the underlying ``AsyncClient`` for all HTTP
    verbs.

    Use ``role="anonymous"`` for unauthenticated requests (portal endpoints,
    public vacancy board, tenant sign links, etc.).
    """

    def __init__(self, client: AsyncClient, role: str) -> None:
        if role not in ROLE_USER_MAP:
            raise ValueError(
                f"Unknown workflow role '{role}'. "
                f"Valid roles: {list(ROLE_USER_MAP)}"
            )
        user_id = ROLE_USER_MAP[role]
        self._client = client
        self._headers = {"X-Dev-User-Id": user_id} if user_id else {}
        self.role = role

    async def get(self, url: str, **kwargs) -> "httpx.Response":  # type: ignore[name-defined]
        return await self._client.get(url, headers=self._headers, **kwargs)

    async def post(self, url: str, **kwargs) -> "httpx.Response":  # type: ignore[name-defined]
        return await self._client.post(url, headers=self._headers, **kwargs)

    async def put(self, url: str, **kwargs) -> "httpx.Response":  # type: ignore[name-defined]
        return await self._client.put(url, headers=self._headers, **kwargs)

    async def patch(self, url: str, **kwargs) -> "httpx.Response":  # type: ignore[name-defined]
        return await self._client.patch(url, headers=self._headers, **kwargs)

    async def delete(self, url: str, **kwargs) -> "httpx.Response":  # type: ignore[name-defined]
        return await self._client.delete(url, headers=self._headers, **kwargs)


class ClientFactory:
    """Returns a ``RoleClient`` for the requested role, caching by role name."""

    def __init__(self, client: AsyncClient) -> None:
        self._client = client
        self._cache: dict[str, RoleClient] = {}

    def for_role(self, role: str) -> RoleClient:
        if role not in self._cache:
            self._cache[role] = RoleClient(self._client, role)
        return self._cache[role]
