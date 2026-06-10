"""
GeoBox SDK — Low-level HTTP transport with retry, logging, and error mapping.
"""

from __future__ import annotations

import logging
import re
import time
from typing import Any, Optional

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
    before_sleep_log,
)

from .auth import BaseAuth
from .exceptions import (
    GeoBoxConnectionError,
    GeoBoxRateLimitError,
    GeoBoxServerError,
    GeoBoxTimeoutError,
    raise_for_status,
)

logger = logging.getLogger("geobox.http")

# PII patterns — masked in log output
_PII_PATTERNS = [
    (re.compile(r'"phone"\s*:\s*"([^"]+)"'),    '"phone": "***"'),
    (re.compile(r'"phone_hash"\s*:\s*"([^"]+)"'), '"phone_hash": "***"'),
    (re.compile(r'"email"\s*:\s*"([^"]+)"'),    '"email": "***"'),
    (re.compile(r'"contact_phone"\s*:\s*"([^"]+)"'), '"contact_phone": "***"'),
    (re.compile(r'"lat"\s*:\s*[\d.\-]+'),        '"lat": [REDACTED]'),
    (re.compile(r'"lng"\s*:\s*[\d.\-]+'),        '"lng": [REDACTED]'),
]


def _mask_pii(text: str) -> str:
    for pattern, replacement in _PII_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


class HttpTransport:
    """
    Thin async httpx wrapper with:
    - Auth header injection
    - Structured request/response logging (PII masked)
    - Automatic retry with exponential backoff for transient errors
    - Consistent error mapping to SDK exception types
    """

    def __init__(
        self,
        base_url: str,
        auth: BaseAuth,
        timeout: float = 30.0,
        max_retries: int = 3,
        user_agent: str = "geobox-python-sdk/1.0.0",
    ) -> None:
        self._base_url   = base_url.rstrip("/")
        self._auth       = auth
        self._timeout    = timeout
        self._max_retries = max_retries
        self._user_agent = user_agent
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(self._timeout, connect=5.0),
                limits=httpx.Limits(max_keepalive_connections=10, max_connections=20),
            )
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def request(
        self,
        method: str,
        path: str,
        *,
        params:  Optional[dict[str, Any]] = None,
        json:    Optional[Any]            = None,
        headers: Optional[dict[str, str]] = None,
    ) -> Any:
        url        = f"{self._base_url}/{path.lstrip('/')}"
        auth_hdrs  = await self._auth.headers()
        req_headers = {
            "User-Agent":   self._user_agent,
            "Content-Type": "application/json",
            "Accept":       "application/json",
            **auth_hdrs,
            **(headers or {}),
        }

        attempt = 0
        delay   = 1.0

        while True:
            attempt += 1
            t0 = time.monotonic()
            try:
                client   = await self._get_client()
                response = await client.request(
                    method,
                    url,
                    params=params,
                    json=json,
                    headers=req_headers,
                )
                elapsed_ms = int((time.monotonic() - t0) * 1000)

                logger.debug(
                    "%s %s → %d (%dms) [attempt %d]",
                    method, url, response.status_code, elapsed_ms, attempt,
                )

                # On 429, honour Retry-After before raising
                if response.status_code == 429:
                    retry_after = int(response.headers.get("Retry-After", delay))
                    if attempt <= self._max_retries:
                        logger.warning("Rate limited — retrying in %ds", retry_after)
                        import asyncio; await asyncio.sleep(retry_after)
                        delay = min(delay * 2, 60)
                        continue
                    body = self._safe_json(response)
                    raise GeoBoxRateLimitError(
                        body.get("detail", "Rate limit exceeded"),
                        retry_after=retry_after,
                        status_code=429,
                    )

                # Retry on 5xx (up to max_retries)
                if response.status_code >= 500 and attempt <= self._max_retries:
                    logger.warning(
                        "Server error %d — retrying in %.1fs (attempt %d/%d)",
                        response.status_code, delay, attempt, self._max_retries,
                    )
                    import asyncio; await asyncio.sleep(delay)
                    delay = min(delay * 2, 30)
                    continue

                body = self._safe_json(response)
                raise_for_status(response.status_code, body)
                return body

            except (httpx.TimeoutException,) as exc:
                if attempt <= self._max_retries:
                    logger.warning("Request timeout — retrying in %.1fs", delay)
                    import asyncio; await asyncio.sleep(delay)
                    delay = min(delay * 2, 30)
                    continue
                raise GeoBoxTimeoutError(f"Request timed out after {self._timeout}s") from exc

            except (httpx.ConnectError, httpx.RemoteProtocolError) as exc:
                if attempt <= self._max_retries:
                    logger.warning("Connection error — retrying in %.1fs", delay)
                    import asyncio; await asyncio.sleep(delay)
                    delay = min(delay * 2, 30)
                    continue
                raise GeoBoxConnectionError(f"Cannot reach GeoBox API: {exc}") from exc

    @staticmethod
    def _safe_json(response: httpx.Response) -> dict:
        try:
            return response.json()
        except Exception:
            return {}

    # Convenience wrappers
    async def get(self, path: str, **kw: Any) -> Any:
        return await self.request("GET", path, **kw)

    async def post(self, path: str, **kw: Any) -> Any:
        return await self.request("POST", path, **kw)

    async def patch(self, path: str, **kw: Any) -> Any:
        return await self.request("PATCH", path, **kw)

    async def put(self, path: str, **kw: Any) -> Any:
        return await self.request("PUT", path, **kw)

    async def delete(self, path: str, **kw: Any) -> Any:
        return await self.request("DELETE", path, **kw)

    async def __aenter__(self) -> "HttpTransport":
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self.close()
