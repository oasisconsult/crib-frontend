"""Abstract base for notification channel adapters."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class DeliveryResult:
    success: bool
    external_message_id: str | None = None
    failure_reason: str | None = None


@dataclass
class EmailAttachment:
    """A file to attach to an outgoing email (e.g. a calendar .ics invite)."""

    filename: str
    content: bytes
    mime_type: str = "application/octet-stream"


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
        html_body: str | None = None,
        attachments: list[EmailAttachment] | None = None,
    ) -> DeliveryResult:
        ...
