"""
Pydantic schemas for the tenant onboarding payment flow.

These are distinct from lease/tenant schemas — they represent the
tenant-facing token-authenticated endpoints used in the wizard.
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import CamelModel


# ── Agreement preview ─────────────────────────────────────────────────────────

class AgreementPreviewOut(CamelModel):
    """
    Terms snapshot shown to the tenant before acceptance.
    Only financial terms and dates are included — these fields are
    what the tenant is committing to and what will be verified at signing.
    """
    lease_id: str
    tenant_name: str
    tenant_email: str
    property_name: str
    unit_name: str
    start_date: str
    end_date: str | None           # None = rolling / month-to-month
    monthly_rent: float
    currency: str
    deposit_amount: float          # 0 if no deposit
    rent_day_of_month: int
    notice_period_days: int
    grace_period_days: int
    late_fee_type: str
    late_fee_value: float
    advance_payment_months: int    # months rent required in advance (from rules)
    # Computed totals shown in payment screen
    total_deposit: float           # deposit_amount
    total_advance_rent: float      # monthly_rent × advance_payment_months
    total_due_at_onboarding: float # total_deposit + total_advance_rent
    generated_at: str              # ISO timestamp
    snapshot_version: str = "1"
    rendered_html: str = ""        # full agreement HTML for display in wizard


# ── Terms acceptance ──────────────────────────────────────────────────────────

class TermsAcceptBody(CamelModel):
    accepted: bool = Field(
        description="Must be True — any other value is rejected as a 422."
    )


class TermsAcceptOut(CamelModel):
    lease_id: str
    status: str
    terms_accepted_at: str


# ── Onboarding payment ────────────────────────────────────────────────────────

class OnboardingPaymentItem(CamelModel):
    """One payment record in the onboarding flow (deposit or advance rent)."""
    category: Literal["deposit", "rent"]
    amount: float
    currency: str
    method: str        # cash | bank_transfer | mobile_money_mtn | mobile_money_airtel
    reference: str | None = None
    idempotency_key: str = Field(
        description="Client-generated UUID. Repeated calls with the same key are idempotent."
    )


class OnboardingPaymentCreate(CamelModel):
    """
    Submit both onboarding payments in one request.
    If deposit_amount == 0 on the lease, only the rent payment is required.
    """
    payments: list[OnboardingPaymentItem] = Field(min_length=1)


class OnboardingPaymentOut(CamelModel):
    lease_id: str
    lease_status: str
    payments: list[dict]   # list of PaymentOut-shaped dicts


# ── Signing ───────────────────────────────────────────────────────────────────

class OnboardingSignBody(CamelModel):
    signature_data_url: str = Field(
        description="Base64-encoded PNG of the signature canvas."
    )
    otp_code: str | None = Field(
        default=None,
        description="6-digit email OTP. Required for identity verification. "
                    "Request via POST /tenants/onboarding/{token}/request-signing-otp",
    )


class OtpRequestOut(CamelModel):
    """Response after requesting a signing OTP."""
    lease_id: str
    email_masked: str
    expires_in_minutes: int = 15


# ── Status / resume ───────────────────────────────────────────────────────────

class OnboardingFlowStatus(CamelModel):
    """
    Complete state returned to the wizard on every GET so it can resume
    from the correct step without any local state.
    """
    tenant: dict                     # TenantOut-shaped
    invite: dict                     # TenantInviteOut-shaped
    lease: dict | None               # LeaseOut-shaped, None if no lease linked
    agreement_preview: AgreementPreviewOut | None
    onboarding_phase: Literal["profile", "payment_flow", "complete"]
    current_step: str                # maps to wizard step key
    terms_accepted_at: str | None
    payment_secured: bool
    agreement_signed: bool
    is_active: bool


# ── Countersign (manager) ─────────────────────────────────────────────────────

class PresignBody(CamelModel):
    """Body for manager pre-signing the agreement before it goes to the tenant."""
    signature_data_url: str = Field(
        description="Base64-encoded PNG of the manager/landlord's signature."
    )


class CountersignBody(CamelModel):
    """Body for manager countersigning the tenancy agreement."""
    signature_data_url: str = Field(
        description="Base64-encoded PNG of the manager's signature."
    )


class TenancyAgreementOut(CamelModel):
    """Response after tenant signs or manager countersigns."""
    id: str
    lease_id: str
    status: str                      # draft | tenant_signed | fully_executed
    tenant_signed_at: str | None
    landlord_signed_at: str | None
    landlord_signer_name: str | None
    rendered_html: str
