"""Pydantic schemas for Lease endpoints."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import Field, field_validator

from app.schemas.common import CamelModel


class LeaseCreate(CamelModel):
    """Create a draft lease."""
    unit_id: str
    tenant_id: str
    start_date: date
    end_date: date | None = None           # None = rolling / month-to-month
    monthly_rent: float = Field(gt=0)
    currency: str = "UGX"
    deposit_amount: float | None = None
    deposit_paid: bool = False
    notes: str | None = None

    @field_validator("end_date", mode="after")
    @classmethod
    def end_after_start(cls, v: date | None, info) -> date | None:
        if v is not None and "start_date" in info.data and info.data["start_date"]:
            if v <= info.data["start_date"]:
                raise ValueError("end_date must be after start_date")
        return v


class LeaseUpdate(CamelModel):
    """Update a draft lease — all fields optional."""
    start_date: date | None = None
    end_date: date | None = None
    monthly_rent: float | None = Field(default=None, gt=0)
    currency: str | None = None
    deposit_amount: float | None = None
    deposit_paid: bool | None = None
    notes: str | None = None


class LeaseActivate(CamelModel):
    """Optional body for PATCH /leases/{id}/activate."""
    signed_at: datetime | None = None      # defaults to now() in service


class LeaseTerminate(CamelModel):
    reason: str = Field(min_length=1)
    terminated_at: datetime | None = None  # defaults to now() in service


class LeaseRenewRequest(CamelModel):
    """Override terms for the renewal draft. Omitted fields are copied from the original."""
    start_date: date
    end_date: date | None = None
    monthly_rent: float | None = Field(default=None, gt=0)
    notes: str | None = None


class LeaseOut(CamelModel):
    id: str
    organisation_id: str
    property_id: str
    unit_id: str | None
    tenant_id: str | None
    status: str
    # terms
    start_date: str          # ISO date string
    end_date: str | None     # None = rolling
    is_rolling: bool
    monthly_rent: float
    currency: str
    deposit_amount: float | None
    deposit_paid: bool
    deposit_paid_at: str | None
    # billing rules
    rent_day_of_month: int
    grace_period_days: int
    late_fee_type: str
    late_fee_value: float
    notice_period_days: int
    # lifecycle
    signed_at: str | None
    notice_given_at: str | None
    terminated_at: str | None
    termination_reason: str | None
    renewal_of_lease_id: str | None
    notes: str | None
    created_at: str
    updated_at: str
