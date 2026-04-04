"""
Unified Payments Gateway — abstract base.

All payment providers implement PaymentProvider.
The gateway service (service.py) is the only caller — no route handler
should import a provider class directly.

Payment flow (mobile money):
  1. initiate(phone, amount, ...) → ProviderResponse with external_id
     Creates a MobileMoneyTransaction row (status=pending).
  2. Provider sends a PIN prompt to the user's phone.
  3. User enters PIN → provider sends webhook or polling confirms receipt.
  4. check_status(external_id) → ProviderStatus
     Polling fallback for missed webhooks (Celery beat task).
  5. process_webhook(raw_payload) → WebhookEvent
     Webhook handler normalises provider-specific payload to WebhookEvent.
  6. Matching engine links WebhookEvent → tenant + Payment → allocate.

Cash / bank transfer:
  These are recorded manually (no API call needed). The provider returns
  a ProviderResponse with status=received immediately.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


class ProviderName(StrEnum):
    MTN = "MTN"
    AIRTEL = "AIRTEL"
    CASH = "CASH"
    BANK = "BANK"


class ProviderStatus(StrEnum):
    pending = "pending"       # awaiting PIN / processing
    received = "received"     # funds confirmed by provider
    failed = "failed"         # rejected by provider or timeout
    expired = "expired"       # user did not respond within TTL


@dataclass
class ProviderResponse:
    """Result of initiate_payment()."""
    external_id: str            # provider's unique transaction ID
    status: ProviderStatus
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class WebhookEvent:
    """Normalised representation of an inbound provider webhook."""
    provider: ProviderName
    external_id: str            # must match MobileMoneyTransaction.external_id
    status: ProviderStatus
    amount: float
    currency: str
    phone_number: str
    raw: dict[str, Any] = field(default_factory=dict)


class PaymentProvider(ABC):
    """Abstract base for all payment providers."""

    name: ProviderName  # override in each subclass

    @abstractmethod
    async def initiate_payment(
        self,
        *,
        phone: str,
        amount: float,
        currency: str,
        external_reference: str,   # our reference (payment.id or rent_schedule.id)
        description: str = "",
    ) -> ProviderResponse:
        """
        Request a payment from the customer.
        For mobile money: sends a PIN prompt to their phone.
        For cash/bank: returns received immediately (no API call).
        """

    @abstractmethod
    async def check_status(self, external_id: str) -> ProviderStatus:
        """
        Poll the provider for the current status of a transaction.
        Used by the Celery beat task to catch missed webhooks.
        """

    @abstractmethod
    def process_webhook(self, raw_payload: dict[str, Any]) -> WebhookEvent:
        """
        Parse and normalise a raw inbound webhook payload.
        Must be synchronous — called inside a FastAPI request handler.
        Raises ValueError if the payload is unrecognised / invalid.
        """
