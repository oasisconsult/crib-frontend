"""
GeoBox SDK — Authentication providers.

Developers interact with GeoBox using their application's **Client ID** and
**Client Secret**, which are issued when a developer registers their application
in the GeoBox developer portal.  The SDK handles all token exchange, caching,
and refresh transparently — callers never interact with the auth infrastructure
directly.

Supported providers
-------------------
ClientCredentialsAuth  — recommended: exchange client_id + client_secret for a
                         short-lived JWT that is automatically refreshed.
BearerTokenAuth        — supply a pre-issued token (advanced / testing use).
ApiKeyAuth             — supply an API key (legacy / service-to-service use).
"""

from __future__ import annotations

import os
import time
from abc import ABC, abstractmethod
from typing import Optional

import httpx


class BaseAuth(ABC):
    """Interface every auth provider must implement."""

    @abstractmethod
    async def headers(self) -> dict[str, str]:
        """Return auth headers to inject into every outgoing request."""
        ...

    async def on_response(self, response: httpx.Response) -> None:
        """Optional hook called after every response (e.g. to handle 401)."""


# ---------------------------------------------------------------------------
# Client Credentials (recommended — primary auth method)
# ---------------------------------------------------------------------------

_DEFAULT_TOKEN_URL = "https://api.geoboxafrica.com/billing/auth/clients/token"
_DEFAULT_RESOURCE  = "https://api.geoboxafrica.com"


class ClientCredentialsAuth(BaseAuth):
    """GeoBox application credentials — the recommended authentication method.

    The SDK exchanges your *client_id* and *client_secret* for a short-lived
    JWT access token on the first API call.  The token is cached in memory and
    silently refreshed 60 seconds before expiry, so your application never
    experiences auth interruptions.

    You obtain your credentials from the GeoBox developer portal.  Keep your
    *client_secret* private and never expose it in client-side code.

    Credentials are resolved in this order:

    1. Arguments passed directly to the constructor.
    2. Environment variables ``GEOBOX_CLIENT_ID`` and ``GEOBOX_CLIENT_SECRET``.

    Args:
        client_id:     Your application's client ID.  Falls back to the
                       ``GEOBOX_CLIENT_ID`` environment variable.
        client_secret: Your application's client secret.  Falls back to the
                       ``GEOBOX_CLIENT_SECRET`` environment variable.
        sandbox:       If True, target the sandbox token endpoint.
        scope:         Space-separated scopes to request (optional — omit to
                       receive all scopes granted to your subscription tier).

    Example::

        from geobox import GeoBoxClient

        # Explicit credentials
        client = GeoBoxClient(
            client_id="app_01HXYZ...",
            client_secret="cs_live_XXXXXXXX",
        )

        # Or set env vars and call with no arguments:
        #   export GEOBOX_CLIENT_ID="app_01HXYZ..."
        #   export GEOBOX_CLIENT_SECRET="cs_live_XXXXXXXX"
        client = GeoBoxClient()
    """

    _SANDBOX_TOKEN_URL = "https://api.staging.geoboxafrica.com/billing/auth/clients/token"
    _SANDBOX_RESOURCE  = "https://api.staging.geoboxafrica.com"

    def __init__(
        self,
        client_id:     Optional[str] = None,
        client_secret: Optional[str] = None,
        sandbox:       bool          = False,
        scope:         str           = "",
    ) -> None:
        resolved_id     = client_id     or os.environ.get("GEOBOX_CLIENT_ID",     "")
        resolved_secret = client_secret or os.environ.get("GEOBOX_CLIENT_SECRET", "")

        if not resolved_id:
            raise ValueError(
                "client_id is required. Pass it explicitly or set the "
                "GEOBOX_CLIENT_ID environment variable."
            )
        if not resolved_secret:
            raise ValueError(
                "client_secret is required. Pass it explicitly or set the "
                "GEOBOX_CLIENT_SECRET environment variable."
            )

        self._client_id     = resolved_id
        self._client_secret = resolved_secret
        self._scope         = scope

        if sandbox:
            self._token_url = self._SANDBOX_TOKEN_URL
            self._resource  = self._SANDBOX_RESOURCE
        else:
            self._token_url = _DEFAULT_TOKEN_URL
            self._resource  = _DEFAULT_RESOURCE

        self._access_token: Optional[str] = None
        self._expires_at:   float         = 0.0

    def _is_expired(self) -> bool:
        """Return True if the cached token is missing or expires within 60 s."""
        return time.monotonic() >= self._expires_at - 60

    async def _fetch_token(self) -> None:
        """Exchange client credentials for a JWT access token."""
        payload: dict = {
            "client_id":     self._client_id,
            "client_secret": self._client_secret,
            "resource":      self._resource,
        }
        if self._scope:
            payload["scope"] = self._scope

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(self._token_url, json=payload)
            if resp.status_code == 401:
                raise PermissionError(
                    "Invalid client credentials — check your client_id and client_secret."
                )
            resp.raise_for_status()
            body = resp.json()

        self._access_token = body["access_token"]
        expires_in         = int(body.get("expires_in", 3600))
        self._expires_at   = time.monotonic() + expires_in

    async def headers(self) -> dict[str, str]:
        if not self._access_token or self._is_expired():
            await self._fetch_token()
        return {"Authorization": f"Bearer {self._access_token}"}


# ---------------------------------------------------------------------------
# Bearer Token (pre-issued JWT — advanced / testing use)
# ---------------------------------------------------------------------------

class BearerTokenAuth(BaseAuth):
    """Auth provider for a pre-issued JWT access token.

    Use this when your infrastructure already manages token acquisition (e.g.
    a shared token service) and you only need the SDK to inject the bearer
    header on every request.

    For most applications, prefer :class:`ClientCredentialsAuth` instead.

    Args:
        token: A valid JWT access token.
    """

    def __init__(self, token: str) -> None:
        if not token:
            raise ValueError("token must not be empty")
        self._token = token

    async def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._token}"}


# ---------------------------------------------------------------------------
# API Key (legacy / service-to-service use)
# ---------------------------------------------------------------------------

class ApiKeyAuth(BaseAuth):
    """Auth provider for API key authentication.

    Use this for legacy integrations or service-to-service calls where an API
    key is preferred over OAuth2 client credentials.

    The API key is resolved in this order:

    1. The ``api_key`` argument passed to the constructor.
    2. The ``GEOBOX_API_KEY`` environment variable.

    For most applications, prefer :class:`ClientCredentialsAuth` instead.

    Args:
        api_key:     Your GeoBox API key.  Falls back to the ``GEOBOX_API_KEY``
                     environment variable.
        header_name: HTTP header to send the key in (default ``X-API-Key``).

    Example::

        from geobox import GeoBoxClient
        from geobox.auth import ApiKeyAuth

        client = GeoBoxClient(auth=ApiKeyAuth(api_key="geobox_key_XXXXXXXX"))
    """

    def __init__(
        self,
        api_key:     Optional[str] = None,
        header_name: str           = "X-API-Key",
    ) -> None:
        resolved = api_key or os.environ.get("GEOBOX_API_KEY", "")
        if not resolved:
            raise ValueError(
                "api_key is required. Pass it explicitly or set the "
                "GEOBOX_API_KEY environment variable."
            )
        self._api_key     = resolved
        self._header_name = header_name

    async def headers(self) -> dict[str, str]:
        return {self._header_name: self._api_key}
