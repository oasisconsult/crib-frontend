"""Pydantic schemas for Lease endpoints."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import Field, field_validator

from app.schemas.common import CamelModel


class LeaseCreate(CamelModel):
    """
    Create a draft lease.

    Billing-rule fields (rent_day_of_month, grace_period_days, etc.) are optional.
    When omitted they fall back to the property's rules; when provided they override
    the property defaults so the manager can customise per-lease.
    """
    unit_id: str
    tenant_id: str
    start_date: date
    end_date: date | None = None           # None = rolling / month-to-month
    monthly_rent: float = Field(gt=0)
    currency: str = "UGX"
    deposit_amount: float | None = None
    deposit_paid: bool = False
    notes: str | None = None
    # Advance rent months required at signing (None → falls back to unit/property/system default)
    advance_months: int | None = Field(default=None, ge=1, le=12)
    # Optional billing rule overrides (fall back to property rules when absent)
    rent_day_of_month: int | None = Field(default=None, ge=1, le=28)
    grace_period_days: int | None = Field(default=None, ge=0)
    late_fee_type: str | None = None
    late_fee_value: float | None = Field(default=None, ge=0)
    notice_period_days: int | None = Field(default=None, ge=0)

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


class LeaseStartDateCorrection(CamelModel):
    """Body for PATCH /leases/{id}/start-date — fixes a data-entry mistake."""
    start_date: date


class LeaseAdvanceMonthsCorrection(CamelModel):
    """Body for PATCH /leases/{id}/advance-months — fixes a data-entry mistake."""
    advance_months: int = Field(ge=1, le=12)


class LeaseActivate(CamelModel):
    """Optional body for PATCH /leases/{id}/activate."""
    signed_at: datetime | None = None      # defaults to now() in service


class LeaseTerminate(CamelModel):
    reason: str = Field(min_length=1)
    terminated_at: datetime | None = None  # defaults to now() in service


class LeaseNotice(CamelModel):
    """Tenant-submitted notice to vacate."""
    vacate_date: date = Field(
        description="The date the tenant intends to vacate the unit."
    )
    reason: str | None = Field(
        default=None,
        max_length=1000,
        description="Optional reason for moving out.",
    )


class LeaseBillingRulesPatch(CamelModel):
    """
    Superadmin-only: update billing rules on any lease regardless of status.

    All fields are optional.  Pass ``sync_from_property=True`` to automatically
    pull every rule from the unit/property configuration (ignoring any other
    field in this request body).
    """
    sync_from_property: bool = False
    rent_day_of_month: int | None = Field(default=None, ge=1, le=28)
    grace_period_days: int | None = Field(default=None, ge=0)
    late_fee_type: str | None = None          # "flat" | "percent"
    late_fee_value: float | None = Field(default=None, ge=0)
    notice_period_days: int | None = Field(default=None, ge=0)


class AdminLeaseOut(CamelModel):
    """Slimmer lease representation used in admin list views."""
    id: str
    organisation_id: str
    property_id: str
    unit_id: str | None
    tenant_id: str | None
    status: str
    start_date: str
    end_date: str | None
    monthly_rent: float
    currency: str
    rent_day_of_month: int
    grace_period_days: int
    late_fee_type: str
    late_fee_value: float
    notice_period_days: int
    # denormalised names for quick scan
    tenant_name: str | None = None
    unit_name: str | None = None
    property_name: str | None = None
    organisation_name: str | None = None
    created_at: str
    updated_at: str


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
    advance_months: int | None
    rent_day_of_month: int
    grace_period_days: int
    late_fee_type: str
    late_fee_value: float
    notice_period_days: int
    # lifecycle
    signed_at: str | None
    notice_given_at: str | None
    notice_vacate_date: str | None
    terminated_at: str | None
    termination_reason: str | None
    renewal_of_lease_id: str | None
    notes: str | None
    # onboarding / import
    terms_accepted_at: str | None = None
    onboarding_completed_at: str | None = None
    paper_agreement_acknowledged: bool = False
    created_at: str
    updated_at: str
    # Signature status — populated from TenancyAgreement when available
    signatures: list[dict] = []
    # Denormalised display names (avoids extra round-trips in the UI)
    tenant_name: str | None = None
    unit_name: str | None = None
    property_name: str | None = None
