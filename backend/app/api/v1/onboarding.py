"""
Tenant onboarding payment flow — public token-authenticated endpoints.

All routes except /payment/{pid}/confirm are public (no JWT required).
The onboarding invite token is the credential.

Routes:
  GET  /tenants/onboarding/{token}/flow    → full state for wizard resume
  POST /tenants/onboarding/{token}/preview → generate/return agreement preview
  POST /tenants/onboarding/{token}/accept-terms  → record terms acceptance
  POST /tenants/onboarding/{token}/payment → submit onboarding payments
  POST /tenants/onboarding/{token}/payment/{pid}/confirm → manager confirms a payment
  POST /tenants/onboarding/{token}/sign    → tenant signs final agreement
"""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_org_access
from app.core.database import get_db
from app.schemas.onboarding import (
    AgreementPreviewOut,
    OnboardingFlowStatus,
    OnboardingPaymentCreate,
    OnboardingPaymentOut,
    OnboardingSignBody,
    TermsAcceptBody,
    TermsAcceptOut,
)
from app.services import onboarding_service as svc

router = APIRouter(prefix="/tenants/onboarding", tags=["onboarding-flow"])

# Auth dependency for manager-only endpoints
_manager_write = Depends(require_org_access(allow_tenant_own=False))


# ── Status / resume ────────────────────────────────────────────────────────────

@router.get("/{token}/flow", response_model=OnboardingFlowStatus)
async def get_flow_status(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Returns full onboarding state so the wizard can resume from the correct step.
    Also auto-transitions the tenant from invited → started on first visit.
    """
    return await svc.get_onboarding_flow_status(token, db)


# ── Agreement preview ──────────────────────────────────────────────────────────

@router.post(
    "/{token}/preview",
    response_model=AgreementPreviewOut,
    status_code=status.HTTP_200_OK,
)
async def preview_agreement(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Generate and store the agreement terms snapshot.
    Returns the same snapshot on repeated calls (idempotent).
    Requires: tenant.onboarding_state == approved, lease linked to invite.
    """
    return await svc.preview_agreement(token, db)


# ── Terms acceptance ───────────────────────────────────────────────────────────

@router.post(
    "/{token}/accept-terms",
    response_model=TermsAcceptOut,
    status_code=status.HTTP_200_OK,
)
async def accept_terms(
    token: str,
    body: TermsAcceptBody,
    db: AsyncSession = Depends(get_db),
):
    """
    Record explicit terms acceptance.
    body.accepted must be True.
    Idempotent: repeated calls return current state.
    """
    return await svc.accept_terms(token, body, db)


# ── Payment ────────────────────────────────────────────────────────────────────

@router.post(
    "/{token}/payment",
    response_model=OnboardingPaymentOut,
    status_code=status.HTTP_200_OK,
)
async def submit_payments(
    token: str,
    body: OnboardingPaymentCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Submit onboarding payment records (deposit + advance rent).
    Each item carries a client idempotency_key.
    If auto-confirm is enabled for the method, payments are confirmed immediately
    and the lease advances to payment_secured.
    """
    return await svc.submit_onboarding_payments(token, body, db)


@router.post(
    "/{token}/payment/{payment_id}/confirm",
    response_model=OnboardingPaymentOut,
    status_code=status.HTTP_200_OK,
)
async def confirm_payment(
    token: str,
    payment_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Manager or webhook confirms a specific onboarding payment.
    When all onboarding payments are confirmed the lease advances to payment_secured.
    No auth required — token is the credential. For stronger security, wire
    this through the manager dashboard which does require JWT auth.
    """
    return await svc.confirm_onboarding_payment(token, payment_id, db)


# ── Signing ────────────────────────────────────────────────────────────────────

@router.post(
    "/{token}/sign",
    status_code=status.HTTP_200_OK,
)
async def sign_agreement(
    token: str,
    body: OnboardingSignBody,
    db: AsyncSession = Depends(get_db),
):
    """
    Tenant signs the final agreement.
    Validates snapshot integrity (final == preview), then auto-activates the lease.
    Returns the activated LeaseOut.
    """
    return await svc.sign_agreement(token, body, db)
