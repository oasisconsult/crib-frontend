"""Abstract base for notification channel adapters."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class DeliveryResult:
    success: bool
    external_message_id: str | None = None
    failure_reason: str | None = None


class NotificationProvider(ABC):
    """Each channel adapter must implement send()."""

    @abstractmethod
    async def send(
        self,
        *,
        recipient_name: str,
        recipient_email: str | None,
        recipient_phone: str | None,
        subject: str | None,
        body: str,
    ) -> DeliveryResult:
        ...
