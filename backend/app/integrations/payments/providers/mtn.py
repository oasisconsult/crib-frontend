"""
MTN Mobile Money (MoMo) provider — Collections API v1.

Authentication:
  MTN uses OAuth2 client_credentials.  Each call needs a Bearer token.
  We cache the token in Redis (key: mtn:access_token) and refresh 100 s
  before expiry to avoid mid-request failures.

Flow:
  1. POST /collection/token/ → Bearer token
  2. POST /collection/v1_0/requesttopay → 202 Accepted, X-Reference-Id in response
     (this is the external_id we store as MobileMoneyTransaction.external_id)
  3. Provider sends a PIN prompt to the customer's phone.
  4. Customer enters PIN → provider POSTs to our callback URL.
  5. If callback is missed: GET /collection/v1_0/requesttopay/{external_id}
     returns current status (polling fallback).

References:
  https://momodeveloper.mtn.com/docs/services/collection/
"""

from __future__ import annotations

import uuid
from typing import Any

import httpx
import structlog

from app.core.config import get_settings
from app.integrations.payments.base import (
    PaymentProvider,
    ProviderName,
    ProviderResponse,
    ProviderStatus,
    WebhookEvent,
)

log = structlog.get_logger(__name__)

_STATUS_MAP: dict[str, ProviderStatus] = {
    "SUCCESSFUL": ProviderStatus.received,
    "FAILED": ProviderStatus.failed,
    "PENDING": ProviderStatus.pending,
    "TIMEOUT": ProviderStatus.expired,
}


class MTNMoMoProvider(PaymentProvider):
    name = ProviderName.MTN

    def __init__(self) -> None:
        self._settings = get_settings()
        self._token: str | None = None
        self._token_expires_at: float = 0.0

    # ── Internal helpers ──────────────────────────────────────────────────────

    async def _get_token(self) -> str:
        """Return a valid Bearer token, refreshing from Redis cache or MTN if expired."""
        import time

        # Fast path: in-process cache still valid
        if self._token and time.monotonic() < self._token_expires_at:
            return self._token

        # Try Redis cache first
        from app.core.redis import get_redis
        redis = get_redis()
        cached = await redis.get("mtn:access_token")
        if cached:
            self._token = cached.decode() if isinstance(cached, bytes) else cached
            # We don't know exact expiry from Redis; re-use until next fetch needed
            self._token_expires_at = time.monotonic() + 300
            return self._token

        return await self._refresh_token()

    async def _refresh_token(self) -> str:
        import base64
        import time

        s = self._settings
        credentials = base64.b64encode(
            f"{s.mtn_api_user_id}:{s.mtn_api_key}".encode()
        ).decode()

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{s.mtn_base_url}/collection/token/",
                headers={
                    "Authorization": f"Basic {credentials}",
                    "Ocp-Apim-Subscription-Key": s.mtn_subscription_key,
                },
            )
            resp.raise_for_status()
            data = resp.json()

        token = data["access_token"]
        expires_in = int(data.get("expires_in", 3600))
        ttl = max(expires_in - 100, 60)  # refresh 100 s early

        from app.core.redis import get_redis
        redis = get_redis()
        await redis.setex("mtn:access_token", ttl, token)

        self._token = token
        self._token_expires_at = time.monotonic() + ttl
        log.info("mtn.token.refreshed", expires_in=expires_in)
        return token

    def _headers(self, token: str, reference_id: str | None = None) -> dict[str, str]:
        s = self._settings
        h = {
            "Authorization": f"Bearer {token}",
            "Ocp-Apim-Subscription-Key": s.mtn_subscription_key,
            "X-Target-Environment": s.mtn_environment,
            "Content-Type": "application/json",
        }
        if reference_id:
            h["X-Reference-Id"] = reference_id
        return h

    # ── PaymentProvider interface ─────────────────────────────────────────────

    async def initiate_payment(
        self,
        *,
        phone: str,
        amount: float,
        currency: str,
        external_reference: str,
        description: str = "",
    ) -> ProviderResponse:
        s = self._settings
        if not s.mtn_subscription_key:
            raise RuntimeError("MTN MoMo is not configured (missing subscription key)")

        # Use a deterministic UUID so duplicate retries are idempotent
        ref_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"mtn:{external_reference}"))
        token = await self._get_token()

        callback_url = (
            f"{s.mtn_callback_host}/api/v1/webhooks/mtn"
            if s.mtn_callback_host
            else None
        )
        body: dict[str, Any] = {
            "amount": str(int(amount)),
            "currency": currency,
            "externalId": external_reference,
            "payer": {
                "partyIdType": "MSISDN",
                "partyId": phone.lstrip("+"),
            },
            "payerMessage": description or "Crib rent payment",
            "payeeNote": description or "Crib rent payment",
        }
        if callback_url:
            body["callbackUrl"] = callback_url

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{s.mtn_base_url}/collection/v1_0/requesttopay",
                headers=self._headers(token, reference_id=ref_id),
                json=body,
            )

        log.info(
            "mtn.requesttopay.sent",
            ref_id=ref_id,
            phone=phone,
            amount=amount,
            status_code=resp.status_code,
        )

        if resp.status_code == 202:
            return ProviderResponse(
                external_id=ref_id,
                status=ProviderStatus.pending,
                raw={"reference_id": ref_id},
            )

        # Non-202 is an error
        log.error("mtn.requesttopay.error", status=resp.status_code, body=resp.text)
        raise httpx.HTTPStatusError(
            f"MTN MoMo initiation failed: {resp.status_code}",
            request=resp.request,
            response=resp,
        )

    async def check_status(self, external_id: str) -> ProviderStatus:
        s = self._settings
        token = await self._get_token()

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{s.mtn_base_url}/collection/v1_0/requesttopay/{external_id}",
                headers=self._headers(token),
            )

        if resp.status_code == 404:
            return ProviderStatus.failed

        resp.raise_for_status()
        data = resp.json()
        mtn_status = data.get("status", "PENDING").upper()
        return _STATUS_MAP.get(mtn_status, ProviderStatus.pending)

    def process_webhook(self, raw_payload: dict[str, Any]) -> WebhookEvent:
        """
        Normalise MTN MoMo callback payload.

        MTN sends (abridged):
        {
          "financialTransactionId": "...",
          "externalId": "...",          ← our X-Reference-Id
          "amount": "50000",
          "currency": "UGX",
          "payer": {"partyIdType": "MSISDN", "partyId": "256700000000"},
          "status": "SUCCESSFUL"
        }
        """
        status_str = raw_payload.get("status", "PENDING").upper()
        provider_status = _STATUS_MAP.get(status_str, ProviderStatus.pending)

        external_id = raw_payload.get("externalId") or raw_payload.get("referenceId", "")
        payer = raw_payload.get("payer", {})
        phone = payer.get("partyId", "")
        if phone and not phone.startswith("+"):
            phone = f"+{phone}"

        return WebhookEvent(
            provider=ProviderName.MTN,
            external_id=external_id,
            status=provider_status,
            amount=float(raw_payload.get("amount", 0)),
            currency=raw_payload.get("currency", "UGX"),
            phone_number=phone,
            raw=raw_payload,
        )
