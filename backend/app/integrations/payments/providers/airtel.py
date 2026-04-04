"""
Airtel Money provider — Collections API.

Authentication:
  Airtel uses OAuth2 client_credentials (grant_type=client_credentials).
  Token endpoint: POST /auth/oauth2/token
  Token cached in Redis (key: airtel:access_token).

Flow:
  1. POST /auth/oauth2/token → Bearer token
  2. POST /merchant/v2/payments/ → payment request
     Response includes transaction.id (our external_id)
  3. Airtel sends a PIN prompt to the customer's phone.
  4. Customer enters PIN → Airtel POSTs to our callback URL.
  5. Polling fallback: GET /standard/v1/payments/{id}

References:
  https://developers.airtel.africa/documentation
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
    "TS": ProviderStatus.received,    # Transaction Successful
    "TF": ProviderStatus.failed,      # Transaction Failed
    "TP": ProviderStatus.pending,     # Transaction Pending
    "TIP": ProviderStatus.pending,    # Transaction In Progress
    "TE": ProviderStatus.expired,     # Transaction Expired
}


class AirtelMoneyProvider(PaymentProvider):
    name = ProviderName.AIRTEL

    def __init__(self) -> None:
        self._settings = get_settings()
        self._token: str | None = None
        self._token_expires_at: float = 0.0

    # ── Internal helpers ──────────────────────────────────────────────────────

    async def _get_token(self) -> str:
        import time

        if self._token and time.monotonic() < self._token_expires_at:
            return self._token

        from app.core.redis import get_redis
        redis = get_redis()
        cached = await redis.get("airtel:access_token")
        if cached:
            self._token = cached.decode() if isinstance(cached, bytes) else cached
            self._token_expires_at = time.monotonic() + 300
            return self._token

        return await self._refresh_token()

    async def _refresh_token(self) -> str:
        import time

        s = self._settings
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{s.airtel_base_url}/auth/oauth2/token",
                json={
                    "client_id": s.airtel_client_id,
                    "client_secret": s.airtel_client_secret,
                    "grant_type": "client_credentials",
                },
                headers={"Content-Type": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()

        token = data["access_token"]
        expires_in = int(data.get("expires_in", 3600))
        ttl = max(expires_in - 100, 60)

        from app.core.redis import get_redis
        redis = get_redis()
        await redis.setex("airtel:access_token", ttl, token)

        self._token = token
        self._token_expires_at = time.monotonic() + ttl
        log.info("airtel.token.refreshed", expires_in=expires_in)
        return token

    def _headers(self, token: str) -> dict[str, str]:
        s = self._settings
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "*/*",
            "X-Country": s.airtel_country,
            "X-Currency": s.airtel_currency,
        }

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
        if not s.airtel_client_id:
            raise RuntimeError("Airtel Money is not configured (missing client_id)")

        # Use a short deterministic ID (Airtel requires ≤ 36 chars)
        ref_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"airtel:{external_reference}"))
        token = await self._get_token()

        # Airtel expects phone without leading +
        msisdn = phone.lstrip("+")

        body: dict[str, Any] = {
            "reference": description or "Crib rent payment",
            "subscriber": {
                "country": s.airtel_country,
                "currency": currency,
                "msisdn": msisdn,
            },
            "transaction": {
                "amount": int(amount),
                "country": s.airtel_country,
                "currency": currency,
                "id": ref_id,
            },
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{s.airtel_base_url}/merchant/v2/payments/",
                headers=self._headers(token),
                json=body,
            )

        log.info(
            "airtel.payment.sent",
            ref_id=ref_id,
            phone=phone,
            amount=amount,
            status_code=resp.status_code,
        )

        data = resp.json()
        if resp.status_code == 200 and data.get("status", {}).get("success"):
            txn_id = data.get("data", {}).get("transaction", {}).get("id", ref_id)
            return ProviderResponse(
                external_id=txn_id,
                status=ProviderStatus.pending,
                raw=data,
            )

        log.error("airtel.payment.error", status=resp.status_code, body=resp.text)
        raise httpx.HTTPStatusError(
            f"Airtel Money initiation failed: {resp.status_code}",
            request=resp.request,
            response=resp,
        )

    async def check_status(self, external_id: str) -> ProviderStatus:
        s = self._settings
        token = await self._get_token()

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{s.airtel_base_url}/standard/v1/payments/{external_id}",
                headers=self._headers(token),
            )

        if resp.status_code == 404:
            return ProviderStatus.failed

        resp.raise_for_status()
        data = resp.json()
        status_code = (
            data.get("data", {}).get("transaction", {}).get("status", "TP").upper()
        )
        return _STATUS_MAP.get(status_code, ProviderStatus.pending)

    def process_webhook(self, raw_payload: dict[str, Any]) -> WebhookEvent:
        """
        Normalise Airtel Money callback payload.

        Airtel sends (abridged):
        {
          "transaction": {
            "id": "...",
            "message": "...",
            "status_code": "TS",
            "airtel_money_id": "...",
            "msisdn": "256700000000",
            "amount": 50000,
            "currency": "UGX"
          }
        }
        """
        txn = raw_payload.get("transaction", raw_payload)
        status_code = txn.get("status_code", "TP").upper()
        provider_status = _STATUS_MAP.get(status_code, ProviderStatus.pending)

        phone = str(txn.get("msisdn", ""))
        if phone and not phone.startswith("+"):
            phone = f"+{phone}"

        return WebhookEvent(
            provider=ProviderName.AIRTEL,
            external_id=txn.get("id", ""),
            status=provider_status,
            amount=float(txn.get("amount", 0)),
            currency=txn.get("currency", "UGX"),
            phone_number=phone,
            raw=raw_payload,
        )
