"""
Subscription & Billing models.

Five tables:
  subscription_plans            — product catalogue
  organisation_subscriptions    — one active subscription per org (1:1)
  subscription_invoices         — generated invoices
  subscription_payments         — proof-of-payment submissions
  subscription_audit_log        — immutable lifecycle event trail
"""
from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger, Boolean, Date, DateTime, Enum, ForeignKey,
    Integer, String, Text, func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import TimestampedBase, Base


# ── Enums ──────────────────────────────────────────────────────────────────────

class SubscriptionStatus(str, enum.Enum):
    trialing            = "trialing"
    active              = "active"
    pending_payment     = "pending_payment"
    pending_verification = "pending_verification"
    grace_period        = "grace_period"
    past_due            = "past_due"
    suspended           = "suspended"
    cancelled           = "cancelled"
    expired             = "expired"


class BillingCycle(str, enum.Enum):
    none    = "none"
    monthly = "monthly"
    annual  = "annual"


class BillingCurrency(str, enum.Enum):
    UGX = "UGX"
    USD = "USD"


class SubscriptionPaymentMethod(str, enum.Enum):
    mtn_momo      = "mtn_momo"
    airtel_money  = "airtel_money"
    bank_transfer = "bank_transfer"
    cash          = "cash"


class SubscriptionPaymentStatus(str, enum.Enum):
    pending              = "pending"
    pending_verification = "pending_verification"
    verified             = "verified"
    rejected             = "rejected"
    refunded             = "refunded"


class InvoiceStatus(str, enum.Enum):
    draft   = "draft"
    issued  = "issued"
    paid    = "paid"
    void    = "void"
    overdue = "overdue"


class SubscriptionEventType(str, enum.Enum):
    created              = "created"
    upgraded             = "upgraded"
    downgraded           = "downgraded"
    cancelled            = "cancelled"
    reinstated           = "reinstated"
    payment_submitted    = "payment_submitted"
    payment_verified     = "payment_verified"
    payment_rejected     = "payment_rejected"
    suspended            = "suspended"
    grace_period_started = "grace_period_started"
    expired              = "expired"
    trial_started        = "trial_started"
    plan_changed         = "plan_changed"


# ── Models ─────────────────────────────────────────────────────────────────────

class SubscriptionPlan(TimestampedBase):
    """Product catalogue entry — managed by superadmin."""
    __tablename__ = "subscription_plans"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Prices stored as integers — UGX full amount, USD in cents
    monthly_price_ugx: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    annual_price_ugx: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    monthly_price_usd_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    annual_price_usd_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Limits (-1 = unlimited)
    max_properties: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    max_units: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    max_users: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    max_storage_mb: Mapped[int] = mapped_column(Integer, nullable=False, default=100)

    features: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    trial_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_publicly_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    def monthly_price(self, currency: str) -> int:
        return self.monthly_price_ugx if currency == "UGX" else self.monthly_price_usd_cents

    def annual_price(self, currency: str) -> int:
        return self.annual_price_ugx if currency == "UGX" else self.annual_price_usd_cents

    def price_for_cycle(self, cycle: str, currency: str) -> int:
        if cycle == "annual":
            return self.annual_price(currency)
        return self.monthly_price(currency)

    def __repr__(self) -> str:
        return f"<SubscriptionPlan {self.slug!r}>"


class OrganisationSubscription(TimestampedBase):
    """One active subscription per organisation."""
    __tablename__ = "organisation_subscriptions"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False, unique=True, index=True,
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subscription_plans.id"), nullable=False,
    )

    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(SubscriptionStatus, name="subscription_status_enum", create_type=False),
        nullable=False, default=SubscriptionStatus.active,
    )
    billing_cycle: Mapped[BillingCycle] = mapped_column(
        Enum(BillingCycle, name="billing_cycle_enum", create_type=False),
        nullable=False, default=BillingCycle.none,
    )
    currency: Mapped[BillingCurrency] = mapped_column(
        Enum(BillingCurrency, name="billing_currency_enum", create_type=False),
        nullable=False, default=BillingCurrency.UGX,
    )

    current_period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    grace_period_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_invoice_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    auto_renew: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancellation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Denormalised price snapshot for audit
    price_paid: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    price_currency: Mapped[str | None] = mapped_column(String(3), nullable=True)

    # Relationships — selectin loads eagerly in async context; avoids MissingGreenlet
    plan: Mapped[SubscriptionPlan] = relationship("SubscriptionPlan", lazy="selectin")

    @property
    def is_free_plan(self) -> bool:
        return self.plan.slug == "free"

    @property
    def is_paid_active(self) -> bool:
        return self.status in (
            SubscriptionStatus.active,
            SubscriptionStatus.trialing,
            SubscriptionStatus.grace_period,
        )

    def __repr__(self) -> str:
        return f"<OrganisationSubscription org={self.organisation_id} plan={self.plan_id} status={self.status}>"


class SubscriptionInvoice(TimestampedBase):
    """Generated invoice for a billing cycle."""
    __tablename__ = "subscription_invoices"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    subscription_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisation_subscriptions.id"), nullable=False,
    )

    invoice_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, index=True)
    subtotal: Mapped[int] = mapped_column(BigInteger, nullable=False)
    tax_amount: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    total: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="UGX")

    period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    status: Mapped[InvoiceStatus] = mapped_column(
        Enum(InvoiceStatus, name="invoice_status_enum", create_type=False),
        nullable=False, default=InvoiceStatus.draft,
    )
    pdf_file_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    line_items: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<SubscriptionInvoice {self.invoice_number!r} {self.status}>"


class SubscriptionPayment(TimestampedBase):
    """Proof-of-payment submission (separate from rent payment system)."""
    __tablename__ = "subscription_payments"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    subscription_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisation_subscriptions.id"), nullable=False,
    )
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subscription_invoices.id"), nullable=True,
    )

    payment_method: Mapped[SubscriptionPaymentMethod] = mapped_column(
        Enum(SubscriptionPaymentMethod, name="subscription_payment_method_enum", create_type=False),
        nullable=False,
    )
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="UGX")

    transaction_reference: Mapped[str | None] = mapped_column(String(200), nullable=True)
    phone_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    account_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    bank_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    transfer_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    proof_file_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    proof_uploaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    status: Mapped[SubscriptionPaymentStatus] = mapped_column(
        Enum(SubscriptionPaymentStatus, name="subscription_payment_status_enum", create_type=False),
        nullable=False, default=SubscriptionPaymentStatus.pending,
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    verified_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True,
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<SubscriptionPayment {self.id} {self.status} {self.amount} {self.currency}>"


class SubscriptionAuditLog(Base):
    """Immutable audit trail for subscription lifecycle events."""
    __tablename__ = "subscription_audit_log"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisation_subscriptions.id"), nullable=True,
    )
    event_type: Mapped[SubscriptionEventType] = mapped_column(
        Enum(SubscriptionEventType, name="subscription_event_enum", create_type=False),
        nullable=False,
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True,
    )
    from_plan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subscription_plans.id"), nullable=True,
    )
    to_plan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subscription_plans.id"), nullable=True,
    )
    event_metadata: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    def __repr__(self) -> str:
        return f"<SubscriptionAuditLog {self.event_type} org={self.organisation_id}>"
