"""
Public contact-info endpoint.

GET /public/contact-info — support email/phone/WhatsApp shown on the
                           marketing site footer. No auth required.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.contact_info import ContactInfoOut
from app.services import settings_service

public_router = APIRouter(prefix="/public", tags=["contact-info"])

_EMAIL_KEY = "platform.support_email"
_PHONE_KEY = "platform.support_phone"
_WHATSAPP_KEY = "platform.support_whatsapp"


@public_router.get("/contact-info", response_model=ContactInfoOut)
async def get_contact_info(db: AsyncSession = Depends(get_db)):
    """
    Support email/phone/WhatsApp number shown on the public marketing site.

    Superadmin-configurable via the admin platform-settings panel
    (platform.support_email / platform.support_phone / platform.support_whatsapp)
    so the platform team can change them without a code change or deploy.
    Empty values mean "not configured" — the frontend hides that contact method.
    """
    return ContactInfoOut(
        support_email=await settings_service.get(_EMAIL_KEY, db, default=""),
        support_phone=await settings_service.get(_PHONE_KEY, db, default=""),
        support_whatsapp=await settings_service.get(_WHATSAPP_KEY, db, default=""),
    )
