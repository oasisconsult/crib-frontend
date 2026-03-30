"""
In-app notification adapter.

In-app notifications are stored in the DB and marked delivered immediately —
no external API call. Future versions can push via WebSockets.
"""

from __future__ import annotations

from app.integrations.notifications.base import DeliveryResult, NotificationProvider


class InAppProvider(NotificationProvider):
    async def send(
        self,
        *,
        recipient_name: str,
        recipient_email: str | None,
        recipient_phone: str | None,
        subject: str | None,
        body: str,
    ) -> DeliveryResult:
        # In-app: no external call; mark as delivered immediately
        return DeliveryResult(success=True, external_message_id=None)
