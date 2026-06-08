"""
Business logic for the public 'Book a Demo' feature.

Flow:
  1. Visitor submits the booking form on the marketing site (no auth required).
  2. We persist the booking, guarding against double-booking via the
     uq_demo_bookings_slot unique constraint (slot_date, slot_time).
  3. We email the platform team (recipient configurable via the
     notifications.demo_booking_email system setting) and send the booker a
     confirmation email with a .ics calendar invite + "Add to Google Calendar" link.
  4. Superadmins manage bookings (list, change status) from the admin UI.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import structlog
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.demo_booking import DemoBooking, DemoBookingStatus
from app.schemas.common import PaginatedResponse
from app.schemas.demo_booking import DemoBookingCreate, DemoBookingOut, DemoBookingPageOut
from app.services import settings_service
from app.utils.calendar_invite import build_google_calendar_link, build_ics

log = structlog.get_logger(__name__)

_DEMO_DURATION = timedelta(minutes=30)
_VALID_STATUSES = {
    DemoBookingStatus.PENDING,
    DemoBookingStatus.CONFIRMED,
    DemoBookingStatus.CANCELLED,
    DemoBookingStatus.COMPLETED,
}
_SLOT_TAKEN_MESSAGE = "That time slot has just been booked. Please choose another."


def _out(b: DemoBooking) -> DemoBookingOut:
    return DemoBookingOut(
        id=b.id,
        first_name=b.first_name,
        last_name=b.last_name,
        email=b.email,
        phone=b.phone,
        company=b.company,
        portfolio_size=b.portfolio_size,
        message=b.message,
        marketing_consent=b.marketing_consent,
        consent_given_at=b.consent_given_at,
        slot_date=b.slot_date,
        slot_time=b.slot_time,
        timezone=b.timezone,
        status=b.status,
        created_at=b.created_at,
        updated_at=b.updated_at,
    )


def _slot_datetime(b: DemoBooking) -> datetime:
    try:
        tz = ZoneInfo(b.timezone)
    except Exception:
        tz = ZoneInfo("Africa/Kampala")
    return datetime.combine(b.slot_date, b.slot_time, tzinfo=tz)


async def create_booking(data: DemoBookingCreate, db: AsyncSession) -> DemoBookingOut | None:
    """Create a demo booking. Returns None for silently-accepted bot submissions."""
    if data.website:
        log.info("demo_booking.honeypot_triggered", email=data.email)
        return None

    try:
        tz = ZoneInfo(data.timezone)
    except Exception:
        raise HTTPException(status_code=422, detail="Unrecognised timezone")

    slot_dt = datetime.combine(data.slot_date, data.slot_time, tzinfo=tz)
    if slot_dt < datetime.now(tz):
        raise HTTPException(status_code=422, detail="That time slot is in the past. Please choose another.")

    existing = await db.scalar(
        select(DemoBooking).where(
            DemoBooking.slot_date == data.slot_date,
            DemoBooking.slot_time == data.slot_time,
            DemoBooking.status != DemoBookingStatus.CANCELLED,
        )
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_SLOT_TAKEN_MESSAGE)

    now = datetime.now(timezone.utc)
    booking = DemoBooking(
        first_name=data.first_name,
        last_name=data.last_name,
        email=data.email,
        phone=data.phone,
        company=data.company,
        portfolio_size=data.portfolio_size,
        message=data.message,
        marketing_consent=data.marketing_consent,
        consent_given_at=now if data.marketing_consent else None,
        slot_date=data.slot_date,
        slot_time=data.slot_time,
        timezone=data.timezone,
    )
    db.add(booking)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_SLOT_TAKEN_MESSAGE)
    await db.refresh(booking)

    log.info("demo_booking.created", booking_id=str(booking.id), email=booking.email)
    await _send_team_alert(booking, db)
    await _send_booker_confirmation(booking, db)

    return _out(booking)


async def list_bookings(
    db: AsyncSession,
    status_filter: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> DemoBookingPageOut:
    q = select(DemoBooking)
    if status_filter:
        q = q.where(DemoBooking.status == status_filter)
    if search:
        term = f"%{search}%"
        q = q.where(
            (DemoBooking.first_name.ilike(term))
            | (DemoBooking.last_name.ilike(term))
            | (DemoBooking.email.ilike(term))
            | (DemoBooking.company.ilike(term))
        )

    total = await db.scalar(select(func.count()).select_from(q.subquery())) or 0
    q = (
        q.order_by(DemoBooking.slot_date.desc(), DemoBooking.slot_time.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(q)).scalars().all()

    return PaginatedResponse[DemoBookingOut](
        data=[_out(b) for b in rows],
        total=total,
        page=page,
        page_size=page_size,
        has_next=(page * page_size) < total,
    )


async def _get_booking(booking_id: uuid.UUID, db: AsyncSession) -> DemoBooking:
    booking = await db.get(DemoBooking, booking_id)
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    return booking


async def update_status(booking_id: uuid.UUID, new_status: str, db: AsyncSession) -> DemoBookingOut:
    if new_status not in _VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status: {new_status!r}")

    booking = await _get_booking(booking_id, db)
    booking.status = new_status
    await db.commit()
    await db.refresh(booking)
    return _out(booking)


# ── Notifications ──────────────────────────────────────────────────────────────

async def _send_team_alert(booking: DemoBooking, db: AsyncSession) -> None:
    """Alert the platform team that a new demo has been booked."""
    from app.integrations.notifications.email import get_email_provider

    try:
        recipient = await settings_service.get(
            "notifications.demo_booking_email", db, default="hello@crib.ug"
        )
        if not recipient:
            return

        name = f"{booking.first_name} {booking.last_name}".strip()
        slot_dt = _slot_datetime(booking)
        when = slot_dt.strftime("%A, %d %B %Y at %H:%M (%Z)")

        details = [f"Name: {name}", f"Email: {booking.email}", f"Phone: {booking.phone}"]
        if booking.company:
            details.append(f"Company: {booking.company}")
        if booking.portfolio_size:
            details.append(f"Portfolio size: {booking.portfolio_size}")
        if booking.message:
            details.append(f"Message: {booking.message}")
        details.append(f"Marketing consent: {'yes' if booking.marketing_consent else 'no'}")

        subject = f"New demo booking — {name} ({when})"
        body = (
            "A new product demo has been booked via the marketing site.\n\n"
            f"Requested slot: {when}\n\n" + "\n".join(details) + "\n\n"
            "— Crib"
        )

        result = await get_email_provider().send(
            recipient_name="Crib Team",
            recipient_email=recipient,
            recipient_phone=None,
            subject=subject,
            body=body,
        )
        if result.success:
            log.info("demo_booking.team_alert_sent", booking_id=str(booking.id))
        else:
            log.warning("demo_booking.team_alert_failed", reason=result.failure_reason)
    except Exception:
        log.warning("demo_booking.team_alert_exception", exc_info=True)


async def _send_booker_confirmation(booking: DemoBooking, db: AsyncSession) -> None:
    """Send the person who booked a confirmation email with a calendar invite."""
    from app.core.config import get_settings
    from app.integrations.notifications.base import EmailAttachment
    from app.integrations.notifications.email import get_email_provider

    try:
        s = get_settings()
        from_address = s.email_from or "hello@crib.ug"

        name = f"{booking.first_name} {booking.last_name}".strip()
        slot_dt = _slot_datetime(booking)
        when = slot_dt.strftime("%A, %d %B %Y at %H:%M (%Z)")

        summary = "Crib product demo"
        description = (
            f"Your Crib product demo with {name}.\n"
            "We'll walk you through how Crib helps you manage your properties."
        )

        ics_bytes = build_ics(
            uid=booking.id,
            summary=summary,
            description=description,
            start=slot_dt,
            duration=_DEMO_DURATION,
            organizer_email=from_address,
            organizer_name="Crib",
            attendee_email=booking.email,
            attendee_name=name,
            location="Online — link will be shared by email before the demo",
        )
        gcal_link = build_google_calendar_link(
            summary=summary,
            description=description,
            start=slot_dt,
            duration=_DEMO_DURATION,
            location="Online — link will be shared by email before the demo",
        )

        subject = "Your Crib demo is booked!"
        body = (
            f"Hi {booking.first_name},\n\n"
            f"Thanks for booking a demo with Crib. We've scheduled it for:\n\n"
            f"  {when}\n\n"
            "We've attached a calendar invite (.ics) — open it to add the event "
            "to your calendar. You can also add it to Google Calendar here:\n\n"
            f"  {gcal_link}\n\n"
            "If you need to reschedule or have any questions before then, just "
            "reply to this email or reach us at hello@crib.ug.\n\n"
            "See you soon,\n"
            "— The Crib Team"
        )
        html_body = (
            f"<p>Hi {booking.first_name},</p>"
            f"<p>Thanks for booking a demo with Crib. We've scheduled it for:</p>"
            f"<p><strong>{when}</strong></p>"
            "<p>We've attached a calendar invite (.ics) — open it to add the event "
            "to your calendar, or use the link below:</p>"
            f'<p><a href="{gcal_link}">Add to Google Calendar</a></p>'
            "<p>If you need to reschedule or have any questions before then, just "
            "reply to this email or reach us at hello@crib.ug.</p>"
            "<p>See you soon,<br/>— The Crib Team</p>"
        )

        result = await get_email_provider().send(
            recipient_name=name,
            recipient_email=booking.email,
            recipient_phone=None,
            subject=subject,
            body=body,
            html_body=html_body,
            attachments=[
                EmailAttachment(filename="crib-demo.ics", content=ics_bytes, mime_type="text/calendar")
            ],
        )
        if result.success:
            log.info("demo_booking.confirmation_sent", booking_id=str(booking.id))
        else:
            log.warning("demo_booking.confirmation_failed", reason=result.failure_reason)
    except Exception:
        log.warning("demo_booking.confirmation_exception", exc_info=True)
