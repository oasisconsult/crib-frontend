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
     Confirming or cancelling a booking emails both the booker and the
     platform team — re-applying the same status is a no-op (no resends).
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
from app.services import email_template_service, settings_service
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

_CONTACT_EMAIL_KEY = "notifications.demo_contact_email"
_CONTACT_EMAIL_DEFAULT = "demo@geoboxafrica.com"


async def _contact_email(db: AsyncSession) -> str:
    email = await settings_service.get(_CONTACT_EMAIL_KEY, db, default=_CONTACT_EMAIL_DEFAULT)
    return email or _CONTACT_EMAIL_DEFAULT


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
    previous_status = booking.status
    booking.status = new_status
    await db.commit()
    await db.refresh(booking)

    # Only notify on an actual transition — re-confirming an already-confirmed
    # (or re-cancelling an already-cancelled) booking shouldn't resend emails.
    if new_status != previous_status:
        notify = _STATUS_TRANSITION_EMAILS.get(new_status)
        if notify:
            await notify(booking, db, new_status)

    return _out(booking)


# ── Notifications ──────────────────────────────────────────────────────────────

async def _send_team_alert(booking: DemoBooking, db: AsyncSession) -> None:
    """Alert the platform team that a new demo has been booked."""
    from app.services.settings_service import get_email_provider_from_db

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

        rendered = await email_template_service.render(
            "demo_booking_team_new",
            {"name": name, "when": when, "details": "\n".join(details)},
            db,
        )

        result = await (await get_email_provider_from_db(db)).send(
            recipient_name="Crib Team",
            recipient_email=recipient,
            recipient_phone=None,
            subject=rendered.subject,
            body=rendered.text_body,
            html_body=rendered.html_body or None,
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
    from app.services.settings_service import get_email_provider_from_db

    try:
        s = get_settings()
        from_address = s.email_from or "hello@crib.ug"
        contact_email = await _contact_email(db)

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

        rendered = await email_template_service.render(
            "demo_booking_created",
            {
                "first_name": booking.first_name,
                "when": when,
                "gcal_link": gcal_link,
                "contact_email": contact_email,
            },
            db,
        )

        result = await (await get_email_provider_from_db(db)).send(
            recipient_name=name,
            recipient_email=booking.email,
            recipient_phone=None,
            subject=rendered.subject,
            body=rendered.text_body,
            html_body=rendered.html_body or None,
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


_STATUS_VERB = {
    DemoBookingStatus.CONFIRMED: "confirmed",
    DemoBookingStatus.CANCELLED: "cancelled",
}


async def _notify_status_transition(booking: DemoBooking, db: AsyncSession, new_status: str) -> None:
    """On confirm/cancel, tell both the booker and the platform team."""
    await _send_booker_status_email(booking, db, new_status)
    await _send_team_status_alert(booking, db, new_status)


async def _send_booker_status_email(booking: DemoBooking, db: AsyncSession, new_status: str) -> None:
    """Let the booker know their demo slot was confirmed or cancelled."""
    from app.services.settings_service import get_email_provider_from_db

    try:
        contact_email = await _contact_email(db)
        name = f"{booking.first_name} {booking.last_name}".strip()
        slot_dt = _slot_datetime(booking)
        when = slot_dt.strftime("%A, %d %B %Y at %H:%M (%Z)")

        slug = "demo_booking_confirmed" if new_status == DemoBookingStatus.CONFIRMED else "demo_booking_cancelled"
        rendered = await email_template_service.render(
            slug,
            {"first_name": booking.first_name, "when": when, "contact_email": contact_email},
            db,
        )

        result = await (await get_email_provider_from_db(db)).send(
            recipient_name=name,
            recipient_email=booking.email,
            recipient_phone=None,
            subject=rendered.subject,
            body=rendered.text_body,
            html_body=rendered.html_body or None,
        )
        if result.success:
            log.info("demo_booking.status_email_sent", booking_id=str(booking.id), status=new_status)
        else:
            log.warning("demo_booking.status_email_failed", reason=result.failure_reason, status=new_status)
    except Exception:
        log.warning("demo_booking.status_email_exception", exc_info=True, status=new_status)


async def _send_team_status_alert(booking: DemoBooking, db: AsyncSession, new_status: str) -> None:
    """Let the platform team know a booking was confirmed or cancelled."""
    from app.services.settings_service import get_email_provider_from_db

    try:
        recipient = await settings_service.get(
            "notifications.demo_booking_email", db, default="hello@crib.ug"
        )
        if not recipient:
            return

        name = f"{booking.first_name} {booking.last_name}".strip()
        slot_dt = _slot_datetime(booking)
        when = slot_dt.strftime("%A, %d %B %Y at %H:%M (%Z)")
        verb = _STATUS_VERB[new_status]

        rendered = await email_template_service.render(
            "demo_booking_team_status",
            {"name": name, "email": booking.email, "when": when, "verb": verb},
            db,
        )

        result = await (await get_email_provider_from_db(db)).send(
            recipient_name="Crib Team",
            recipient_email=recipient,
            recipient_phone=None,
            subject=rendered.subject,
            body=rendered.text_body,
            html_body=rendered.html_body or None,
        )
        if result.success:
            log.info("demo_booking.team_status_alert_sent", booking_id=str(booking.id), status=new_status)
        else:
            log.warning("demo_booking.team_status_alert_failed", reason=result.failure_reason, status=new_status)
    except Exception:
        log.warning("demo_booking.team_status_alert_exception", exc_info=True, status=new_status)


_STATUS_TRANSITION_EMAILS = {
    DemoBookingStatus.CONFIRMED: _notify_status_transition,
    DemoBookingStatus.CANCELLED: _notify_status_transition,
}
