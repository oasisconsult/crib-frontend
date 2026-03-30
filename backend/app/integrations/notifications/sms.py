"""
SMS adapter — supports Twilio and Africa's Talking.

Provider is selected via settings.sms_provider:
  "twilio"         — Twilio Messaging API
  "africastalking" — Africa's Talking SMS API (preferred for Uganda)
"""

from __future__ import annotations

import logging

import httpx

from app.integrations.notifications.base import DeliveryResult, NotificationProvider

log = logging.getLogger(__name__)


class TwilioProvider(NotificationProvider):
    def __init__(self, account_sid: str, auth_token: str, from_number: str) -> None:
        self._account_sid = account_sid
        self._auth_token = auth_token
        self._from_number = from_number

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

        url = f"https://api.twilio.com/2010-04-01/Accounts/{self._account_sid}/Messages.json"
        async with httpx.AsyncClient(timeout=15) as client:
            try:
                resp = await client.post(
                    url,
                    auth=(self._account_sid, self._auth_token),
                    data={"To": recipient_phone, "From": self._from_number, "Body": body},
                )
                data = resp.json()
                if resp.status_code == 201:
                    return DeliveryResult(success=True, external_message_id=data.get("sid"))
                return DeliveryResult(
                    success=False,
                    failure_reason=f"Twilio {resp.status_code}: {data.get('message', '')}",
                )
            except httpx.HTTPError as exc:
                return DeliveryResult(success=False, failure_reason=str(exc))


class AfricasTalkingProvider(NotificationProvider):
    def __init__(self, api_key: str, username: str, sender_id: str) -> None:
        self._api_key = api_key
        self._username = username
        self._sender_id = sender_id

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

        async with httpx.AsyncClient(timeout=15) as client:
            try:
                resp = await client.post(
                    "https://api.africastalking.com/version1/messaging",
                    headers={
                        "apiKey": self._api_key,
                        "Accept": "application/json",
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    data={
                        "username": self._username,
                        "to": recipient_phone,
                        "message": body,
                        **({"from": self._sender_id} if self._sender_id else {}),
                    },
                )
                data = resp.json()
                if resp.status_code == 201:
                    recipients = data.get("SMSMessageData", {}).get("Recipients", [])
                    if recipients and recipients[0].get("status") == "Success":
                        return DeliveryResult(
                            success=True,
                            external_message_id=recipients[0].get("messageId"),
                        )
                    reason = recipients[0].get("status", "Unknown") if recipients else "No recipients"
                    return DeliveryResult(success=False, failure_reason=reason)
                return DeliveryResult(
                    success=False,
                    failure_reason=f"AT {resp.status_code}: {resp.text[:200]}",
                )
            except httpx.HTTPError as exc:
                return DeliveryResult(success=False, failure_reason=str(exc))


def get_sms_provider() -> NotificationProvider:
    from app.core.config import get_settings
    s = get_settings()
    if s.sms_provider == "africastalking":
        return AfricasTalkingProvider(
            api_key=s.africastalking_api_key,
            username=s.africastalking_username,
            sender_id=s.africastalking_sender_id,
        )
    return TwilioProvider(
        account_sid=s.twilio_account_sid,
        auth_token=s.twilio_auth_token,
        from_number=s.twilio_from_number,
    )
