"""
WhatsApp adapter — Meta Cloud API (Graph API v18+).

Sends text messages via the WhatsApp Business Platform.
Requires:
  settings.whatsapp_api_key   — permanent access token
  settings.whatsapp_phone_id  — WhatsApp Business phone number ID
"""

from __future__ import annotations

import logging

import httpx

from app.integrations.notifications.base import DeliveryResult, NotificationProvider

log = logging.getLogger(__name__)

_GRAPH_URL = "https://graph.facebook.com/v18.0"


class WhatsAppProvider(NotificationProvider):
    def __init__(self, api_key: str, phone_id: str) -> None:
        self._api_key = api_key
        self._phone_id = phone_id

    async def send(
        self,
        *,
        recipient_name: str,
        recipient_email: str | None,
        recipient_phone: str | None,
        subject: str | None,
        body: str,
    ) -> DeliveryResult:
        if not recipient_phone:
            return DeliveryResult(success=False, failure_reason="No phone number")

        # Strip + prefix — Meta expects E.164 without leading +
        to = recipient_phone.lstrip("+")

        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "text",
            "text": {"body": body},
        }

        async with httpx.AsyncClient(timeout=15) as client:
            try:
                resp = await client.post(
                    f"{_GRAPH_URL}/{self._phone_id}/messages",
                    json=payload,
                    headers={"Authorization": f"Bearer {self._api_key}"},
                )
                data = resp.json()
                if resp.status_code == 200:
                    msg_ids = data.get("messages", [])
                    ext_id = msg_ids[0].get("id") if msg_ids else None
                    return DeliveryResult(success=True, external_message_id=ext_id)
                return DeliveryResult(
                    success=False,
                    failure_reason=f"Meta {resp.status_code}: {data.get('error', {}).get('message', '')}",
                )
            except httpx.HTTPError as exc:
                return DeliveryResult(success=False, failure_reason=str(exc))


class _NotConfiguredProvider(NotificationProvider):
    """Returned when WhatsApp credentials are not set in system settings."""

    async def send(self, **_kwargs) -> DeliveryResult:
        return DeliveryResult(
            success=False,
            failure_reason="WhatsApp not configured — set whatsapp.meta.api_key and whatsapp.meta.phone_id in platform settings",
        )


def get_whatsapp_provider() -> NotificationProvider:
    """Returns a provider backed by env-var settings (legacy / test use only)."""
    from app.core.config import get_settings
    s = get_settings()
    api_key = getattr(s, "whatsapp_api_key", None)
    phone_id = getattr(s, "whatsapp_phone_id", None)
    if not api_key or not phone_id:
        return _NotConfiguredProvider()
    return WhatsAppProvider(api_key=api_key, phone_id=phone_id)
