"""Pydantic schemas for Property and Unit endpoints."""

from __future__ import annotations

import uuid
from typing import Any

from pydantic import Field, field_validator

from app.schemas.common import CamelModel


# ── Address ───────────────────────────────────────────────────────────────────

class PropertyAddressSchema(CamelModel):
    line1: str
    line2: str | None = None
    city: str
    state: str
    postcode: str
    country: str
    lat: float | None = None
    lng: float | None = None
    # GeoBox administrative hierarchy — populated via geocode lookup
    village: str | None = None
    parish: str | None = None
    sub_county: str | None = None
    county: str | None = None
    district: str | None = None


# ── Rules ─────────────────────────────────────────────────────────────────────

class PropertyRulesSchema(CamelModel):
    grace_period_days: int = Field(default=5, ge=0, le=30)
    late_fee_type: str = Field(default="flat", pattern="^(flat|percentage)$")
    late_fee_value: float = Field(default=50.0, ge=0)
    late_fee_cap_amount: float | None = None
    deposit_months: int = Field(default=1, ge=0, le=6)
    advance_rent_months: int = Field(default=1, ge=1, le=6)
    minimum_lease_months: int = Field(default=6, ge=1, le=60)
    max_occupants: int = Field(default=2, ge=1, le=20)
    notice_period_days: int = Field(default=30, ge=7, le=180)
    allow_subletting: bool = False
    allow_pets: bool = False
    allow_smoking: bool = False
    rent_day_of_month: int = Field(default=1, ge=1, le=28)
    billing_currency: str = Field(default="UGX", min_length=3, max_length=3)
    maintenance_window_hours: int = Field(default=24, ge=1, le=168)


# ── Unit schema (forward-declared for use in PropertyCreate) ──────────────────

class SingleUnitOverrides(CamelModel):
    """Optional unit details when creating a whole-property (is_single_unit=True) property."""
    bedrooms: int = Field(default=1, ge=0, le=20)
    bathrooms: int = Field(default=1, ge=0, le=20)
    sitting_rooms: int = Field(default=1, ge=0, le=20)
    toilets: int = Field(default=1, ge=0, le=20)
    is_self_contained: bool = True
    has_kitchen: bool = True
    has_store: bool = False
    has_domestic_quarters: bool = False
    parking_spaces: int = Field(default=0, ge=0)
    furnished_status: str = Field(default="unfurnished", pattern="^(unfurnished|semi_furnished|furnished)$")
    area: float | None = None


# ── Property ──────────────────────────────────────────────────────────────────

class PropertyCreate(CamelModel):
    name: str = Field(min_length=1, max_length=255)
    type: str = Field(
        pattern="^(flat|house|hostel|commercial|villa|bungalow|maisonette|townhouse|bedsitter_block)$"
    )
    status: str = Field(default="active", pattern="^(active|inactive|maintenance)$")
    address: PropertyAddressSchema
    rules: PropertyRulesSchema = Field(default_factory=PropertyRulesSchema)
    description: str | None = None
    cover_image: str | None = None
    images: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    amenities: list[str] = Field(default_factory=list)
    currency: str = Field(default="UGX", min_length=3, max_length=3)
    geocode: str | None = Field(default=None, max_length=20)
    is_single_unit: bool = False
    # Optional unit details for whole-property path
    single_unit_overrides: SingleUnitOverrides | None = None
    # Uganda property features
    total_floors: int = Field(default=1, ge=0, le=200)
    year_built: int | None = Field(default=None, ge=1800, le=2100)
    land_size_acres: float | None = Field(default=None, ge=0)
    has_perimeter_wall: bool = False
    has_gate: bool = False
    has_guard: bool = False
    has_cctv: bool = False
    total_parking_spaces: int = Field(default=0, ge=0)
    water_source: str = Field(
        default="municipal",
        pattern="^(municipal|borehole|tank|multiple)$",
    )
    backup_power: str = Field(
        default="none",
        pattern="^(none|solar|generator|both)$",
    )
    internet_type: str = Field(
        default="none",
        pattern="^(none|wifi|fibre)$",
    )
    compound_type: str = Field(
        default="private",
        pattern="^(private|shared)$",
    )


class PropertyUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    type: str | None = None
    status: str | None = None
    address: PropertyAddressSchema | None = None
    rules: PropertyRulesSchema | None = None
    description: str | None = None
    cover_image: str | None = None
    images: list[str] | None = None
    tags: list[str] | None = None
    amenities: list[str] | None = None
    currency: str | None = None
    geocode: str | None = Field(default=None, max_length=20)
    is_single_unit: bool | None = None
    # Uganda property features
    total_floors: int | None = Field(default=None, ge=0, le=200)
    year_built: int | None = Field(default=None, ge=1800, le=2100)
    land_size_acres: float | None = Field(default=None, ge=0)
    has_perimeter_wall: bool | None = None
    has_gate: bool | None = None
    has_guard: bool | None = None
    has_cctv: bool | None = None
    total_parking_spaces: int | None = Field(default=None, ge=0)
    water_source: str | None = None
    backup_power: str | None = None
    internet_type: str | None = None
    compound_type: str | None = None


class PropertyOut(CamelModel):
    id: str
    name: str
    type: str
    status: str
    address: dict[str, Any]
    rules: dict[str, Any]
    landlord_id: str        # organisation_id — frontend calls it landlordId
    org_name: str | None = None       # owning organisation display name
    is_agency: bool = False           # True if org has an accepted AgencyInvite
    owner_profile_id: str | None = None  # profile ID of the owner (role='owner') if independent
    description: str | None
    cover_image: str | None
    images: list[str]
    tags: list[str]
    amenities: list[str]
    currency: str
    geocode: str | None = None
    is_single_unit: bool = False
    # Uganda property features
    total_floors: int = 1
    year_built: int | None = None
    land_size_acres: float | None = None
    has_perimeter_wall: bool = False
    has_gate: bool = False
    has_guard: bool = False
    has_cctv: bool = False
    total_parking_spaces: int = 0
    water_source: str = "municipal"
    backup_power: str = "none"
    internet_type: str = "none"
    compound_type: str = "private"
    total_units: int
    occupied_units: int
    occupancy_rate: float
    monthly_revenue: float
    created_at: str
    updated_at: str


# ── Unit ──────────────────────────────────────────────────────────────────────

class UnitCreate(CamelModel):
    name: str = Field(min_length=1, max_length=100)
    type: str = Field(
        pattern=(
            "^(single|double|studio|ensuite|shared"
            "|bedsitter|one_bed|two_bed|three_bed|four_bed_plus)$"
        )
    )
    status: str = Field(default="available", pattern="^(available|occupied|reserved|maintenance)$")
    floor: int | None = None
    area: float | None = None
    monthly_rent: float = Field(ge=0)
    currency: str = Field(default="UGX", min_length=3, max_length=3)
    bedrooms: int = Field(default=1, ge=0, le=20)
    bathrooms: int = Field(default=1, ge=0, le=20)
    amenities: list[str] = Field(default_factory=list)
    images: list[str] = Field(default_factory=list)
    notes: str | None = None
    rules: PropertyRulesSchema | None = None
    geocode: str | None = Field(default=None, max_length=20)
    # Uganda unit features
    sitting_rooms: int = Field(default=1, ge=0, le=20)
    toilets: int = Field(default=1, ge=0, le=20)
    is_self_contained: bool = True
    has_kitchen: bool = True
    has_store: bool = False
    has_domestic_quarters: bool = False
    parking_spaces: int = Field(default=0, ge=0)
    furnished_status: str = Field(
        default="unfurnished",
        pattern="^(unfurnished|semi_furnished|furnished)$",
    )
    water_source: str | None = Field(
        default=None,
        pattern="^(municipal|borehole|tank|multiple)$",
    )


class UnitUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    type: str | None = None
    status: str | None = None
    floor: int | None = None
    area: float | None = None
    monthly_rent: float | None = None
    currency: str | None = None
    bedrooms: int | None = None
    bathrooms: int | None = None
    amenities: list[str] | None = None
    images: list[str] | None = None
    notes: str | None = None
    geocode: str | None = Field(default=None, max_length=20)
    # Uganda unit features
    sitting_rooms: int | None = None
    toilets: int | None = None
    is_self_contained: bool | None = None
    has_kitchen: bool | None = None
    has_store: bool | None = None
    has_domestic_quarters: bool | None = None
    parking_spaces: int | None = None
    furnished_status: str | None = None
    water_source: str | None = None


class UnitRulesUpdate(CamelModel):
    """Pass rules=null to reset to property-level rules."""
    rules: PropertyRulesSchema | None = None


class BulkUnitUpdate(CamelModel):
    unit_ids: list[str]
    status: str | None = None
    monthly_rent: float | None = None
    amenities: list[str] | None = None


class BatchUnitCreate(CamelModel):
    units: list[UnitCreate]


class UnitOut(CamelModel):
    id: str
    reference: str | None = None
    property_id: str
    name: str
    type: str
    status: str
    floor: int | None
    area: float | None
    monthly_rent: float
    currency: str
    bedrooms: int
    bathrooms: int
    amenities: list[str]
    images: list[str]
    notes: str | None
    rules: dict[str, Any] | None
    geocode: str | None = None
    # Uganda unit features
    sitting_rooms: int = 1
    toilets: int = 1
    is_self_contained: bool = True
    has_kitchen: bool = True
    has_store: bool = False
    has_domestic_quarters: bool = False
    parking_spaces: int = 0
    furnished_status: str = "unfurnished"
    water_source: str | None = None
    current_tenant_id: str | None
    current_lease_id: str | None
    last_inspection_date: str | None
    created_at: str
    updated_at: str
