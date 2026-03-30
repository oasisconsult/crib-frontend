"""
Notification provider factory.

Usage:
    from app.integrations.notifications import get_provider
    provider = get_provider("sms")
    result = await provider.send(...)
"""

from __future__ import annotations

from app.integrations.notifications.base import NotificationProvider


def get_provider(channel: str) -> NotificationProvider:
    """Return the configured provider for the given channel."""
    if channel == "email":
        from app.integrations.notifications.email import get_email_provider
        return get_email_provider()
    if channel == "sms":
        from app.integrations.notifications.sms import get_sms_provider
        return get_sms_provider()
    if channel == "whatsapp":
        from app.integrations.notifications.whatsapp import get_whatsapp_provider
        return get_whatsapp_provider()
    if channel == "in_app":
        from app.integrations.notifications.inapp import InAppProvider
        return InAppProvider()
    raise ValueError(f"Unknown notification channel: {channel!r}")
