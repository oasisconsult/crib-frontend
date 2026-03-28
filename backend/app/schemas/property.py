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


# ── Rules ─────────────────────────────────────────────────────────────────────

class PropertyRulesSchema(CamelModel):
    grace_period_days: int = Field(default=5, ge=0, le=30)
    late_fee_type: str = Field(default="flat", pattern="^(flat|percentage)$")
    late_fee_value: float = Field(default=50.0, ge=0)
    late_fee_cap_amount: float | None = None
    deposit_months: int = Field(default=1, ge=0, le=6)
    notice_period_days: int = Field(default=30, ge=7, le=180)
    allow_subletting: bool = False
    allow_pets: bool = False
    allow_smoking: bool = False
    rent_day_of_month: int = Field(default=1, ge=1, le=28)
    billing_currency: str = Field(default="UGX", min_length=3, max_length=3)
    maintenance_window_hours: int = Field(default=24, ge=1, le=168)


# ── Property ──────────────────────────────────────────────────────────────────

class PropertyCreate(CamelModel):
    name: str = Field(min_length=1, max_length=255)
    type: str = Field(pattern="^(flat|house|hostel|commercial|villa)$")
    status: str = Field(default="active", pattern="^(active|inactive|maintenance)$")
    address: PropertyAddressSchema
    rules: PropertyRulesSchema = Field(default_factory=PropertyRulesSchema)
    description: str | None = None
    cover_image: str | None = None
    images: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    amenities: list[str] = Field(default_factory=list)
    currency: str = Field(default="UGX", min_length=3, max_length=3)


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


class PropertyOut(CamelModel):
    id: str
    name: str
    type: str
    status: str
    address: dict[str, Any]
    rules: dict[str, Any]
    landlord_id: str        # organisation_id — frontend calls it landlordId
    description: str | None
    cover_image: str | None
    images: list[str]
    tags: list[str]
    amenities: list[str]
    currency: str
    total_units: int
    occupied_units: int
    occupancy_rate: float
    monthly_revenue: float
    created_at: str
    updated_at: str


# ── Unit ──────────────────────────────────────────────────────────────────────

class UnitCreate(CamelModel):
    name: str = Field(min_length=1, max_length=100)
    type: str = Field(pattern="^(single|double|studio|ensuite|shared)$")
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
    current_tenant_id: str | None
    current_lease_id: str | None
    last_inspection_date: str | None
    created_at: str
    updated_at: str
