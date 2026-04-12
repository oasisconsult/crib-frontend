"""
Unit tests for the v4 Payment State Machine.

Coverage:
  - VALID_TRANSITIONS table completeness
  - Helper predicates: is_terminal, is_success, is_failed, is_retryable,
    can_be_confirmed, can_be_refunded
  - transition() happy path (all states, all edges)
  - transition() raises InvalidPaymentTransitionError on bad edges
  - predict_and_route() compound transition (initiated → predicted → routed)
  - predict_and_route() blocks on high score (initiated → predicted_failure)
  - predict_and_route() idempotent from predicted / routed
  - advance_to_completed() full chain (pending → reconciled → allocated → completed)
  - advance_to_completed() no-op when already at terminal success
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.payment import Payment, PaymentMethod, PaymentStatus
from app.services.payment_state_machine import (
    FAILED_TERMINAL,
    IN_PROGRESS,
    SUCCESSFUL_TERMINAL,
    TERMINAL,
    VALID_TRANSITIONS,
    InvalidPaymentTransitionError,
    advance_to_completed,
    can_be_confirmed,
    can_be_refunded,
    is_failed,
    is_retryable,
    is_success,
    is_terminal,
    predict_and_route,
    transition,
)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_payment(status: PaymentStatus = PaymentStatus.initiated) -> Payment:
    """Build a transient Payment with the given status (not persisted)."""
    p = Payment(
        organisation_id=uuid.uuid4(),
        lease_id=uuid.uuid4(),
        amount=500_000,
        currency="UGX",
        category="rent",
        method=PaymentMethod.cash,
        status=status,
        retry_count=0,
    )
    p.id = uuid.uuid4()  # simulate DB-assigned PK
    return p


def _db_mock() -> AsyncMock:
    """Minimal async session mock: flush is a no-op."""
    db = AsyncMock(spec=AsyncSession)
    db.flush = AsyncMock(return_value=None)
    return db


# ── Transition table ────────────────────────────────────────────────────────────

class TestTransitionTable:
    def test_all_status_values_have_entry(self):
        """Every PaymentStatus must appear as a key in VALID_TRANSITIONS."""
        for s in PaymentStatus:
            assert s in VALID_TRANSITIONS, f"{s!r} missing from VALID_TRANSITIONS"

    def test_terminal_states_have_no_outgoing_except_defined(self):
        """permanently_failed and refunded are truly terminal."""
        assert VALID_TRANSITIONS[PaymentStatus.permanently_failed] == set()
        assert VALID_TRANSITIONS[PaymentStatus.refunded] == set()

    def test_completed_only_allows_refund(self):
        assert VALID_TRANSITIONS[PaymentStatus.completed] == {PaymentStatus.refunded}

    def test_confirmed_allows_refund_and_upgrade(self):
        assert PaymentStatus.refunded in VALID_TRANSITIONS[PaymentStatus.confirmed]
        assert PaymentStatus.completed in VALID_TRANSITIONS[PaymentStatus.confirmed]

    def test_in_progress_disjoint_from_terminal(self):
        assert IN_PROGRESS.isdisjoint(TERMINAL)

    def test_in_progress_union_terminal_equals_all_statuses(self):
        assert IN_PROGRESS | TERMINAL == set(PaymentStatus)


# ── Predicate helpers ──────────────────────────────────────────────────────────

class TestPredicates:
    @pytest.mark.parametrize("s", [PaymentStatus.completed, PaymentStatus.confirmed])
    def test_is_success(self, s):
        assert is_success(s)

    @pytest.mark.parametrize("s", [
        PaymentStatus.permanently_failed,
        PaymentStatus.predicted_failure,
        PaymentStatus.failed,
    ])
    def test_is_failed(self, s):
        assert is_failed(s)

    @pytest.mark.parametrize("s", [
        PaymentStatus.initiated, PaymentStatus.predicted, PaymentStatus.routed,
        PaymentStatus.pending, PaymentStatus.reconciled, PaymentStatus.allocated,
        PaymentStatus.retry_scheduled,
    ])
    def test_is_terminal_false_for_in_progress(self, s):
        assert not is_terminal(s)

    def test_is_terminal_true_for_terminal_states(self):
        for s in TERMINAL:
            assert is_terminal(s)

    def test_is_retryable(self):
        assert is_retryable(PaymentStatus.retry_scheduled)
        assert is_retryable(PaymentStatus.failed)
        assert not is_retryable(PaymentStatus.permanently_failed)
        assert not is_retryable(PaymentStatus.completed)
        assert not is_retryable(PaymentStatus.pending)

    @pytest.mark.parametrize("s", [
        PaymentStatus.initiated, PaymentStatus.predicted, PaymentStatus.routed,
        PaymentStatus.pending, PaymentStatus.reconciled, PaymentStatus.allocated,
        PaymentStatus.confirmed,
    ])
    def test_can_be_confirmed(self, s):
        assert can_be_confirmed(s)

    @pytest.mark.parametrize("s", [PaymentStatus.completed, PaymentStatus.confirmed])
    def test_can_be_refunded(self, s):
        assert can_be_refunded(s)

    def test_cannot_refund_pending(self):
        assert not can_be_refunded(PaymentStatus.pending)
        assert not can_be_refunded(PaymentStatus.initiated)
        assert not can_be_refunded(PaymentStatus.permanently_failed)


# ── Core transition() ──────────────────────────────────────────────────────────

class TestTransition:
    @pytest.mark.asyncio
    async def test_valid_transition_mutates_status(self):
        p = _make_payment(PaymentStatus.initiated)
        db = _db_mock()
        with patch("app.core.events.emit_payment_state_changed", new_callable=AsyncMock):
            result = await transition(p, PaymentStatus.predicted, db)
        assert result.status == PaymentStatus.predicted

    @pytest.mark.asyncio
    async def test_valid_transition_calls_flush(self):
        p = _make_payment(PaymentStatus.pending)
        db = _db_mock()
        with patch("app.core.events.emit_payment_state_changed", new_callable=AsyncMock):
            await transition(p, PaymentStatus.reconciled, db)
        db.flush.assert_called_once()

    @pytest.mark.asyncio
    async def test_invalid_transition_raises(self):
        p = _make_payment(PaymentStatus.initiated)
        db = _db_mock()
        with pytest.raises(InvalidPaymentTransitionError) as exc_info:
            await transition(p, PaymentStatus.completed, db)
        assert exc_info.value.status_code == 400
        assert exc_info.value.from_state == PaymentStatus.initiated

    @pytest.mark.asyncio
    async def test_happy_path_full_chain(self):
        """Walk the entire happy path: initiated→predicted→routed→pending→reconciled→allocated→completed."""
        db = _db_mock()
        p = _make_payment(PaymentStatus.initiated)
        path = [
            PaymentStatus.predicted,
            PaymentStatus.routed,
            PaymentStatus.pending,
            PaymentStatus.reconciled,
            PaymentStatus.allocated,
            PaymentStatus.completed,
        ]
        with patch("app.core.events.emit_payment_state_changed", new_callable=AsyncMock):
            for next_status in path:
                await transition(p, next_status, db)
        assert p.status == PaymentStatus.completed

    @pytest.mark.asyncio
    async def test_failure_path(self):
        p = _make_payment(PaymentStatus.pending)
        db = _db_mock()
        with patch("app.core.events.emit_payment_state_changed", new_callable=AsyncMock):
            await transition(p, PaymentStatus.retry_scheduled, db)
            assert p.status == PaymentStatus.retry_scheduled
            await transition(p, PaymentStatus.permanently_failed, db)
        assert p.status == PaymentStatus.permanently_failed

    @pytest.mark.asyncio
    async def test_refund_from_completed(self):
        p = _make_payment(PaymentStatus.completed)
        db = _db_mock()
        with patch("app.core.events.emit_payment_state_changed", new_callable=AsyncMock):
            await transition(p, PaymentStatus.refunded, db)
        assert p.status == PaymentStatus.refunded

    @pytest.mark.asyncio
    async def test_refund_from_confirmed_legacy(self):
        p = _make_payment(PaymentStatus.confirmed)
        db = _db_mock()
        with patch("app.core.events.emit_payment_state_changed", new_callable=AsyncMock):
            await transition(p, PaymentStatus.refunded, db)
        assert p.status == PaymentStatus.refunded

    @pytest.mark.asyncio
    async def test_permanently_failed_is_terminal(self):
        p = _make_payment(PaymentStatus.permanently_failed)
        db = _db_mock()
        with pytest.raises(InvalidPaymentTransitionError):
            await transition(p, PaymentStatus.pending, db)


# ── predict_and_route() ────────────────────────────────────────────────────────

class TestPredictAndRoute:
    @pytest.mark.asyncio
    async def test_initiated_to_routed(self):
        """Low score: initiated → predicted → routed."""
        p = _make_payment(PaymentStatus.initiated)
        p.method = PaymentMethod.cash
        db = _db_mock()

        with (
            patch("app.core.events.emit_payment_state_changed", new_callable=AsyncMock),
            patch("app.services.adaptive_payment_service.predict_failure_score", new_callable=AsyncMock, return_value=0.05),
            patch("app.services.adaptive_payment_service.recommend_channel", new_callable=AsyncMock, return_value={
                "recommended_channel": "cash",
            }),
        ):
            result = await predict_and_route(p, db)

        assert result.status == PaymentStatus.routed
        assert result.predicted_failure_score == pytest.approx(0.05, abs=0.01)
        assert result.recommended_channel == "cash"

    @pytest.mark.asyncio
    async def test_high_score_blocks_at_predicted_failure(self):
        """Score ≥ 0.85 → predicted_failure."""
        p = _make_payment(PaymentStatus.initiated)
        p.method = PaymentMethod.mobile_money_mtn
        db = _db_mock()

        with (
            patch("app.core.events.emit_payment_state_changed", new_callable=AsyncMock),
            patch("app.services.adaptive_payment_service.predict_failure_score", new_callable=AsyncMock, return_value=0.90),
        ):
            result = await predict_and_route(p, db)

        assert result.status == PaymentStatus.predicted_failure
        assert result.predicted_failure_score == pytest.approx(0.90, abs=0.01)

    @pytest.mark.asyncio
    async def test_idempotent_from_predicted(self):
        """If already predicted, only routes (skips prediction step)."""
        p = _make_payment(PaymentStatus.predicted)
        p.method = PaymentMethod.bank_transfer
        db = _db_mock()

        with (
            patch("app.core.events.emit_payment_state_changed", new_callable=AsyncMock),
            patch("app.services.adaptive_payment_service.recommend_channel", new_callable=AsyncMock, return_value={
                "recommended_channel": "bank_transfer",
            }),
        ):
            result = await predict_and_route(p, db)

        assert result.status == PaymentStatus.routed

    @pytest.mark.asyncio
    async def test_idempotent_from_routed(self):
        """Already routed — nothing to do."""
        p = _make_payment(PaymentStatus.routed)
        db = _db_mock()
        with patch("app.core.events.emit_payment_state_changed", new_callable=AsyncMock):
            result = await predict_and_route(p, db)
        assert result.status == PaymentStatus.routed


# ── advance_to_completed() ─────────────────────────────────────────────────────

class TestAdvanceToCompleted:
    @pytest.mark.asyncio
    async def test_pending_to_completed(self):
        """pending → reconciled → allocated → completed."""
        p = _make_payment(PaymentStatus.pending)
        db = _db_mock()
        with patch("app.core.events.emit_payment_state_changed", new_callable=AsyncMock):
            result = await advance_to_completed(p, db)
        assert result.status == PaymentStatus.completed

    @pytest.mark.asyncio
    async def test_from_reconciled(self):
        """reconciled → allocated → completed."""
        p = _make_payment(PaymentStatus.reconciled)
        db = _db_mock()
        with patch("app.core.events.emit_payment_state_changed", new_callable=AsyncMock):
            result = await advance_to_completed(p, db)
        assert result.status == PaymentStatus.completed

    @pytest.mark.asyncio
    async def test_from_allocated(self):
        """allocated → completed only."""
        p = _make_payment(PaymentStatus.allocated)
        db = _db_mock()
        with patch("app.core.events.emit_payment_state_changed", new_callable=AsyncMock):
            result = await advance_to_completed(p, db)
        assert result.status == PaymentStatus.completed

    @pytest.mark.asyncio
    async def test_noop_if_already_completed(self):
        p = _make_payment(PaymentStatus.completed)
        db = _db_mock()
        with patch("app.core.events.emit_payment_state_changed", new_callable=AsyncMock):
            result = await advance_to_completed(p, db)
        assert result.status == PaymentStatus.completed
        db.flush.assert_not_called()

    @pytest.mark.asyncio
    async def test_noop_if_confirmed_legacy(self):
        p = _make_payment(PaymentStatus.confirmed)
        db = _db_mock()
        with patch("app.core.events.emit_payment_state_changed", new_callable=AsyncMock):
            result = await advance_to_completed(p, db)
        assert result.status == PaymentStatus.confirmed  # already terminal success, unchanged
        db.flush.assert_not_called()
