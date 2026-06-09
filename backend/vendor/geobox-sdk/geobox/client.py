"""
GeoBox SDK — Main client.

Developers never interact with backend URLs, authentication infrastructure, or
internal service details.  Everything is handled through this single client
object using the credentials issued in the GeoBox developer portal.

Usage (async)::

    import asyncio
    from geobox import GeoBoxClient

    async def main():
        async with GeoBoxClient(
            client_id="app_01HXYZ...",
            client_secret="cs_live_XXXXXXXX",
        ) as client:
            nearby = await client.geocoding.find_nearby(latitude=0.3476, longitude=32.6311)
            village = nearby.areas[0]
            address = await client.addresses.create(
                full_address=f"Plot 15 Mawanda Road, {village.name}",
                admin_hierarchy=village.hierarchy,
                latitude=0.3476, longitude=32.6311,
                share_delivery=True, share_contact=False,
            )
            print(address.geocode)  # e.g. UGKAN-JF5

    asyncio.run(main())

Usage (synchronous)::

    from geobox import GeoBoxClient

    client = GeoBoxClient(
        client_id="app_01HXYZ...",
        client_secret="cs_live_XXXXXXXX",
    )
    geocode = client.geocoding.lookup_sync("UGKAN-JF5")
"""

from __future__ import annotations

import asyncio
import concurrent.futures
from typing import Any, Optional

from .auth import BaseAuth, ClientCredentialsAuth
from .http import HttpTransport
from .services.addresses    import AddressService
from .services.geocoding    import GeocodingService
from .services.verification import VerificationService
from .services.webhooks     import WebhookHandler

_PRODUCTION_URL = "https://api.geoboxafrica.com/v1"
_SANDBOX_URL    = "https://api.staging.geoboxafrica.com/v1"


class GeoBoxClient:
    """Unified entry point for all GeoBox API services.

    Instantiate once and reuse across the lifetime of your application.
    Supports use as an async context manager for clean resource cleanup.

    Args:
        client_id:      Your application's client ID (from the developer portal).
        client_secret:  Your application's client secret.  **Keep this private.**
        auth:           A pre-configured :class:`~geobox.auth.BaseAuth` provider.
                        Use only for advanced scenarios — prefer *client_id* /
                        *client_secret* for normal use.
        sandbox:        If True, route requests to the sandbox environment.
        base_url:       Override the API base URL (rarely needed).
        timeout:        Per-request timeout in seconds (default 30).
        max_retries:    Automatic retries on transient errors (default 3).
        webhook_secret: Signing secret for inbound webhook validation.

    Raises:
        ValueError: If neither credentials nor an auth provider are supplied.

    Examples::

        # Standard usage
        client = GeoBoxClient(
            client_id="app_01HXYZ...",
            client_secret="cs_live_XXXXXXXX",
        )

        # From environment variables (set GEOBOX_CLIENT_ID and GEOBOX_CLIENT_SECRET)
        client = GeoBoxClient()

        # Sandbox (for development / testing)
        client = GeoBoxClient(
            client_id="app_01HXYZ...",
            client_secret="cs_test_XXXXXXXX",
            sandbox=True,
        )

        # Advanced: bring your own auth
        from geobox.auth import BearerTokenAuth
        client = GeoBoxClient(auth=BearerTokenAuth(token="eyJ..."))
    """

    def __init__(
        self,
        *,
        client_id:      Optional[str]      = None,
        client_secret:  Optional[str]      = None,
        auth:           Optional[BaseAuth] = None,
        sandbox:        bool               = False,
        base_url:       Optional[str]      = None,
        timeout:        float              = 30.0,
        max_retries:    int                = 3,
        webhook_secret: Optional[str]      = None,
    ) -> None:
        # Resolve auth provider
        if (client_id or client_secret) and auth:
            raise ValueError("Provide either (client_id, client_secret) or auth, not both")

        if auth:
            _auth: BaseAuth = auth
        else:
            # ClientCredentialsAuth reads GEOBOX_CLIENT_ID / GEOBOX_CLIENT_SECRET from
            # env vars if explicit arguments are not provided.
            _auth = ClientCredentialsAuth(
                client_id=client_id,
                client_secret=client_secret,
                sandbox=sandbox,
            )

        # Resolve base URL
        if base_url:
            _base = base_url
        elif sandbox:
            _base = _SANDBOX_URL
        else:
            _base = _PRODUCTION_URL

        self._http = HttpTransport(
            base_url=_base,
            auth=_auth,
            timeout=timeout,
            max_retries=max_retries,
        )

        # Service namespaces — the only interface developers need
        self.addresses    = AddressService(self._http)
        self.geocoding    = GeocodingService(self._http)
        self.verification = VerificationService(self._http)

        # Webhook handler (optional — only if your app receives GeoBox webhooks)
        self.webhooks = WebhookHandler(webhook_secret) if webhook_secret else None

    # ------------------------------------------------------------------
    # Context manager
    # ------------------------------------------------------------------

    async def __aenter__(self) -> "GeoBoxClient":
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self.close()

    async def close(self) -> None:
        """Release underlying HTTP connections."""
        await self._http.close()

    # ------------------------------------------------------------------
    # Sync wrapper (for non-async environments)
    # ------------------------------------------------------------------

    def _run(self, coro: Any) -> Any:
        """Run a coroutine synchronously.

        Safe to use inside WSGI frameworks, scripts, and Jupyter notebooks.
        """
        try:
            asyncio.get_running_loop()
            # Already inside an event loop — offload to a thread
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                return pool.submit(asyncio.run, coro).result()
        except RuntimeError:
            return asyncio.run(coro)

    # ------------------------------------------------------------------
    # Health check
    # ------------------------------------------------------------------

    async def ping(self) -> dict[str, Any]:
        """Return the API health status."""
        return await self._http.get("health")

    def ping_sync(self) -> dict[str, Any]:
        """Synchronous variant of :meth:`ping`."""
        return self._run(self.ping())

    def __repr__(self) -> str:
        return f"GeoBoxClient(base_url={self._http._base_url!r})"
