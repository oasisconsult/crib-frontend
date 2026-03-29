"""Pydantic schemas for the payments domain."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field, field_validator

from app.schemas.common import CamelModel


# ── Rent Schedule ──────────────────────────────────────────────────────────────

class RentScheduleOut(CamelModel):
    id: str
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


# ── Payment ────────────────────────────────────────────────────────────────────

class PaymentCreate(CamelModel):
    rent_schedule_id: str
    amount: float = Field(gt=0)
    currency: str = "UGX"
    category: str = "rent"
    method: str = "cash"
    reference: str | None = None
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
    created_at: str
    updated_at: str


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
