"""
'Book a Demo' endpoints.

POST /public/demo-bookings         — public, no auth (marketing site widget)
GET  /public/demo-bookings/contact — public, no auth (contact email for the widget)
GET  /demo-bookings                — superadmin: list bookings
PATCH /demo-bookings/{id}/status   — superadmin: change booking status
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_superadmin
from app.core.database import get_db
from app.schemas.common import MessageResponse
from app.schemas.demo_booking import (
    DemoBookingCreate,
    DemoBookingOut,
    DemoBookingPageOut,
    DemoBookingStatusUpdate,
    DemoContactOut,
)
from app.services import demo_booking_service, settings_service
from app.services.demo_booking_service import _CONTACT_EMAIL_DEFAULT, _CONTACT_EMAIL_KEY

public_router = APIRouter(prefix="/public", tags=["demo-bookings"])
router = APIRouter(prefix="/demo-bookings", tags=["demo-bookings"])


@public_router.get("/demo-bookings/contact", response_model=DemoContactOut)
async def get_demo_contact_email(db: AsyncSession = Depends(get_db)):
    """
    Contact email shown on the 'Book a Demo' widget.

    Superadmin-configurable via the admin settings panel
    (notifications.demo_contact_email) so the platform team can change it
    without a code change or deploy.
    """
    email = await settings_service.get(_CONTACT_EMAIL_KEY, db, default=_CONTACT_EMAIL_DEFAULT)
    return DemoContactOut(email=email or _CONTACT_EMAIL_DEFAULT)


@public_router.post(
    "/demo-bookings",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_demo_booking(
    body: DemoBookingCreate,
    db: AsyncSession = Depends(get_db),
):
    """Submit a demo booking from the public marketing site. No auth required."""
    await demo_booking_service.create_booking(body, db)
    # Return the same response whether or not the honeypot was triggered, so
    # bots can't distinguish a real submission from a silently-discarded one.
    return MessageResponse(message="Thanks! We've received your booking request.")


@router.get("", response_model=DemoBookingPageOut, dependencies=[Depends(require_superadmin())])
async def list_demo_bookings(
    status_filter: str | None = Query(None, alias="status"),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    db: AsyncSession = Depends(get_db),
):
    return await demo_booking_service.list_bookings(
        db, status_filter=status_filter, search=search, page=page, page_size=page_size
    )


@router.patch(
    "/{booking_id}/status",
    response_model=DemoBookingOut,
    dependencies=[Depends(require_superadmin())],
)
async def update_demo_booking_status(
    booking_id: uuid.UUID,
    body: DemoBookingStatusUpdate,
    db: AsyncSession = Depends(get_db),
):
    return await demo_booking_service.update_status(booking_id, body.status, db)
