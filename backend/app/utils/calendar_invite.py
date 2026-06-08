"""Generate calendar invites (.ics files and Google Calendar links) for booked events."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

_DT_FMT = "%Y%m%dT%H%M%SZ"


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")


def build_ics(
    *,
    uid: uuid.UUID,
    summary: str,
    description: str,
    start: datetime,
    duration: timedelta,
    organizer_email: str,
    organizer_name: str,
    attendee_email: str,
    attendee_name: str,
    location: str = "",
) -> bytes:
    """Build a minimal RFC 5545 .ics calendar invite as bytes (UTF-8)."""
    start_utc = start.astimezone(ZoneInfo("UTC"))
    end_utc = (start + duration).astimezone(ZoneInfo("UTC"))
    now_utc = datetime.now(ZoneInfo("UTC"))

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Crib//Book a Demo//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:REQUEST",
        "BEGIN:VEVENT",
        f"UID:{uid}@crib.ug",
        f"DTSTAMP:{now_utc.strftime(_DT_FMT)}",
        f"DTSTART:{start_utc.strftime(_DT_FMT)}",
        f"DTEND:{end_utc.strftime(_DT_FMT)}",
        f"SUMMARY:{_escape(summary)}",
        f"DESCRIPTION:{_escape(description)}",
        f"ORGANIZER;CN={_escape(organizer_name)}:mailto:{organizer_email}",
        f"ATTENDEE;CN={_escape(attendee_name)};RSVP=TRUE:mailto:{attendee_email}",
    ]
    if location:
        lines.append(f"LOCATION:{_escape(location)}")
    lines += [
        "STATUS:CONFIRMED",
        "SEQUENCE:0",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return ("\r\n".join(lines) + "\r\n").encode("utf-8")


def build_google_calendar_link(
    *,
    summary: str,
    description: str,
    start: datetime,
    duration: timedelta,
    location: str = "",
) -> str:
    """Build an "Add to Google Calendar" URL for the given event."""
    start_utc = start.astimezone(ZoneInfo("UTC"))
    end_utc = (start + duration).astimezone(ZoneInfo("UTC"))
    params = {
        "action": "TEMPLATE",
        "text": summary,
        "dates": f"{start_utc.strftime(_DT_FMT)}/{end_utc.strftime(_DT_FMT)}",
        "details": description,
    }
    if location:
        params["location"] = location
    return f"https://calendar.google.com/calendar/render?{urlencode(params)}"
