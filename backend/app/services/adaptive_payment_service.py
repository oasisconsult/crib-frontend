"""
Adaptive Payment Service (Payment Skill v3/v4)

Provides intelligent, cost-aware payment routing and failure prediction.

Key capabilities:
  - estimate_payment_cost()    — return fee estimates for each available channel
  - predict_failure_score()    — heuristic 0–1 failure likelihood for a payment
  - recommend_channel()        — pick cheapest/most reliable channel for a tenant
  - retry_payment()            — re-attempt a failed payment, incrementing retry_count

Design principles (from SKILL v4):
  - Multi-tenant: all queries are organisation_id scoped
  - Audit: every adaptive decision is logged via structlog
  - Non-fatal: prediction/routing failures never block the payment
  - Extensible: fee schedule is config-driven (org.settings.payments.channelFees)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TypedDict

import structlog
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.payment import Payment, PaymentMethod, PaymentStatus

log = structlog.get_logger(__name__)


# ── Channel fee schedule ───────────────────────────────────────────────────────
# Default fees as percentage of transaction amount.
# Can be overridden per org via org.settings.payments.channelFees.
DEFAULT_CHANNEL_FEES: dict[str, float] = {
    "mobile_money_mtn":    1.0,   # 1% MTN MoMo fee
    "mobile_money_airtel": 1.0,   # 1% Airtel Money fee
    "bank_transfer":       0.5,   # 0.5% bank transfer fee
    "cash":                0.0,   # no fee
    "other":               0.0,
}

# Channels ranked by reliability (lower = more reliable).
# Used as tiebreaker when fees are equal.
CHANNEL_RELIABILITY_RANK: dict[str, int] = {
    "cash":                1,
    "bank_transfer":       2,
    "mobile_money_mtn":    3,
    "mobile_money_airtel": 4,
    "other":               5,
}


class ChannelCostEstimate(TypedDict):
    channel: str
    fee_percent: float
    fee_amount: float
    total_amount: float


class PaymentDecision(TypedDict):
    recommended_channel: str
    predicted_failure_score: float
    retry_strategy: str
    cost_estimates: list[ChannelCostEstimate]
    explain: str


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_org_channel_fees(
    org_id: uuid.UUID,
    db: AsyncSession,
) -> dict[str, float]:
    """Return org-specific channel fees, falling back to defaults."""
    from app.models.organisation import Organisation
    org = await db.scalar(select(Organisation).where(Organisation.id == org_id))
    if org and org.settings:
        custom_fees = (org.settings or {}).get("payments", {}).get("channelFees", {})
        if custom_fees:
            merged = {**DEFAULT_CHANNEL_FEES, **custom_fees}
            return merged
    return DEFAULT_CHANNEL_FEES


async def _count_recent_failures(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    method: str | None = None,
    window_days: int = 30,
) -> tuple[int, int]:
    """
    Return (failed_count, total_count) for a tenant in the last window_days.
    Optionally filter by method.
    """
    from app.models.lease import Lease
    from datetime import timedelta

    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=window_days)

    q_base = (
        select(Payment)
        .join(Lease, Lease.id == Payment.lease_id)
        .where(
            Lease.tenant_id == tenant_id,
            Payment.created_at >= since,
        )
    )
    if method:
        q_base = q_base.where(Payment.method == method)

    total = await db.scalar(select(func.count()).select_from(q_base.subquery())) or 0
    q_failed = q_base.where(Payment.status.in_([
        PaymentStatus.failed,            # legacy
        PaymentStatus.permanently_failed,
        PaymentStatus.predicted_failure,
    ]))
    failed = await db.scalar(select(func.count()).select_from(q_failed.subquery())) or 0

    return int(failed), int(total)


# ── Public API ─────────────────────────────────────────────────────────────────

async def estimate_payment_cost(
    amount: float,
    org_id: uuid.UUID,
    db: AsyncSession,
    currency: str = "UGX",
) -> list[ChannelCostEstimate]:
    """
    Return fee estimates for each payment channel at the given amount.

    Cost model: fee = amount * (fee_percent / 100).
    """
    fees = await _get_org_channel_fees(org_id, db)
    estimates: list[ChannelCostEstimate] = []

    for channel, fee_pct in fees.items():
        fee_amount = round(amount * fee_pct / 100, 2)
        estimates.append(ChannelCostEstimate(
            channel=channel,
            fee_percent=fee_pct,
            fee_amount=fee_amount,
            total_amount=round(amount + fee_amount, 2),
        ))

    # Sort cheapest first
    estimates.sort(key=lambda e: (e["fee_amount"], CHANNEL_RELIABILITY_RANK.get(e["channel"], 99)))

    log.info(
        "adaptive.cost_estimated",
        org_id=str(org_id),
        amount=amount,
        currency=currency,
        cheapest=estimates[0]["channel"] if estimates else None,
    )
    return estimates


async def predict_failure_score(
    amount: float,
    method: str,
    tenant_id: uuid.UUID | None,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> float:
    """
    Return a heuristic failure likelihood score (0.0 = very safe, 1.0 = very risky).

    Factors:
      - base rate by channel (mobile money is riskier than cash)
      - tenant's recent failure rate on this channel (last 30 days)
      - large amounts (> 2_000_000 UGX) have elevated risk for mobile money

    This is a lightweight heuristic — no ML model required.
    """
    # Base failure rate by channel
    base_rates: dict[str, float] = {
        "mobile_money_mtn":    0.12,   # 12% historical failure rate
        "mobile_money_airtel": 0.15,
        "bank_transfer":       0.03,
        "cash":                0.00,
        "other":               0.05,
    }
    score = base_rates.get(method, 0.05)

    # Adjust for tenant history
    if tenant_id:
        failed, total = await _count_recent_failures(db, tenant_id, method)
        if total >= 3:
            tenant_rate = failed / total
            # Blend 50/50 with base rate for stability
            score = round(0.5 * score + 0.5 * tenant_rate, 3)

    # Large amount penalty for mobile money (network limits)
    if method.startswith("mobile_money") and amount > 2_000_000:
        score = min(1.0, score + 0.10)

    score = round(min(1.0, max(0.0, score)), 3)

    log.info(
        "adaptive.failure_predicted",
        org_id=str(org_id),
        tenant_id=str(tenant_id) if tenant_id else None,
        method=method,
        amount=amount,
        score=score,
    )
    return score


async def recommend_channel(
    amount: float,
    org_id: uuid.UUID,
    db: AsyncSession,
    tenant_id: uuid.UUID | None = None,
    currency: str = "UGX",
) -> PaymentDecision:
    """
    Return the recommended payment channel and a full decision payload.

    Ranking: lowest fee first, then lowest failure score, then reliability rank.
    """
    estimates = await estimate_payment_cost(amount, org_id, db, currency)

    # Score each channel
    scored: list[tuple[float, float, int, ChannelCostEstimate]] = []
    for est in estimates:
        fail_score = await predict_failure_score(amount, est["channel"], tenant_id, org_id, db)
        rank = CHANNEL_RELIABILITY_RANK.get(est["channel"], 99)
        scored.append((est["fee_amount"], fail_score, rank, est))

    scored.sort(key=lambda x: (x[0], x[1], x[2]))
    best_fee, best_fail, _, best_est = scored[0]
    recommended = best_est["channel"]

    # Retry strategy based on failure score
    if best_fail < 0.1:
        retry_strategy = "none"
    elif best_fail < 0.3:
        retry_strategy = "immediate"
    elif best_fail < 0.6:
        retry_strategy = "delayed"
    else:
        retry_strategy = "next_day"

    explain = (
        f"{recommended} selected: lowest cost ({best_est['fee_percent']}% fee = "
        f"{best_est['fee_amount']} {currency}), "
        f"predicted failure score {best_fail:.2f}"
    )

    decision = PaymentDecision(
        recommended_channel=recommended,
        predicted_failure_score=best_fail,
        retry_strategy=retry_strategy,
        cost_estimates=estimates,
        explain=explain,
    )

    log.info(
        "adaptive.channel_recommended",
        org_id=str(org_id),
        tenant_id=str(tenant_id) if tenant_id else None,
        recommended=recommended,
        failure_score=best_fail,
        retry_strategy=retry_strategy,
    )

    return decision


async def retry_payment(
    payment_id: uuid.UUID,
    lease_id: uuid.UUID,
    org_id: uuid.UUID | None,
    db: AsyncSession,
) -> Payment:
    """
    Retry a failed payment by resetting it to pending and incrementing retry_count.

    Rules:
      - Only `failed` payments can be retried.
      - Max 3 retries (configurable via org settings).
      - On retry: status → pending, retry_count += 1, failure_reason cleared.
      - Emits payment.retry_scheduled event.

    The caller (endpoint) must subsequently call confirm_payment() or initiate
    a new mobile money push — this service only resets the state.
    """
    from app.models.organisation import Organisation

    # Fetch payment (org_id is None for superadmins — platform-wide access)
    _filters = [Payment.id == payment_id, Payment.lease_id == lease_id]
    if org_id is not None:
        _filters.append(Payment.organisation_id == org_id)
    result = await db.execute(select(Payment).where(*_filters))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")

    from app.services.payment_state_machine import is_retryable, transition as sm_transition

    current = p.status if isinstance(p.status, PaymentStatus) else PaymentStatus(p.status)
    if not is_retryable(current):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Payment is not retryable. Current status: {p.status}",
        )

    # Check max retries — resolve settings from the payment's actual org
    # (not the caller's org_id, which is None for superadmins)
    org = await db.scalar(select(Organisation).where(Organisation.id == p.organisation_id))
    max_retries = ((org.settings or {}).get("payments", {}).get("maxRetries", 3)) if org else 3

    current_retries = p.retry_count or 0
    if current_retries >= max_retries:
        # Max retries hit — permanently fail via state machine
        await sm_transition(
            p, PaymentStatus.permanently_failed, db,
            reason=f"Maximum retries ({max_retries}) exceeded",
            actor="adaptive_retry",
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum retry attempts ({max_retries}) reached for this payment",
        )

    # Determine retry strategy from adaptive engine
    from app.models.lease import Lease
    lease = await db.scalar(select(Lease).where(Lease.id == lease_id))
    tenant_id = lease.tenant_id if lease else None
    method_str = p.method if isinstance(p.method, str) else p.method.value

    fail_score = await predict_failure_score(float(p.amount), method_str, tenant_id, org_id, db)

    # Step 1: current → retry_scheduled (if not already there)
    if current != PaymentStatus.retry_scheduled:
        await sm_transition(
            p, PaymentStatus.retry_scheduled, db,
            reason="Retry requested",
            actor="adaptive_retry",
        )

    # Step 2: retry_scheduled → routed (re-enter routing)
    p.retry_count = current_retries + 1
    p.failure_reason = None
    p.predicted_failure_score = fail_score
    await sm_transition(
        p, PaymentStatus.routed, db,
        reason=f"Retry #{p.retry_count}, failure score: {fail_score:.3f}",
        actor="adaptive_retry",
    )

    await db.refresh(p, attribute_names=["status", "retry_count", "failure_reason", "predicted_failure_score", "updated_at"])

    log.info(
        "adaptive.retry_scheduled",
        payment_id=str(p.id),
        lease_id=str(lease_id),
        org_id=str(org_id),
        retry_count=p.retry_count,
        fail_score=fail_score,
    )

    # Publish event (non-fatal)
    from app.core.events import emit_payment_retry_scheduled
    await emit_payment_retry_scheduled(
        payment_id=str(p.id),
        lease_id=str(lease_id),
        organisation_id=str(org_id),
        retry_count=p.retry_count,
        predicted_failure_score=fail_score,
    )

    return p


async def mark_payment_failed(
    payment: Payment,
    failure_reason: str,
    db: AsyncSession,
) -> None:
    """
    Mark a payment as permanently failed with a reason. Used by matching_service and
    mobile money polling tasks when a provider returns failed/expired status.

    Uses the state machine to transition → permanently_failed.
    Falls back to direct mutation for legacy payments already in terminal states.
    """
    from app.services.payment_state_machine import transition as sm_transition, TERMINAL

    payment.failure_reason = failure_reason
    current = payment.status if isinstance(payment.status, PaymentStatus) else PaymentStatus(payment.status)

    if current not in TERMINAL:
        await sm_transition(
            payment, PaymentStatus.permanently_failed, db,
            reason=failure_reason,
            actor="mark_payment_failed",
        )
    else:
        # Already terminal (e.g. legacy `failed`) — just persist the reason
        await db.flush()

    log.info(
        "adaptive.payment_failed",
        payment_id=str(payment.id),
        reason=failure_reason,
    )

    from app.core.events import emit_payment_failed
    await emit_payment_failed(
        payment_id=str(payment.id),
        lease_id=str(payment.lease_id),
        organisation_id=str(payment.organisation_id),
        amount=float(payment.amount),
        failure_reason=failure_reason,
    )
