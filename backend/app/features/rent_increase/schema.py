"""Pydantic schemas for rent increase endpoints."""

from __future__ import annotations

from datetime import date

from pydantic import Field, field_validator

from app.schemas.common import CamelModel


class RentIncreaseCreate(CamelModel):
    new_rent: float = Field(gt=0, description="Proposed new monthly rent")
    effective_date: date = Field(description="Date the increase takes effect (must be ≥90 days away)")
    notes: str | None = Field(default=None, max_length=1000)


class RentIncreaseWithdraw(CamelModel):
    reason: str | None = Field(default=None, max_length=500)


class RentIncreaseOut(CamelModel):
    id: str
    organisation_id: str
    lease_id: str
    property_id: str | None
    unit_id: str | None
    tenant_id: str | None
    issued_by: str
    status: str
    current_rent: float
    new_rent: float
    increase_pct: float
    effective_date: str
    issued_at: str
    acknowledged_at: str | None
    applied_at: str | None
    withdrawn_at: str | None
    notice_pdf_url: str | None
    notes: str | None
    created_at: str
    updated_at: str


class RentIncreaseListOut(CamelModel):
    data: list[RentIncreaseOut]
    total: int
