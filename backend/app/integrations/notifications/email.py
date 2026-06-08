"""
Email adapter — supports SendGrid and SMTP.

Provider is selected via settings.email_provider:
  "sendgrid"  — uses SendGrid Web API v3
  "smtp"      — uses aiosmtplib (async SMTP)
"""

from __future__ import annotations

import base64
import logging

import httpx

from app.integrations.notifications.base import DeliveryResult, EmailAttachment, NotificationProvider

log = logging.getLogger(__name__)


class SendGridProvider(NotificationProvider):
    def __init__(self, api_key: str, from_email: str) -> None:
        self._api_key = api_key
        self._from_email = from_email

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
        if not recipient_email:
            return DeliveryResult(success=False, failure_reason="No email address")

        content = [{"type": "text/plain", "value": body}]
        if html_body:
            content.append({"type": "text/html", "value": html_body})

        payload: dict = {
            "personalizations": [
                {"to": [{"email": recipient_email, "name": recipient_name}]}
            ],
            "from": {"email": self._from_email},
            "subject": subject or "(no subject)",
            "content": content,
        }
        if attachments:
            payload["attachments"] = [
                {
                    "content": base64.b64encode(a.content).decode("ascii"),
                    "filename": a.filename,
                    "type": a.mime_type,
                    "disposition": "attachment",
                }
                for a in attachments
            ]

        async with httpx.AsyncClient(timeout=15) as client:
            try:
                resp = await client.post(
                    "https://api.sendgrid.com/v3/mail/send",
                    json=payload,
                    headers={"Authorization": f"Bearer {self._api_key}"},
                )
                if resp.status_code in (200, 202):
                    msg_id = resp.headers.get("X-Message-Id")
                    return DeliveryResult(success=True, external_message_id=msg_id)
                return DeliveryResult(
                    success=False,
                    failure_reason=f"SendGrid {resp.status_code}: {resp.text[:200]}",
                )
            except httpx.HTTPError as exc:
                return DeliveryResult(success=False, failure_reason=str(exc))


class SmtpProvider(NotificationProvider):
    def __init__(
        self,
        host: str,
        port: int,
        username: str,
        password: str,
        from_email: str,
    ) -> None:
        self._host = host
        self._port = port
        self._username = username
        self._password = password
        self._from_email = from_email

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
        if not recipient_email:
            return DeliveryResult(success=False, failure_reason="No email address")

        try:
            import aiosmtplib
            from email.mime.application import MIMEApplication
            from email.mime.multipart import MIMEMultipart
            from email.mime.text import MIMEText

            if html_body or attachments:
                msg: MIMEMultipart | MIMEText = MIMEMultipart("mixed")
                alt = MIMEMultipart("alternative")
                alt.attach(MIMEText(body, "plain", "utf-8"))
                if html_body:
                    alt.attach(MIMEText(html_body, "html", "utf-8"))
                msg.attach(alt)
                for a in attachments or []:
                    part = MIMEApplication(a.content, _subtype=a.mime_type.split("/")[-1])
                    part.add_header("Content-Disposition", "attachment", filename=a.filename)
                    msg.attach(part)
            else:
                msg = MIMEText(body, "plain", "utf-8")

            msg["Subject"] = subject or "(no subject)"
            msg["From"] = self._from_email
            msg["To"] = f"{recipient_name} <{recipient_email}>"

            # Port 587 = STARTTLS (production relay).
            # All other ports (e.g. 1025 for MailHog) = plain SMTP, no TLS.
            use_tls = False
            start_tls = self._port == 587

            await aiosmtplib.send(
                msg,
                hostname=self._host,
                port=self._port,
                username=self._username or None,
                password=self._password or None,
                use_tls=use_tls,
                start_tls=start_tls,
            )
            return DeliveryResult(success=True)
        except Exception as exc:
            return DeliveryResult(success=False, failure_reason=str(exc))


def get_email_provider() -> NotificationProvider:
    from app.core.config import get_settings
    s = get_settings()
    if s.email_provider == "sendgrid":
        return SendGridProvider(api_key=s.sendgrid_api_key, from_email=s.email_from)
    return SmtpProvider(
        host=s.smtp_host,
        port=s.smtp_port,
        username=s.smtp_username,
        password=s.smtp_password,
        from_email=s.email_from,
    )
