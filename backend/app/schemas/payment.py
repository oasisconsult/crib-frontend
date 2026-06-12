"""Pydantic schemas for the payments domain."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import Field, field_validator

from app.schemas.common import CamelModel, PaginatedResponse


# ── Rent Schedule ──────────────────────────────────────────────────────────────

class RentScheduleOut(CamelModel):
    id: str
    reference: str | None = None
    organisation_id: str
    lease_id: str
    period_start: str       # ISO date
    period_end: str         # ISO date
    due_date: str           # ISO date
    amount_due: float
    amount_paid: float
    late_fee_applied: float
    balance: float          # amount_due + late_fee_applied - amount_paid
    status: str
    paid_at: str | None
    notes: str | None
    created_at: str
    updated_at: str
    # Denormalised display names (populated on org-level list queries)
    tenant_name: str | None = None
    unit_name: str | None = None
    property_name: str | None = None


# ── Payment ────────────────────────────────────────────────────────────────────

class PaymentCreate(CamelModel):
    # Optional: if supplied the payment is linked to a specific schedule.
    # If omitted, confirm_payment() allocates automatically (oldest-first).
    rent_schedule_id: str | None = None
    amount: float = Field(gt=0)
    currency: str = "UGX"
    category: str = "rent"
    method: str = "cash"
    phone: str | None = None            # mobile money: triggers STK push
    reference: str | None = None
    receipt_url: str | None = None      # bank transfer / cash proof of payment
    idempotency_key: str | None = None
    paid_at: datetime | None = None     # defaults to now() in service
    notes: str | None = None

    @field_validator("category")
    @classmethod
    def valid_category(cls, v: str) -> str:
        allowed = {"rent", "deposit", "late_fee", "other"}
        if v not in allowed:
            raise ValueError(f"category must be one of {allowed}")
        return v

    @field_validator("method")
    @classmethod
    def valid_method(cls, v: str) -> str:
        allowed = {"cash", "bank_transfer", "mobile_money_mtn", "mobile_money_airtel", "other"}
        if v not in allowed:
            raise ValueError(f"method must be one of {allowed}")
        return v


class PaymentCreateFlat(CamelModel):
    """Used by flat POST /payments — lease_id is supplied in the body."""
    lease_id: str
    rent_schedule_id: str | None = None
    amount: float = Field(gt=0)
    currency: str = "UGX"
    category: str = "rent"
    method: str = "cash"
    phone: str | None = None            # mobile money: triggers STK push
    reference: str | None = None
    receipt_url: str | None = None      # bank transfer / cash proof of payment
    idempotency_key: str | None = None
    paid_at: datetime | None = None
    notes: str | None = None

    @field_validator("category")
    @classmethod
    def valid_category(cls, v: str) -> str:
        allowed = {"rent", "deposit", "late_fee", "other"}
        if v not in allowed:
            raise ValueError(f"category must be one of {allowed}")
        return v

    @field_validator("method")
    @classmethod
    def valid_method(cls, v: str) -> str:
        allowed = {"cash", "bank_transfer", "mobile_money_mtn", "mobile_money_airtel", "other"}
        if v not in allowed:
            raise ValueError(f"method must be one of {allowed}")
        return v


class ManualPaymentCreate(CamelModel):
    """Used by POST /leases/{id}/payments/record to record an out-of-band payment."""
    amount: float = Field(gt=0)
    currency: str = "UGX"
    category: str = "rent"
    method: str = "bank_transfer"
    paid_at: datetime | None = None   # when the tenant actually paid; defaults to now()
    reference: str | None = None      # mobile money / bank transaction reference
    notes: str | None = None

    @field_validator("category")
    @classmethod
    def valid_category(cls, v: str) -> str:
        allowed = {"rent", "deposit", "late_fee", "other"}
        if v not in allowed:
            raise ValueError(f"category must be one of {allowed}")
        return v

    @field_validator("method")
    @classmethod
    def valid_method(cls, v: str) -> str:
        allowed = {"cash", "bank_transfer", "mobile_money_mtn", "mobile_money_airtel", "cheque", "other"}
        if v not in allowed:
            raise ValueError(f"method must be one of {allowed}")
        return v


class PaymentOut(CamelModel):
    id: str
    organisation_id: str
    lease_id: str
    rent_schedule_id: str | None
    amount: float
    currency: str
    category: str
    method: str
    reference: str | None
    idempotency_key: str | None
    status: str
    paid_at: str | None
    notes: str | None
    # Adaptive fields
    failure_reason: str | None = None
    retry_count: int = 0
    predicted_failure_score: float | None = None
    recommended_channel: str | None = None
    # Rejection audit (set when org staff rejects)
    rejection_reason: str | None = None
    rejected_at: str | None = None
    rejected_by_profile_id: str | None = None
    # Cancellation audit (set when tenant cancels)
    cancellation_reason: str | None = None
    cancelled_at: str | None = None
    created_at: str
    updated_at: str
    # Denormalised display names
    tenant_name: str | None = None
    unit_name: str | None = None
    property_name: str | None = None
    # Informational message returned to the client (e.g. "Check your phone for PIN")
    message: str | None = None


class PaymentRejectBody(CamelModel):
    reason: str = Field(min_length=1, description="Why this payment is being rejected")


class PaymentCancelBody(CamelModel):
    reason: str | None = Field(None, description="Optional reason for cancellation (shown to manager)")


# ── Late Fee ───────────────────────────────────────────────────────────────────

class LateFeeOut(CamelModel):
    id: str
    organisation_id: str
    lease_id: str
    rent_schedule_id: str
    fee_type: str
    calculated_amount: float
    applied_at: str
    waived: bool
    waived_at: str | None
    waived_reason: str | None
    created_at: str
    updated_at: str


class LateFeeWaive(CamelModel):
    reason: str = Field(min_length=1)


# ── Deposit ────────────────────────────────────────────────────────────────────

class DeductionItem(CamelModel):
    reason: str = Field(min_length=1)
    amount: float = Field(gt=0)


class DepositReturn(CamelModel):
    amount_returned: float = Field(gt=0)
    deductions: list[DeductionItem] = []
    notes: str | None = None


class DepositOut(CamelModel):
    id: str
    organisation_id: str
    lease_id: str
    amount_held: float
    amount_returned: float
    deductions: list[dict[str, Any]]
    status: str
    returned_at: str | None
    notes: str | None
    created_at: str
    updated_at: str


# ── Ledger ─────────────────────────────────────────────────────────────────────

class LedgerOut(CamelModel):
    lease_id: str
    currency: str
    # Rent
    total_rent_due: float
    total_rent_paid: float
    total_rent_outstanding: float
    overdue_schedules: int
    # Late fees
    total_late_fees: float
    total_late_fees_waived: float
    # Deposit
    deposit_held: float | None
    deposit_returned: float | None
    deposit_status: str | None
    # Payments summary
    total_payments: int
    total_confirmed: float


# ── Payment Allocation ─────────────────────────────────────────────────────────

class PaymentAllocationOut(CamelModel):
    id: str
    payment_id: str
    rent_schedule_id: str
    amount_applied: float
    created_at: str
    updated_at: str


# ── Ledger ─────────────────────────────────────────────────────────────────────

class LedgerEntryOut(CamelModel):
    id: str
    organisation_id: str
    lease_id: str
    entry_type: str           # "credit" | "debit"
    amount: float
    reference_type: str       # "payment" | "refund" | "late_fee" | "deposit" | "overpayment" | "wallet"
    reference_id: str
    balance_after: float
    description: str | None
    created_at: str
    updated_at: str


class LedgerPageOut(CamelModel):
    data: list[LedgerEntryOut]
    total: int
    page: int
    page_size: int
    has_next: bool
    current_balance: float


# ── Wallet ─────────────────────────────────────────────────────────────────────

class WalletOut(CamelModel):
    id: str
    tenant_id: str
    organisation_id: str
    balance: float
    currency: str
    created_at: str
    updated_at: str


class WalletTransactionOut(CamelModel):
    id: str
    tenant_id: str
    organisation_id: str
    transaction_type: str     # "credit" | "debit"
    amount: float
    reference_type: str
    reference_id: str | None
    description: str | None
    balance_after: float
    created_at: str
    updated_at: str


WalletTransactionPageOut = PaginatedResponse[WalletTransactionOut]


# ── Adaptive Payment (v4 skill) ────────────────────────────────────────────────

class ChannelCostEstimateOut(CamelModel):
    channel: str
    fee_percent: float
    fee_amount: float
    total_amount: float


class PaymentEstimateRequest(CamelModel):
    amount: float = Field(gt=0)
    currency: str = "UGX"
    tenant_id: str | None = None   # optional — enables per-tenant failure prediction


class PaymentDecisionOut(CamelModel):
    recommended_channel: str
    predicted_failure_score: float
    retry_strategy: str            # none | immediate | delayed | next_day
    cost_estimates: list[ChannelCostEstimateOut]
    explain: str


# ── Mobile Money ───────────────────────────────────────────────────────────────

class MobileMoneyTransactionOut(CamelModel):
    id: str
    organisation_id: str
    provider: str             # "MTN" | "AIRTEL"
    external_id: str
    phone_number: str
    amount: float
    currency: str
    status: str               # pending | received | matched | unmatched | failed | expired
    received_at: str | None
    matched_payment_id: str | None
    reference_id: str | None
    created_at: str
    updated_at: str


MobileMoneyPageOut = PaginatedResponse[MobileMoneyTransactionOut]


# ── Bulk confirm ───────────────────────────────────────────────────────────────

class BulkConfirmRequest(CamelModel):
    payment_ids: list[uuid.UUID] = Field(
        ...,
        min_length=1,
        max_length=50,
        description="IDs of payments to confirm. Max 50 per request.",
    )


class BulkConfirmFailure(CamelModel):
    id: uuid.UUID
    reason: str


class BulkConfirmResult(CamelModel):
    confirmed: list[PaymentOut]
    failed: list[BulkConfirmFailure]


# ── Wallet credit ──────────────────────────────────────────────────────────────

class WalletCreditRequest(CamelModel):
    amount: float = Field(..., gt=0, description="Amount to credit (positive, in org currency)")
    description: str | None = Field(None, max_length=255)
