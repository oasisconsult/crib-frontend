"""
Payment State Machine (v4)

Manages deterministic state transitions for the Payment domain.

State graph (happy path):
  initiated → predicted → routed → pending → reconciled → allocated → completed

Failure paths:
  predicted → predicted_failure (high score, blocked before attempt)
  routed/pending → retry_scheduled → routed (retry loop)
  retry_scheduled → permanently_failed (max retries)
  any in-progress → permanently_failed (unrecoverable)

Legacy states (backward compat):
  confirmed  ≈ completed (for existing records)
  failed     ≈ permanently_failed (for existing records)

Design principles:
  - All state changes go through `transition()` — no direct `.status =` mutations outside this module
  - Every transition emits a `payment.state_changed` Redis event
  - Invalid transitions raise `InvalidPaymentTransitionError`
  - `transition()` flushes but does not commit (caller controls the transaction)
"""

from __future__ import annotations

import uuid
from typing import Final

import structlog
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.payment import Payment, PaymentStatus

log = structlog.get_logger(__name__)


# ── Transition table ───────────────────────────────────────────────────────────

VALID_TRANSITIONS: Final[dict[PaymentStatus, set[PaymentStatus]]] = {
    # ── v4 happy path ─────────────────────────────────────────────────────────
    PaymentStatus.initiated: {
        PaymentStatus.predicted,
        PaymentStatus.routed,           # skip prediction (manual/simple payment)
        PaymentStatus.pending,          # skip routing (direct provider push)
        PaymentStatus.predicted_failure,
        PaymentStatus.permanently_failed,  # unrecoverable error at creation time
        PaymentStatus.rejected,            # org staff declines before any processing
        PaymentStatus.cancelled,           # tenant withdraws before any processing
    },
    PaymentStatus.predicted: {
        PaymentStatus.routed,
        PaymentStatus.pending,          # skip explicit routing step
        PaymentStatus.predicted_failure,
        PaymentStatus.permanently_failed,
        PaymentStatus.rejected,
        PaymentStatus.cancelled,
    },
    PaymentStatus.routed: {
        PaymentStatus.pending,
        PaymentStatus.retry_scheduled,
        PaymentStatus.permanently_failed,
        PaymentStatus.rejected,
        PaymentStatus.cancelled,
    },
    PaymentStatus.pending: {
        PaymentStatus.reconciled,
        PaymentStatus.retry_scheduled,
        PaymentStatus.permanently_failed,
        # legacy path: confirm_payment() on a plain pending payment → confirmed
        PaymentStatus.confirmed,
        PaymentStatus.completed,
        PaymentStatus.rejected,
        PaymentStatus.cancelled,
    },
    PaymentStatus.reconciled: {
        PaymentStatus.allocated,
        PaymentStatus.permanently_failed,
        PaymentStatus.rejected,         # org staff may still reject during reconciliation window
    },
    PaymentStatus.allocated: {
        PaymentStatus.completed,
        PaymentStatus.permanently_failed,
        PaymentStatus.rejected,         # org staff rejects before final completion
    },
    PaymentStatus.completed: {
        PaymentStatus.refunded,
    },

    # ── v4 failure paths ──────────────────────────────────────────────────────
    PaymentStatus.predicted_failure: {
        PaymentStatus.routed,           # manager manually overrides prediction
        PaymentStatus.rejected,         # formally close out the blocked payment
    },
    PaymentStatus.retry_scheduled: {
        PaymentStatus.routed,
        PaymentStatus.pending,
        PaymentStatus.permanently_failed,
        PaymentStatus.rejected,
        PaymentStatus.cancelled,
    },
    PaymentStatus.permanently_failed: set(),   # terminal

    # ── Human-action terminal states ──────────────────────────────────────────
    # rejected: terminal — org staff declined. Cannot be reopened.
    PaymentStatus.rejected: set(),
    # cancelled: terminal — tenant withdrew. Cannot be reopened.
    PaymentStatus.cancelled: set(),

    # ── Legacy states (backward compat) ───────────────────────────────────────
    PaymentStatus.confirmed: {
        PaymentStatus.refunded,
        PaymentStatus.completed,        # upgrade legacy confirmed → completed
    },
    PaymentStatus.failed: {
        PaymentStatus.retry_scheduled,
        PaymentStatus.permanently_failed,
    },
    PaymentStatus.refunded: set(),      # terminal
}

# States that represent a terminal success
SUCCESSFUL_TERMINAL: Final[frozenset[PaymentStatus]] = frozenset({
    PaymentStatus.completed,
    PaymentStatus.confirmed,      # legacy
})

# States that represent a terminal failure
FAILED_TERMINAL: Final[frozenset[PaymentStatus]] = frozenset({
    PaymentStatus.permanently_failed,
    PaymentStatus.predicted_failure,
    PaymentStatus.failed,         # legacy
})

# States that represent a human-action terminal (neither success nor system failure)
HUMAN_TERMINAL: Final[frozenset[PaymentStatus]] = frozenset({
    PaymentStatus.rejected,
    PaymentStatus.cancelled,
})

# All terminal states
TERMINAL: Final[frozenset[PaymentStatus]] = (
    SUCCESSFUL_TERMINAL | FAILED_TERMINAL | HUMAN_TERMINAL | {PaymentStatus.refunded}
)

# "In-progress" states — payment is alive but not settled
IN_PROGRESS: Final[frozenset[PaymentStatus]] = frozenset(
    set(PaymentStatus) - TERMINAL
)

# States from which a tenant can still cancel (before funds are reconciled)
CANCELLABLE_BY_TENANT: Final[frozenset[PaymentStatus]] = frozenset({
    PaymentStatus.initiated,
    PaymentStatus.predicted,
    PaymentStatus.routed,
    PaymentStatus.pending,
    PaymentStatus.retry_scheduled,
})

# States from which org staff can reject (anything non-terminal success, non-refunded)
REJECTABLE_BY_STAFF: Final[frozenset[PaymentStatus]] = frozenset(
    IN_PROGRESS | FAILED_TERMINAL | {PaymentStatus.predicted_failure}
)


# ── Helpers ────────────────────────────────────────────────────────────────────

def is_terminal(s: PaymentStatus) -> bool:
    return s in TERMINAL

def is_success(s: PaymentStatus) -> bool:
    return s in SUCCESSFUL_TERMINAL

def is_failed(s: PaymentStatus) -> bool:
    return s in FAILED_TERMINAL

def is_retryable(s: PaymentStatus) -> bool:
    """True if the payment can be retried (not permanently failed or terminal success)."""
    return s in {PaymentStatus.retry_scheduled, PaymentStatus.failed, PaymentStatus.permanently_failed} \
           and s not in {PaymentStatus.permanently_failed}

def can_be_confirmed(s: PaymentStatus) -> bool:
    """True if the payment is in a state that `confirm_payment` can advance it from."""
    return s in {
        PaymentStatus.initiated,
        PaymentStatus.predicted,
        PaymentStatus.routed,
        PaymentStatus.pending,
        PaymentStatus.reconciled,
        PaymentStatus.allocated,
        # legacy
        PaymentStatus.confirmed,
    }

def can_be_refunded(s: PaymentStatus) -> bool:
    """True if the payment can be refunded."""
    return s in SUCCESSFUL_TERMINAL

def can_be_rejected(s: PaymentStatus) -> bool:
    """
    True if org staff can reject the payment.

    Org staff may reject any in-progress, failed, or blocked payment that
    has NOT yet reached a terminal success or been refunded. Useful for
    clearing duplicate entries, wrong-amount payments, or suspicious transactions.
    """
    return s in REJECTABLE_BY_STAFF

def can_be_cancelled(s: PaymentStatus) -> bool:
    """
    True if the tenant can cancel the payment.

    Cancellation is limited to the early stages of the payment lifecycle —
    before funds have been reconciled with the provider. Once the payment
    reaches `reconciled`, `allocated`, or `completed` the tenant must ask
    the manager for a refund instead.
    """
    return s in CANCELLABLE_BY_TENANT


# ── Core transition ────────────────────────────────────────────────────────────

class InvalidPaymentTransitionError(HTTPException):
    def __init__(self, from_state: PaymentStatus, to_state: PaymentStatus) -> None:
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Invalid payment transition: {from_state!r} → {to_state!r}. "
                f"Allowed from {from_state!r}: "
                f"{[s.value for s in VALID_TRANSITIONS.get(from_state, set())]}"
            ),
        )
        self.from_state = from_state
        self.to_state = to_state


async def transition(
    payment: Payment,
    new_status: PaymentStatus,
    db: AsyncSession,
    *,
    reason: str | None = None,
    actor: str | None = None,
) -> Payment:
    """
    Apply a validated state transition to a Payment.

    Validates the transition against VALID_TRANSITIONS, mutates payment.status,
    flushes (does NOT commit — caller owns the transaction), and publishes a
    `payment.state_changed` event.

    Args:
        payment:    The Payment ORM object to mutate.
        new_status: Target PaymentStatus.
        db:         Active async session.
        reason:     Optional human-readable reason for the transition.
        actor:      Optional identifier of who/what triggered the transition.

    Raises:
        InvalidPaymentTransitionError: If the transition is not in VALID_TRANSITIONS.
    """
    current = payment.status if isinstance(payment.status, PaymentStatus) else PaymentStatus(payment.status)

    allowed = VALID_TRANSITIONS.get(current, set())
    if new_status not in allowed:
        raise InvalidPaymentTransitionError(current, new_status)

    old_status = current
    payment.status = new_status
    await db.flush()

    log.info(
        "payment.state_machine.transition",
        payment_id=str(payment.id),
        from_state=old_status.value,
        to_state=new_status.value,
        reason=reason,
        actor=actor,
    )

    # Publish non-fatal event
    from app.core.events import emit_payment_state_changed
    await emit_payment_state_changed(
        payment_id=str(payment.id),
        lease_id=str(payment.lease_id),
        organisation_id=str(payment.organisation_id),
        from_state=old_status.value,
        to_state=new_status.value,
        reason=reason,
    )

    return payment


# ── Compound transitions ───────────────────────────────────────────────────────

async def predict_and_route(
    payment: Payment,
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
) -> Payment:
    """
    Advance a payment from `initiated` through `predicted` to `routed`.

    Calls the adaptive service to compute a failure prediction score and
    recommended channel, saves both to the Payment, then runs the transitions:
        initiated → predicted → routed

    Safe to call even if the payment is already `predicted` or `routed`
    (skips steps already done).
    """
    from app.services.adaptive_payment_service import predict_failure_score, recommend_channel

    current = payment.status if isinstance(payment.status, PaymentStatus) else PaymentStatus(payment.status)

    effective_org_id = org_id or payment.organisation_id

    # Step 1: initiated → predicted
    if current == PaymentStatus.initiated:
        method_str = payment.method if isinstance(payment.method, str) else payment.method.value
        score = await predict_failure_score(
            amount=float(payment.amount),
            method=method_str,
            tenant_id=tenant_id,
            org_id=effective_org_id,
            db=db,
        )
        payment.predicted_failure_score = score

        # Block on extremely high prediction (score ≥ 0.85)
        if score >= 0.85:
            payment.failure_reason = f"Pre-payment failure prediction score {score:.2f} exceeds threshold 0.85"
            await transition(payment, PaymentStatus.predicted_failure, db,
                             reason=payment.failure_reason, actor="prediction_engine")
            return payment

        await transition(payment, PaymentStatus.predicted, db,
                         reason=f"Failure score: {score:.3f}", actor="prediction_engine")
        current = PaymentStatus.predicted

    # Step 2: predicted → routed
    if current == PaymentStatus.predicted:
        decision = await recommend_channel(
            amount=float(payment.amount),
            org_id=effective_org_id,
            db=db,
            tenant_id=tenant_id,
        )
        payment.recommended_channel = decision["recommended_channel"]
        await transition(payment, PaymentStatus.routed, db,
                         reason=f"Routed to {decision['recommended_channel']}", actor="routing_engine")

    return payment


async def advance_to_completed(
    payment: Payment,
    db: AsyncSession,
) -> Payment:
    """
    Advance a payment through the full confirm flow to `completed`.

    Handles payments that may still be early in the pipeline (initiated,
    predicted, routed) by stepping them forward through `pending` first,
    then continuing the standard reconciled → allocated → completed path.

    Called internally by `confirm_payment` after allocation and wallet ops.
    Each step is a discrete validated state-machine transition.
    """
    current = payment.status if isinstance(payment.status, PaymentStatus) else PaymentStatus(payment.status)

    # If already at a terminal success, nothing to do
    if is_success(current):
        return payment

    # Step early-stage payments up to `pending` first so the reconcile
    # transition below (pending → reconciled) is always valid.
    # initiated → pending  (shortest bypass; skip prediction/routing for direct confirmations)
    # predicted → pending  (skip routing)
    # routed    → pending
    if current in {PaymentStatus.initiated, PaymentStatus.predicted, PaymentStatus.routed}:
        await transition(payment, PaymentStatus.pending, db,
                         reason="Direct confirmation bypass", actor="confirm_payment")
        current = PaymentStatus.pending

    # Reconciled: provider has confirmed funds received
    if current == PaymentStatus.pending:
        await transition(payment, PaymentStatus.reconciled, db, reason="Provider reconciled", actor="confirm_payment")
        current = PaymentStatus.reconciled

    # Allocated: funds distributed to schedules
    if current == PaymentStatus.reconciled:
        await transition(payment, PaymentStatus.allocated, db, reason="Allocation complete", actor="allocation_engine")
        current = PaymentStatus.allocated

    # Completed: all accounting done
    if current == PaymentStatus.allocated:
        await transition(payment, PaymentStatus.completed, db, reason="Payment completed", actor="confirm_payment")

    return payment
