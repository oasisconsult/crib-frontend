"""
Redis Streams event publisher.

All significant domain events are published to a Redis Stream so that
downstream consumers (analytics, notifications, audit pipelines) can
react without coupling to the payment service directly.

Stream key naming convention:
  crib:events:{domain}
  e.g. crib:events:payments

Each entry is a flat dict of string values (Redis Streams requirement).
Nested structures are JSON-serialised under a "data" key.

Consumers read from these streams via XREADGROUP and acknowledge with XACK.
Stream retention is capped at MAXLEN 50_000 (approximate, using ~ trimming).

Events published by the payment domain:
  payment.confirmed   — a Payment moved to confirmed status
  payment.refunded    — a Payment moved to refunded status
  payment.failed      — a Payment moved to failed status
  mobile_money.received   — MobileMoneyTransaction status → received
  mobile_money.matched    — MobileMoneyTransaction linked to a Payment
  mobile_money.unmatched  — MobileMoneyTransaction could not be matched
  wallet.credited     — tenant wallet balance increased
  wallet.debited      — tenant wallet balance decreased
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import structlog

from app.core.redis import get_redis

log = structlog.get_logger(__name__)

STREAM_PAYMENTS = "crib:events:payments"
STREAM_MAXLEN = 50_000


async def publish_event(
    stream: str,
    event_type: str,
    data: dict[str, Any],
    *,
    organisation_id: str | None = None,
) -> str | None:
    """
    Publish a domain event to a Redis Stream.

    Returns the stream entry ID on success, None if Redis is unavailable
    (publish failures are non-fatal — logged as warnings, never raised).

    Args:
        stream:          Redis stream key (use constants above)
        event_type:      Dot-notated event name, e.g. "payment.confirmed"
        data:            Event payload (will be JSON-serialised)
        organisation_id: Optional org scoping for consumer filtering
    """
    try:
        redis = get_redis()
        entry = {
            "event_type": event_type,
            "published_at": datetime.now(timezone.utc).isoformat(),
            "data": json.dumps(data),
        }
        if organisation_id:
            entry["organisation_id"] = organisation_id

        entry_id = await redis.xadd(
            stream,
            entry,
            maxlen=STREAM_MAXLEN,
            approximate=True,
        )
        log.debug("event.published", stream=stream, event_type=event_type, id=entry_id)
        return entry_id
    except Exception as exc:
        # Event publishing must never break the caller's transaction.
        log.warning("event.publish_failed", stream=stream, event_type=event_type, error=str(exc))
        return None


# ── Convenience wrappers for the payments domain ──────────────────────────────

async def emit_payment_confirmed(
    *,
    payment_id: str,
    lease_id: str,
    organisation_id: str,
    amount: float,
    currency: str,
    category: str,
    method: str,
) -> None:
    await publish_event(
        STREAM_PAYMENTS,
        "payment.confirmed",
        {
            "payment_id": payment_id,
            "lease_id": lease_id,
            "amount": amount,
            "currency": currency,
            "category": category,
            "method": method,
        },
        organisation_id=organisation_id,
    )


async def emit_payment_refunded(
    *,
    payment_id: str,
    lease_id: str,
    organisation_id: str,
    amount: float,
) -> None:
    await publish_event(
        STREAM_PAYMENTS,
        "payment.refunded",
        {
            "payment_id": payment_id,
            "lease_id": lease_id,
            "amount": amount,
        },
        organisation_id=organisation_id,
    )


async def emit_mobile_money_received(
    *,
    transaction_id: str,
    provider: str,
    phone_number: str,
    amount: float,
    currency: str,
    organisation_id: str | None = None,
) -> None:
    await publish_event(
        STREAM_PAYMENTS,
        "mobile_money.received",
        {
            "transaction_id": transaction_id,
            "provider": provider,
            "phone_number": phone_number,
            "amount": amount,
            "currency": currency,
        },
        organisation_id=organisation_id,
    )


async def emit_mobile_money_matched(
    *,
    transaction_id: str,
    payment_id: str,
    organisation_id: str,
) -> None:
    await publish_event(
        STREAM_PAYMENTS,
        "mobile_money.matched",
        {
            "transaction_id": transaction_id,
            "payment_id": payment_id,
        },
        organisation_id=organisation_id,
    )


async def emit_mobile_money_unmatched(
    *,
    transaction_id: str,
    phone_number: str,
    amount: float,
) -> None:
    await publish_event(
        STREAM_PAYMENTS,
        "mobile_money.unmatched",
        {
            "transaction_id": transaction_id,
            "phone_number": phone_number,
            "amount": amount,
        },
    )


async def emit_wallet_credited(
    *,
    tenant_id: str,
    organisation_id: str,
    amount: float,
    new_balance: float,
    reference_type: str,
) -> None:
    await publish_event(
        STREAM_PAYMENTS,
        "wallet.credited",
        {
            "tenant_id": tenant_id,
            "amount": amount,
            "new_balance": new_balance,
            "reference_type": reference_type,
        },
        organisation_id=organisation_id,
    )
