"""Pydantic schema for the public contact-info endpoint."""

from __future__ import annotations

from app.schemas.common import CamelModel


class ContactInfoOut(CamelModel):
    """Public contact details shown on the marketing site (e.g. footer).

    Superadmin-configurable via the platform settings panel
    (platform.support_email / platform.support_phone / platform.support_whatsapp)
    so the platform team can change them without a code change or deploy.
    Empty strings mean "not configured" — the frontend hides that contact method.
    """

    support_email: str
    support_phone: str
    support_whatsapp: str
