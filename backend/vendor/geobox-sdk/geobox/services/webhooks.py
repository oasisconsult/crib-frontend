"""
GeoBox SDK — Webhook signature validation and payload parsing.

Usage in a FastAPI endpoint::

    from fastapi import Request
    from geobox.services.webhooks import WebhookHandler

    handler = WebhookHandler(secret="whsec_...")

    @app.post("/webhooks/geobox")
    async def handle_webhook(request: Request):
        payload = await request.body()
        signature = request.headers.get("X-GeoBox-Signature", "")
        event = handler.verify_and_parse(payload, signature)
        if event.event_type == "address.created":
            ...
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any

from ..exceptions import GeoBoxError
from ..models import WebhookEvent


class WebhookHandler:
    """
    Validate and parse inbound GeoBox webhook events.

    Args:
        secret:            Webhook signing secret from your GeoBox dashboard.
        tolerance_seconds: Maximum age (in seconds) of a valid webhook payload.
                           Protects against replay attacks. Default 300 (5 min).
    """

    SIGNATURE_HEADER = "X-GeoBox-Signature"
    TIMESTAMP_HEADER = "X-GeoBox-Timestamp"

    def __init__(self, secret: str, tolerance_seconds: int = 300) -> None:
        if not secret:
            raise ValueError("webhook secret must not be empty")
        self._secret    = secret.encode()
        self._tolerance = tolerance_seconds

    # ------------------------------------------------------------------
    # Signature validation
    # ------------------------------------------------------------------

    def _compute_signature(self, timestamp: str, body: bytes) -> str:
        message = f"{timestamp}.".encode() + body
        return hmac.new(self._secret, message, hashlib.sha256).hexdigest()

    def verify_signature(self, body: bytes, signature: str, timestamp: str) -> bool:
        """
        Return True if *signature* is valid for *body* at *timestamp*.

        Does NOT raise — callers should call ``verify_and_parse`` instead which
        raises ``GeoBoxError`` on failure.
        """
        expected = self._compute_signature(timestamp, body)
        return hmac.compare_digest(expected, signature)

    # ------------------------------------------------------------------
    # Replay protection
    # ------------------------------------------------------------------

    def _check_timestamp(self, timestamp: str) -> None:
        try:
            ts = int(timestamp)
        except (ValueError, TypeError):
            raise GeoBoxError("Invalid webhook timestamp")
        age = abs(time.time() - ts)
        if age > self._tolerance:
            raise GeoBoxError(
                f"Webhook timestamp is {age:.0f}s old (tolerance: {self._tolerance}s) — "
                "possible replay attack"
            )

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def verify_and_parse(
        self,
        body: bytes,
        signature: str,
        timestamp: str | None = None,
    ) -> WebhookEvent:
        """
        Validate the webhook signature and return a parsed WebhookEvent.

        Raises:
            GeoBoxError: If the signature is invalid or the payload is too old.

        Args:
            body:      Raw request body bytes.
            signature: Value of the ``X-GeoBox-Signature`` header.
            timestamp: Value of the ``X-GeoBox-Timestamp`` header (used for replay
                       protection). If None the current time is used (less secure).
        """
        if timestamp:
            self._check_timestamp(timestamp)
            if not self.verify_signature(body, signature, timestamp):
                raise GeoBoxError("Webhook signature verification failed")
        else:
            # Fallback: validate without timestamp (replay protection disabled)
            ts = str(int(time.time()))
            if not self.verify_signature(body, signature, ts):
                raise GeoBoxError("Webhook signature verification failed")

        try:
            payload: dict[str, Any] = json.loads(body)
        except json.JSONDecodeError as exc:
            raise GeoBoxError(f"Webhook body is not valid JSON: {exc}") from exc

        return WebhookEvent(
            event_type=payload.get("event_type", "unknown"),
            event_id=payload.get("event_id", ""),
            timestamp=payload.get("timestamp") or time.time(),
            payload=payload.get("data", payload),
            signature=signature,
        )
