"""
Manual payment provider — cash and bank transfer.

No external API call is made. The payment is immediately considered
received (the landlord/manager has physically confirmed it).

Used for:
  - method="cash"
  - method="bank_transfer"
  - method="other"
"""

from __future__ import annotations

import uuid
from typing import Any

from app.integrations.payments.base import (
    PaymentProvider,
    ProviderName,
    ProviderResponse,
    ProviderStatus,
    WebhookEvent,
)


class ManualProvider(PaymentProvider):
    name = ProviderName.CASH  # re-used for both cash and bank

    async def initiate_payment(
        self,
        *,
        phone: str,
        amount: float,
        currency: str,
        external_reference: str,
        description: str = "",
    ) -> ProviderResponse:
        """Manual payments are immediately received — no API call needed."""
        return ProviderResponse(
            external_id=f"manual:{external_reference}",
            status=ProviderStatus.received,
        )

    async def check_status(self, external_id: str) -> ProviderStatus:
        """Manual payments are always received once recorded."""
        return ProviderStatus.received

    def process_webhook(self, raw_payload: dict[str, Any]) -> WebhookEvent:
        raise NotImplementedError("Manual provider does not receive webhooks")
