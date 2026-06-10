"""
GeoBox SDK — Pydantic data models.

All API requests and responses are modelled here.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class AddressType(str, Enum):
    HOME   = "home"
    OFFICE = "office"
    OTHER  = "other"


class VerificationStatus(str, Enum):
    PENDING   = "pending"
    VERIFIED  = "verified"
    REJECTED  = "rejected"
    UNVERIFIED = "unverified"


class AddressField(str, Enum):
    """Valid fields for address updates."""
    ACCESS_INSTRUCTIONS  = "access_instructions"
    DELIVERY_NOTES       = "delivery_notes"
    LANDMARK_DESCRIPTION = "landmark_description"


class RegistrationChannel(str, Enum):
    WHATSAPP    = "whatsapp"
    WEB         = "web"
    API         = "api"
    MOBILE      = "mobile"


# ---------------------------------------------------------------------------
# Shared sub-models
# ---------------------------------------------------------------------------

class LocationPoint(BaseModel):
    latitude:  float = Field(..., ge=-90,  le=90)
    longitude: float = Field(..., ge=-180, le=180)


class AdminHierarchy(BaseModel):
    """5-level Uganda administrative hierarchy."""
    district:  str
    county:    str
    division:  str
    parish:    str
    village:   str

    @classmethod
    def from_list(cls, hierarchy: list[str]) -> "AdminHierarchy":
        if len(hierarchy) < 5:
            raise ValueError(f"admin_hierarchy requires 5 levels, got {len(hierarchy)}")
        return cls(
            district=hierarchy[0],
            county=hierarchy[1],
            division=hierarchy[2],
            parish=hierarchy[3],
            village=hierarchy[4],
        )

    def to_list(self) -> list[str]:
        return [self.district, self.county, self.division, self.parish, self.village]


# ---------------------------------------------------------------------------
# Address models
# ---------------------------------------------------------------------------

class AddressCreateRequest(BaseModel):
    """Request body for POST /v1/addresses."""

    # Required
    phone:            str          = Field(..., description="E.164 phone number of the owner")
    address_type:     AddressType
    village_name:     str          = Field(..., max_length=200)
    lat:              float        = Field(..., ge=-90,  le=90,  description="GPS latitude")
    lng:              float        = Field(..., ge=-180, le=180, description="GPS longitude")
    share_delivery:   bool         = Field(..., description="Consent: share delivery details with riders")
    share_contact:    bool         = Field(..., description="Consent: share contact number with riders")

    # Optional
    village_id:       Optional[str]        = None
    admin_hierarchy:  Optional[list[str]]  = Field(None, min_length=5, max_length=5)
    address_line:     Optional[str]        = Field(None, max_length=300)
    directions:       Optional[str]        = Field(None, max_length=500, description="access_instructions")
    features:         Optional[str]        = Field(None, max_length=500, description="landmark_description")
    delivery_notes:   Optional[str]        = Field(None, max_length=500)
    country_code:     str                  = Field("UG", max_length=2)
    channel:          RegistrationChannel  = RegistrationChannel.API


class AddressUpdateRequest(BaseModel):
    """Request body for PATCH /v1/addresses/{address_id}."""
    field: AddressField
    value: str = Field(..., max_length=500)


class Address(BaseModel):
    """Full address response from the API."""
    geocode:              str
    address_id:           str
    address_type:         str
    full_address:         str
    village:              Optional[str]             = None
    admin_hierarchy:      Optional[list[str]]       = None
    location:             Optional[LocationPoint]   = None
    landmark_description: Optional[str]             = None
    access_instructions:  Optional[str]             = None
    delivery_notes:       Optional[str]             = None
    building_details:     Optional[str]             = None
    contact_phone:        Optional[str]             = None   # only if consented
    nav_url:              Optional[str]             = None
    verification_status:  Optional[str]             = None
    share_delivery_details: Optional[bool]          = None
    share_contact_info:     Optional[bool]          = None
    created_at:           Optional[datetime]        = None
    updated_at:           Optional[datetime]        = None


class AddressCreateResponse(BaseModel):
    geocode:    str
    address_id: str
    message:    str


class AddressList(BaseModel):
    addresses: list[Address]
    total:     int


# ---------------------------------------------------------------------------
# Geocoding / nearby search
# ---------------------------------------------------------------------------

class NearbySearchRequest(BaseModel):
    lat:       float = Field(..., ge=-90,  le=90)
    lng:       float = Field(..., ge=-180, le=180)
    radius_m:  int   = Field(1000, ge=50, le=50_000)
    level:     int   = Field(5, ge=1, le=5, description="Admin level (5=village)")
    limit:     int   = Field(10, ge=1, le=100)
    country_code: str = "UG"


class AreaResult(BaseModel):
    id:              str
    name:            str
    parent_name:     Optional[str]   = None
    level:           Optional[int]   = None
    hierarchy:       list[str]       = Field(default_factory=list)
    distance_meters: Optional[float] = None
    centroid:        Optional[LocationPoint] = None


class NearbySearchResponse(BaseModel):
    areas: list[AreaResult]
    total: int


# ---------------------------------------------------------------------------
# Geocode lookup
# ---------------------------------------------------------------------------

class GeocodeLookupResponse(BaseModel):
    found:              bool
    geocode:            Optional[str]          = None
    full_address:       Optional[str]          = None
    area:               Optional[str]          = None
    landmark:           Optional[str]          = None
    access_instructions: Optional[str]         = None
    delivery_notes:     Optional[str]          = None
    contact_phone:      Optional[str]          = None
    nav_url:            Optional[str]          = None
    location:           Optional[LocationPoint] = None
    admin_hierarchy:    Optional[list[str]]    = None
    error:              Optional[str]          = None


# ---------------------------------------------------------------------------
# Consent
# ---------------------------------------------------------------------------

class ConsentRecordRequest(BaseModel):
    phone_hash:      str  = Field(..., min_length=64, max_length=64)
    share_delivery:  bool
    share_contact:   bool
    channel:         str  = "api_sdk"


class ConsentRecordResponse(BaseModel):
    recorded:   bool
    record_id:  Optional[str]      = None
    created_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------

class VerificationRequest(BaseModel):
    verifier_lat: float = Field(..., ge=-90,  le=90)
    verifier_lng: float = Field(..., ge=-180, le=180)
    accuracy_m:   Optional[float] = None
    notes:        Optional[str]   = None


class VerificationResponse(BaseModel):
    geocode:             str
    verification_status: VerificationStatus
    verified_at:         Optional[datetime] = None
    message:             Optional[str]      = None


# ---------------------------------------------------------------------------
# Batch validation
# ---------------------------------------------------------------------------

class BatchValidationRequest(BaseModel):
    geocodes: list[str] = Field(..., min_length=1, max_length=500)


class BatchValidationResult(BaseModel):
    geocode:  str
    valid:    bool
    address:  Optional[Address] = None
    error:    Optional[str]     = None


class BatchValidationResponse(BaseModel):
    results: list[BatchValidationResult]
    total:   int
    valid:   int
    invalid: int


# ---------------------------------------------------------------------------
# Geographic hierarchy
# ---------------------------------------------------------------------------

class Country(BaseModel):
    code:     str
    name:     str
    currency: Optional[str] = None
    timezone: Optional[str] = None


class HierarchyItem(BaseModel):
    id:       str
    name:     str
    level:    int
    parent_id: Optional[str] = None
    children_count: Optional[int] = None


# ---------------------------------------------------------------------------
# Webhook payload
# ---------------------------------------------------------------------------

class WebhookEvent(BaseModel):
    event_type:    str
    event_id:      str
    timestamp:     datetime
    payload:       dict[str, Any]
    signature:     Optional[str] = None
