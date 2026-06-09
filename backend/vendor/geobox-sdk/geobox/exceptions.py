"""
GeoBox SDK — Exception hierarchy.

All SDK errors inherit from GeoBoxError so callers can catch broadly or narrowly.

Usage::

    from geobox.exceptions import GeoBoxNotFoundError, GeoBoxAuthError

    try:
        address = client.addresses.get("UGKAN-JF5")
    except GeoBoxNotFoundError:
        print("Geocode not found")
    except GeoBoxAuthError:
        print("Check your API key")
"""

from __future__ import annotations

from typing import Any


class GeoBoxError(Exception):
    """Base class for all GeoBox SDK errors."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        error_code: str | None = None,
        correlation_id: str | None = None,
        detail: Any = None,
    ) -> None:
        super().__init__(message)
        self.message       = message
        self.status_code   = status_code
        self.error_code    = error_code
        self.correlation_id = correlation_id
        self.detail        = detail

    def __repr__(self) -> str:
        return (
            f"{self.__class__.__name__}("
            f"message={self.message!r}, "
            f"status_code={self.status_code}, "
            f"error_code={self.error_code!r})"
        )


# ---------------------------------------------------------------------------
# HTTP / transport errors
# ---------------------------------------------------------------------------

class GeoBoxHTTPError(GeoBoxError):
    """Raised when the API returns an unexpected HTTP error."""


class GeoBoxTimeoutError(GeoBoxError):
    """Raised when a request times out."""


class GeoBoxConnectionError(GeoBoxError):
    """Raised when the SDK cannot reach the API."""


# ---------------------------------------------------------------------------
# Authentication & authorisation
# ---------------------------------------------------------------------------

class GeoBoxAuthError(GeoBoxError):
    """Raised on 401 — invalid or missing credentials."""


class GeoBoxForbiddenError(GeoBoxError):
    """Raised on 403 — authenticated but lacking permission."""


# ---------------------------------------------------------------------------
# Request / resource errors
# ---------------------------------------------------------------------------

class GeoBoxNotFoundError(GeoBoxError):
    """Raised on 404 — resource does not exist."""


class GeoBoxConflictError(GeoBoxError):
    """Raised on 409 — resource already exists (e.g. duplicate geocode)."""


class GeoBoxValidationError(GeoBoxError):
    """Raised on 422 — the request payload failed validation."""

    def __init__(self, message: str, *, errors: list[dict] | None = None, **kw: Any) -> None:
        super().__init__(message, **kw)
        self.errors = errors or []


# ---------------------------------------------------------------------------
# Rate limiting & capacity
# ---------------------------------------------------------------------------

class GeoBoxRateLimitError(GeoBoxError):
    """Raised on 429 — rate limit exceeded.

    `retry_after` is the number of seconds to wait before retrying.
    """

    def __init__(self, message: str, *, retry_after: int | None = None, **kw: Any) -> None:
        super().__init__(message, **kw)
        self.retry_after = retry_after


# ---------------------------------------------------------------------------
# Server errors
# ---------------------------------------------------------------------------

class GeoBoxServerError(GeoBoxError):
    """Raised on 5xx — server-side error."""


# ---------------------------------------------------------------------------
# Helper: map HTTP status → exception type
# ---------------------------------------------------------------------------

def raise_for_status(status_code: int, body: dict | None = None) -> None:
    """Raise the appropriate GeoBoxError based on HTTP *status_code*."""
    if status_code < 400:
        return

    body       = body or {}
    message    = body.get("detail") or body.get("message") or f"HTTP {status_code}"
    error_code = body.get("error_code") or body.get("code")
    corr_id    = body.get("correlation_id")
    common     = dict(status_code=status_code, error_code=error_code, correlation_id=corr_id, detail=body)

    if status_code == 401:
        raise GeoBoxAuthError(message, **common)
    if status_code == 403:
        raise GeoBoxForbiddenError(message, **common)
    if status_code == 404:
        raise GeoBoxNotFoundError(message, **common)
    if status_code == 409:
        raise GeoBoxConflictError(message, **common)
    if status_code == 422:
        raise GeoBoxValidationError(message, errors=body.get("detail", []), **common)
    if status_code == 429:
        raise GeoBoxRateLimitError(message, retry_after=body.get("retry_after"), **common)
    if status_code >= 500:
        raise GeoBoxServerError(message, **common)

    raise GeoBoxHTTPError(message, **common)
