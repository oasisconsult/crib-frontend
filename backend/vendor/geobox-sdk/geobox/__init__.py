"""
GeoBox Smart Addressing SDK — Python

Quick start::

    from geobox import GeoBoxClient

    async with GeoBoxClient(api_key="gbx_live_...") as client:
        resp = await client.addresses.create(
            phone="+256701234567",
            address_type="home",
            village_name="Kireka",
            lat=0.3476, lng=32.6311,
            share_delivery=True, share_contact=False,
        )
        print(resp.geocode)   # UGKAN-JF5
"""

from .client import GeoBoxClient
from .auth import ApiKeyAuth, BearerAuth, OAuth2Auth
from .models import (
    Address,
    AddressCreateResponse,
    AddressList,
    AddressType,
    AreaResult,
    GeocodeLookupResponse,
    NearbySearchResponse,
    VerificationStatus,
)
from .exceptions import (
    GeoBoxError,
    GeoBoxAuthError,
    GeoBoxForbiddenError,
    GeoBoxNotFoundError,
    GeoBoxConflictError,
    GeoBoxValidationError,
    GeoBoxRateLimitError,
    GeoBoxServerError,
    GeoBoxTimeoutError,
    GeoBoxConnectionError,
)

__version__ = "1.0.0"
__all__ = [
    "GeoBoxClient",
    "ApiKeyAuth",
    "BearerAuth",
    "OAuth2Auth",
    # Models
    "Address",
    "AddressCreateResponse",
    "AddressList",
    "AddressType",
    "AreaResult",
    "GeocodeLookupResponse",
    "NearbySearchResponse",
    "VerificationStatus",
    # Exceptions
    "GeoBoxError",
    "GeoBoxAuthError",
    "GeoBoxForbiddenError",
    "GeoBoxNotFoundError",
    "GeoBoxConflictError",
    "GeoBoxValidationError",
    "GeoBoxRateLimitError",
    "GeoBoxServerError",
    "GeoBoxTimeoutError",
    "GeoBoxConnectionError",
]
