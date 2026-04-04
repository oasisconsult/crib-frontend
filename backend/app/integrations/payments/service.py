"""
Gateway service — orchestrates provider calls and MobileMoneyTransaction rows.

This is the single entry point for initiating and handling mobile money payments.
All other code (routes, Celery tasks) should call this service, never the
provider classes directly.

Functions:
  initiate_mobile_payment    — called when a mobile money payment is created
  handle_webhook_event       — called by webhook route handler after parsing
  sync_pending_transactions  — called by Celery beat task to poll for missed webhooks
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.payments.base import ProviderName, ProviderStatus, WebhookEvent
from app.integrations.payments.factory import get_provider
from app.models.mobile_money import MobileMoneyTransaction

if TYPE_CHECKING:
    pass

log = structlog.get_logger(__name__)


async def initiate_mobile_payment(
    db: AsyncSession,
    *,
    organisation_id: uuid.UUID,
    phone: str,
    amount: float,
    currency: str,
    method: str,                    # "mobile_money_mtn" | "mobile_money_airtel"
    external_reference: str,        # payment.id as string
    description: str = "",
) -> MobileMoneyTransaction:
    """
    Send a payment request to the mobile money provider and persist the
    MobileMoneyTransaction row.

    Returns the new MobileMoneyTransaction row (status=pending).
    Caller must commit the session.
    """
    provider = get_provider(method)
    response = await provider.initiate_payment(
        phone=phone,
        amount=amount,
        currency=currency,
        external_reference=external_reference,
        description=description,
    )

    txn = MobileMoneyTransaction(
        organisation_id=organisation_id,
        provider=provider.name,
        external_id=response.external_id,
        phone_number=phone,
        amount=amount,
        currency=currency,
        status=response.status,
        received_at=(
            datetime.now(timezone.utc)
            if response.status == ProviderStatus.received
            else None
        ),
        raw_payload=response.raw,
        reference_id=external_reference,
    )
    db.add(txn)
    await db.flush()

    log.info(
        "gateway.initiated",
        provider=provider.name,
        external_id=response.external_id,
        status=response.status,
    )
    return txn


async def handle_webhook_event(
    db: AsyncSession,
    event: WebhookEvent,
) -> MobileMoneyTransaction | None:
    """
    Process a normalised WebhookEvent from any provider.

    Updates the MobileMoneyTransaction row.
    Returns the updated row, or None if not found (idempotent — logs a warning).
    The matching engine is NOT called here; it runs as a follow-up step.
    """
    result = await db.execute(
        select(MobileMoneyTransaction).where(
            MobileMoneyTransaction.external_id == event.external_id
        )
    )
    txn = result.scalar_one_or_none()

    if not txn:
        # Could be a late webhook for an already-deleted record, or a test event.
        log.warning(
            "gateway.webhook.unmatched_transaction",
            external_id=event.external_id,
            provider=event.provider,
        )
        # Still persist it so the admin can reconcile manually.
        txn = MobileMoneyTransaction(
            organisation_id=uuid.UUID(int=0),  # unknown — will be updated by matching
            provider=event.provider,
            external_id=event.external_id,
            phone_number=event.phone_number,
            amount=event.amount,
            currency=event.currency,
            status="unmatched",
            received_at=datetime.now(timezone.utc),
            raw_payload=event.raw,
        )
        db.add(txn)
        await db.flush()
        return txn

    # Update status
    if event.status == ProviderStatus.received:
        txn.status = "received"
        txn.received_at = datetime.now(timezone.utc)
    elif event.status == ProviderStatus.failed:
        txn.status = "failed"
    elif event.status == ProviderStatus.expired:
        txn.status = "expired"

    # Update phone number in case it was missing when request was sent
    if event.phone_number and not txn.phone_number:
        txn.phone_number = event.phone_number

    await db.flush()
    log.info(
        "gateway.webhook.processed",
        external_id=event.external_id,
        status=txn.status,
    )
    return txn


async def sync_pending_transactions(
    db: AsyncSession,
    *,
    provider_name: ProviderName,
    limit: int = 50,
) -> int:
    """
    Poll the provider for all pending MobileMoneyTransaction rows.
    Returns the count of transactions whose status was updated.

    Called by the Celery beat task as a fallback for missed webhooks.
    """
    result = await db.execute(
        select(MobileMoneyTransaction)
        .where(
            MobileMoneyTransaction.provider == provider_name,
            MobileMoneyTransaction.status == "pending",
        )
        .order_by(MobileMoneyTransaction.created_at.asc())
        .limit(limit)
    )
    pending = list(result.scalars().all())

    if not pending:
        return 0

    # Determine method string from provider name
    method_map = {
        ProviderName.MTN: "mobile_money_mtn",
        ProviderName.AIRTEL: "mobile_money_airtel",
    }
    method = method_map.get(provider_name)
    if not method:
        return 0

    provider = get_provider(method)
    updated = 0

    for txn in pending:
        try:
            status = await provider.check_status(txn.external_id)
        except Exception as exc:
            log.warning(
                "gateway.poll.check_status_error",
                external_id=txn.external_id,
                error=str(exc),
            )
            continue

        if status == ProviderStatus.received and txn.status != "received":
            txn.status = "received"
            txn.received_at = datetime.now(timezone.utc)
            updated += 1
        elif status in (ProviderStatus.failed, ProviderStatus.expired):
            txn.status = status.value
            updated += 1

    if updated:
        await db.flush()

    log.info(
        "gateway.poll.complete",
        provider=provider_name,
        checked=len(pending),
        updated=updated,
    )
    return updated
