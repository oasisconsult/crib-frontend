"""
Generic state machine helper used across all domain workflows.

Usage:
    from app.core.state_machine import StateMachine, InvalidTransition

    sm = StateMachine(ONBOARDING_TRANSITIONS)
    new_state = sm.transition(current_state, "TENANT_APPROVED")
"""

from __future__ import annotations

from typing import Generic, TypeVar

from fastapi import HTTPException, status

S = TypeVar("S", bound=str)
E = TypeVar("E", bound=str)


class InvalidTransition(Exception):
    pass


class StateMachine(Generic[S, E]):
    def __init__(self, transitions: dict[S, dict[E, S]]) -> None:
        self._transitions = transitions

    def can(self, state: S, event: E) -> bool:
        return event in self._transitions.get(state, {})

    def transition(self, state: S, event: E) -> S:
        next_state = self._transitions.get(state, {}).get(event)
        if next_state is None:
            raise InvalidTransition(
                f"Cannot apply event '{event}' in state '{state}'"
            )
        return next_state

    def transition_or_422(self, state: S, event: E) -> S:
        """Like transition() but raises an HTTP 422 instead of InvalidTransition."""
        try:
            return self.transition(state, event)
        except InvalidTransition as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(exc),
            ) from exc


# ── Onboarding state machine ──────────────────────────────────────────────────

from app.models.tenant import OnboardingState  # noqa: E402

ONBOARDING_TRANSITIONS: dict[OnboardingState, dict[str, OnboardingState]] = {
    OnboardingState.invited:   {"ONBOARDING_STARTED": OnboardingState.started},
    OnboardingState.started:   {"ONBOARDING_COMPLETED": OnboardingState.submitted},
    OnboardingState.submitted: {
        "TENANT_APPROVED": OnboardingState.approved,
        "TENANT_REJECTED": OnboardingState.rejected,
    },
    OnboardingState.approved:  {"TENANT_ACTIVATED": OnboardingState.activated},
    OnboardingState.activated: {},
    OnboardingState.rejected:  {
        "INVITE_SENT":  OnboardingState.invited,    # landlord manually resends (fresh start)
        "RESUBMITTED":  OnboardingState.submitted,  # tenant adds new docs and resubmits
    },
}

onboarding_sm = StateMachine(ONBOARDING_TRANSITIONS)


# ── Lease onboarding state machine ────────────────────────────────────────────
# This machine governs the tenant-facing payment-before-signing flow.
# The manager fast-path (draft → active directly) is handled in lease_service
# and does NOT use this machine.

from app.models.lease import LeaseStatus  # noqa: E402

LEASE_ONBOARDING_TRANSITIONS: dict[str, dict[str, str]] = {
    LeaseStatus.draft:               {"TENANT_OPENED_LINK":    LeaseStatus.onboarding_started},
    LeaseStatus.onboarding_started:  {"AGREEMENT_PREVIEWED":   LeaseStatus.agreement_previewed},
    LeaseStatus.agreement_previewed: {"TERMS_ACCEPTED":        LeaseStatus.terms_accepted},
    LeaseStatus.terms_accepted:      {"PAYMENT_SUBMITTED":     LeaseStatus.payment_pending},
    LeaseStatus.payment_pending:     {
        "PAYMENT_CONFIRMED":  LeaseStatus.payment_secured,
        "PAYMENT_FAILED":     LeaseStatus.terms_accepted,   # retry: back to accepted
    },
    LeaseStatus.payment_secured:     {"AGREEMENT_SIGNED":      LeaseStatus.agreement_signed},
    LeaseStatus.agreement_signed:    {"ACTIVATED":             LeaseStatus.active},
}

lease_onboarding_sm = StateMachine(LEASE_ONBOARDING_TRANSITIONS)
