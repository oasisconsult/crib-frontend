"""
Pydantic schemas for the subscription & billing system.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import Field, field_validator

from app.models.subscription import (
    BillingCurrency, BillingCycle, InvoiceStatus,
    SubscriptionEventType, SubscriptionPaymentMethod,
    SubscriptionPaymentStatus, SubscriptionStatus,
)
from app.schemas.common import CamelModel


# ── Plan schemas ───────────────────────────────────────────────────────────────

class SubscriptionPlanOut(CamelModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    monthly_price_ugx: int
    annual_price_ugx: int
    monthly_price_usd_cents: int
    annual_price_usd_cents: int
    max_properties: int
    max_units: int
    max_users: int
    max_storage_mb: int
    features: dict[str, Any]
    trial_days: int
    is_active: bool
    is_publicly_visible: bool
    requires_custom_quote: bool
    display_order: int
    created_at: datetime
    updated_at: datetime

    # Computed helpers for the frontend
    @property
    def annual_savings_percent(self) -> int:
        if self.monthly_price_ugx == 0:
            return 0
        full_year = self.monthly_price_ugx * 12
        return round((1 - self.annual_price_ugx / full_year) * 100)


class SubscriptionPlanUpdate(CamelModel):
    """Superadmin update of a plan's prices and limits."""
    name: str | None = None
    description: str | None = None
    monthly_price_ugx: int | None = None
    annual_price_ugx: int | None = None
    monthly_price_usd_cents: int | None = None
    annual_price_usd_cents: int | None = None
    max_properties: int | None = None
    max_units: int | None = None
    max_users: int | None = None
    max_storage_mb: int | None = None
    features: dict[str, Any] | None = None
    trial_days: int | None = None
    is_active: bool | None = None
    is_publicly_visible: bool | None = None
    display_order: int | None = None


# ── Subscription usage ─────────────────────────────────────────────────────────

class SubscriptionUsageOut(CamelModel):
    properties_used: int
    properties_limit: int
    units_used: int
    units_limit: int
    users_used: int
    users_limit: int
    storage_used_mb: float
    storage_limit_mb: int
    # -1 limit means unlimited
    properties_percent: float
    units_percent: float
    users_percent: float
    storage_percent: float


# ── Subscription schemas ───────────────────────────────────────────────────────

class OrganisationSubscriptionOut(CamelModel):
    id: uuid.UUID
    organisation_id: uuid.UUID
    plan: SubscriptionPlanOut
    status: SubscriptionStatus
    billing_cycle: BillingCycle
    currency: BillingCurrency
    current_period_start: datetime | None
    current_period_end: datetime | None
    trial_ends_at: datetime | None
    grace_period_until: datetime | None
    next_invoice_date: datetime | None
    auto_renew: bool
    cancelled_at: datetime | None
    price_paid: int | None
    price_currency: str | None
    created_at: datetime
    updated_at: datetime


class SelectPlanRequest(CamelModel):
    plan_id: uuid.UUID
    billing_cycle: BillingCycle
    currency: BillingCurrency = BillingCurrency.UGX


class CancelSubscriptionRequest(CamelModel):
    reason: str | None = None


# ── Invoice schemas ────────────────────────────────────────────────────────────

class SubscriptionInvoiceOut(CamelModel):
    id: uuid.UUID
    organisation_id: uuid.UUID
    subscription_id: uuid.UUID
    invoice_number: str
    subtotal: int
    tax_amount: int
    total: int
    currency: str
    period_start: datetime | None
    period_end: datetime | None
    due_date: datetime | None
    paid_at: datetime | None
    status: InvoiceStatus
    pdf_file_key: str | None
    line_items: list[Any]
    notes: str | None
    created_at: datetime


# ── Payment schemas ────────────────────────────────────────────────────────────

class SubscriptionPaymentOut(CamelModel):
    id: uuid.UUID
    organisation_id: uuid.UUID
    subscription_id: uuid.UUID
    invoice_id: uuid.UUID | None
    payment_method: SubscriptionPaymentMethod
    amount: int
    currency: str
    transaction_reference: str | None
    phone_number: str | None
    account_name: str | None
    bank_name: str | None
    transfer_date: date | None
    proof_file_key: str | None
    proof_uploaded_at: datetime | None
    status: SubscriptionPaymentStatus
    submitted_at: datetime | None
    verified_at: datetime | None
    rejection_reason: str | None
    notes: str | None
    created_at: datetime


class SubmitPaymentRequest(CamelModel):
    plan_id: uuid.UUID
    billing_cycle: BillingCycle
    currency: BillingCurrency = BillingCurrency.UGX
    payment_method: SubscriptionPaymentMethod
    amount: int = Field(gt=0)

    # Mobile money fields
    phone_number: str | None = None
    account_name: str | None = None
    transaction_reference: str | None = None

    # Bank transfer fields
    bank_name: str | None = None
    transfer_date: date | None = None

    # Proof upload — S3/MinIO key returned from presign endpoint
    proof_file_key: str | None = None

    # Cash fields
    notes: str | None = None


# ── Admin schemas ──────────────────────────────────────────────────────────────

class VerifyPaymentRequest(CamelModel):
    notes: str | None = None


class RejectPaymentRequest(CamelModel):
    reason: str = Field(min_length=5)


class AdminExtendSubscriptionRequest(CamelModel):
    days: int = Field(gt=0, le=365)
    reason: str | None = None


class AdminOverridePlanRequest(CamelModel):
    plan_id: uuid.UUID
    billing_cycle: BillingCycle
    reason: str | None = None


# ── Audit log ──────────────────────────────────────────────────────────────────

class SubscriptionAuditLogOut(CamelModel):
    id: uuid.UUID
    organisation_id: uuid.UUID
    subscription_id: uuid.UUID | None
    event_type: SubscriptionEventType
    actor_id: uuid.UUID | None
    from_plan_id: uuid.UUID | None
    to_plan_id: uuid.UUID | None
    event_data: dict[str, Any]
    created_at: datetime


# ── Billing settings (for admin settings page) ─────────────────────────────────

class BillingSettingsOut(CamelModel):
    vat_rate_percent: float
    trial_days: int
    grace_period_days: int
    invoice_prefix: str
    bank_name: str
    bank_account_name: str
    bank_account_number: str
    bank_branch: str
    bank_swift_code: str
    bank_sort_code: str
    mtn_number: str
    mtn_name: str
    airtel_number: str
    airtel_name: str
    cash_instructions: str


class BillingSettingsUpdate(CamelModel):
    vat_rate_percent: float | None = None
    trial_days: int | None = None
    grace_period_days: int | None = None
    invoice_prefix: str | None = None
    bank_name: str | None = None
    bank_account_name: str | None = None
    bank_account_number: str | None = None
    bank_branch: str | None = None
    bank_swift_code: str | None = None
    bank_sort_code: str | None = None
    mtn_number: str | None = None
    mtn_name: str | None = None
    airtel_number: str | None = None
    airtel_name: str | None = None
    cash_instructions: str | None = None


# ── Admin analytics ────────────────────────────────────────────────────────────

class BillingAnalyticsOut(CamelModel):
    total_active_subscriptions: int
    total_trialing: int
    total_suspended: int
    total_cancelled: int
    pending_verifications: int
    mrr_ugx: int
    mrr_usd_cents: int
    plan_breakdown: list[dict[str, Any]]
