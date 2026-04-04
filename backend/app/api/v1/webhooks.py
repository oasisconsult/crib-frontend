"""
Inbound webhook handlers for mobile money providers.

Endpoints:
  POST /webhooks/mtn     — MTN MoMo callback
  POST /webhooks/airtel  — Airtel Money callback

Security:
  These endpoints are called by external providers, not by our frontend.
  MTN and Airtel do not sign webhooks with an HMAC secret (unlike Stripe).
  Instead we:
    1. Accept only HTTPS in production (enforced at the reverse-proxy level)
    2. Validate that the external_id exists in our MobileMoneyTransaction table
    3. Never return internal error details in the response body

After updating the MobileMoneyTransaction row, we call the matching engine
synchronously for fast happy-path matching. Slow/complex matching can be
offloaded to Celery in a future iteration.
"""

from __future__ import annotations

from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.integrations.payments.factory import get_provider
from app.integrations.payments.service import handle_webhook_event
from app.services.matching_service import match_transaction

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


async def _process(
    raw_payload: dict[str, Any],
    method: str,
    db: AsyncSession,
) -> dict:
    """Shared logic: parse → update transaction → match."""
    try:
        provider = get_provider(method)
        event = provider.process_webhook(raw_payload)
    except (ValueError, KeyError) as exc:
        log.warning("webhook.parse_error", method=method, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid webhook payload",
        ) from exc

    txn = await handle_webhook_event(db, event)
    if txn is None:
        return {"status": "ignored"}

    # Attempt matching for received transactions
    if txn.status == "received":
        await match_transaction(db, txn)

    return {"status": "ok"}


@router.post("/mtn", status_code=status.HTTP_200_OK)
async def mtn_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    MTN MoMo payment notification callback.
    MTN expects a 200 OK response; any non-2xx triggers a retry.
    """
    try:
        payload: dict[str, Any] = await request.json()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON",
        )

    log.info("webhook.mtn.received", payload_keys=list(payload.keys()))
    return await _process(payload, "mobile_money_mtn", db)


@router.post("/airtel", status_code=status.HTTP_200_OK)
async def airtel_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Airtel Money payment notification callback.
    Airtel expects a 200 OK response.
    """
    try:
        payload: dict[str, Any] = await request.json()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON",
        )

    log.info("webhook.airtel.received", payload_keys=list(payload.keys()))
    return await _process(payload, "mobile_money_airtel", db)
