"""
EmailTemplate model — superadmin-managed transactional email templates.

Design decisions:
  - String primary key (slug), e.g. "demo_booking_confirmed" — a fixed registry
    seeded by migration; the admin UI edits existing rows, it does not create new ones
  - subject/html_body/text_body are rendered through a sandboxed Jinja2 environment
    (see app.services.email_template_service) using plain {{ variable }} placeholders
    — no control structures are needed, which keeps templates safe and simple for a
    non-technical superadmin to edit
  - is_active=False reverts to the built-in default without losing the saved draft
  - Rendering always falls back to EMAIL_TEMPLATE_DEFAULTS whenever the row is
    missing, inactive, has an empty field, or fails to render — a bad edit can
    never break live email delivery

Each template's `description` documents its available {{ variables }}.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class EmailTemplate(Base):
    __tablename__ = "email_templates"

    # Fixed registry key — e.g. "demo_booking_confirmed"
    slug: Mapped[str] = mapped_column(String(80), primary_key=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")

    subject: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    html_body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    text_body: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # False reverts to the built-in default (EMAIL_TEMPLATE_DEFAULTS) without
    # discarding the saved draft — lets a superadmin "turn off" a customisation.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Audit
    updated_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<EmailTemplate {self.slug!r} active={self.is_active}>"


# ── Defaults & sample contexts ─────────────────────────────────────────────────
# Single source of truth for the registry's default copy — imported by both the
# Alembic migration (seed data) and email_template_service (runtime fallback when
# a row is missing/inactive/broken). This mirrors how SYSTEM_SETTING_DEFAULTS in
# app.models.system_setting is shared between the migration and conftest, so the
# DB seed and the code-level fallback can never silently drift apart.
#
# Tuple-free here (unlike SYSTEM_SETTING_DEFAULTS) because there are more fields
# and the migration only needs the DB columns — not the sample_context metadata.

EMAIL_TEMPLATE_DEFAULTS: list[dict] = [
    {
        "slug": "demo_booking_created",
        "name": "Demo Booking — Confirmation",
        "description": (
            "Sent to the visitor immediately after they book a demo slot; "
            "includes a calendar invite and an 'Add to Google Calendar' link. "
            "Variables: {{ first_name }}, {{ when }}, {{ gcal_link }}, "
            "{{ contact_email }}."
        ),
        "subject": "Your Crib demo is booked!",
        "text_body": (
            "Hi {{ first_name }},\n\n"
            "Thanks for booking a demo with Crib. We've scheduled it for:\n\n"
            "  {{ when }}\n\n"
            "We've attached a calendar invite (.ics) — open it to add the event "
            "to your calendar. You can also add it to Google Calendar here:\n\n"
            "  {{ gcal_link }}\n\n"
            "If you need to reschedule or have any questions before then, just "
            "reply to this email or reach us at {{ contact_email }}.\n\n"
            "See you soon,\n"
            "— The Crib Team"
        ),
        "html_body": (
            "<p>Hi {{ first_name }},</p>"
            "<p>Thanks for booking a demo with Crib. We've scheduled it for:</p>"
            "<p><strong>{{ when }}</strong></p>"
            "<p>We've attached a calendar invite (.ics) — open it to add the event "
            "to your calendar, or use the link below:</p>"
            '<p><a href="{{ gcal_link }}">Add to Google Calendar</a></p>'
            "<p>If you need to reschedule or have any questions before then, just "
            'reply to this email or reach us at <a href="mailto:{{ contact_email }}">'
            "{{ contact_email }}</a>.</p>"
            "<p>See you soon,<br/>— The Crib Team</p>"
        ),
    },
    {
        "slug": "demo_booking_confirmed",
        "name": "Demo Booking — Confirmed",
        "description": (
            "Sent to the visitor when a superadmin confirms their booking. "
            "Variables: {{ first_name }}, {{ when }}, {{ contact_email }}."
        ),
        "subject": "Your Crib demo is confirmed!",
        "text_body": (
            "Hi {{ first_name }},\n\n"
            "Good news — your Crib product demo is confirmed for:\n\n"
            "  {{ when }}\n\n"
            "We'll see you then. If you need to reschedule or have any "
            "questions before the session, reply to this email or reach us "
            "at {{ contact_email }}.\n\n"
            "See you soon,\n"
            "— The Crib Team"
        ),
        "html_body": (
            "<p>Hi {{ first_name }},</p>"
            "<p>Good news — your Crib product demo is confirmed for:</p>"
            "<p><strong>{{ when }}</strong></p>"
            "<p>We'll see you then. If you need to reschedule or have any "
            "questions before the session, reply to this email or reach us at "
            '<a href="mailto:{{ contact_email }}">{{ contact_email }}</a>.</p>'
            "<p>See you soon,<br/>— The Crib Team</p>"
        ),
    },
    {
        "slug": "demo_booking_cancelled",
        "name": "Demo Booking — Cancelled",
        "description": (
            "Sent to the visitor when a superadmin cancels their booking. "
            "Variables: {{ first_name }}, {{ when }}, {{ contact_email }}."
        ),
        "subject": "Your Crib demo has been cancelled",
        "text_body": (
            "Hi {{ first_name }},\n\n"
            "Your Crib product demo scheduled for {{ when }} has been cancelled.\n\n"
            "If this wasn't expected, or you'd like to find a new time, just "
            "reply to this email or reach us at {{ contact_email }} and we'll "
            "get you rebooked.\n\n"
            "— The Crib Team"
        ),
        "html_body": (
            "<p>Hi {{ first_name }},</p>"
            "<p>Your Crib product demo scheduled for <strong>{{ when }}</strong> "
            "has been cancelled.</p>"
            "<p>If this wasn't expected, or you'd like to find a new time, just "
            'reply to this email or reach us at <a href="mailto:{{ contact_email }}">'
            "{{ contact_email }}</a> and we'll get you rebooked.</p>"
            "<p>— The Crib Team</p>"
        ),
    },
    {
        "slug": "demo_booking_team_new",
        "name": "Demo Booking — New Booking Alert (Team)",
        "description": (
            "Sent to the platform team whenever someone books a new demo. "
            "Variables: {{ name }}, {{ when }}, {{ details }} (a pre-formatted "
            "block listing the visitor's contact info, company, and message)."
        ),
        "subject": "New demo booking — {{ name }} ({{ when }})",
        "text_body": (
            "A new product demo has been booked via the marketing site.\n\n"
            "Requested slot: {{ when }}\n\n"
            "{{ details }}\n\n"
            "— Crib"
        ),
        "html_body": "",
    },
    {
        "slug": "demo_booking_team_status",
        "name": "Demo Booking — Status Change Alert (Team)",
        "description": (
            "Sent to the platform team whenever a booking is confirmed or "
            "cancelled. Variables: {{ name }}, {{ email }}, {{ when }}, "
            "{{ verb }} (\"confirmed\" or \"cancelled\")."
        ),
        "subject": "Demo booking {{ verb }} — {{ name }} ({{ when }})",
        "text_body": (
            "The demo booking for {{ name }} ({{ email }}) scheduled for "
            "{{ when }} has been {{ verb }}.\n\n"
            "— Crib"
        ),
        "html_body": "",
    },
]

# Sample variables used to (a) validate a template renders cleanly before saving
# and (b) populate the admin UI's "Preview" — so what the superadmin previews is
# exactly what gets validated, and a malformed edit is always caught at save-time.
EMAIL_TEMPLATE_SAMPLE_CONTEXTS: dict[str, dict] = {
    "demo_booking_created": {
        "first_name": "Ada",
        "when": "Tuesday, 16 June 2026 at 10:00 (EAT)",
        "gcal_link": "https://calendar.google.com/calendar/render?action=TEMPLATE&text=Crib+product+demo",
        "contact_email": "demo@geoboxafrica.com",
    },
    "demo_booking_confirmed": {
        "first_name": "Ada",
        "when": "Tuesday, 16 June 2026 at 10:00 (EAT)",
        "contact_email": "demo@geoboxafrica.com",
    },
    "demo_booking_cancelled": {
        "first_name": "Ada",
        "when": "Tuesday, 16 June 2026 at 10:00 (EAT)",
        "contact_email": "demo@geoboxafrica.com",
    },
    "demo_booking_team_new": {
        "name": "Ada Lovelace",
        "when": "Tuesday, 16 June 2026 at 10:00 (EAT)",
        "details": (
            "Name: Ada Lovelace\n"
            "Email: ada@example.com\n"
            "Phone: +256700000000\n"
            "Company: Analytical Engines Ltd\n"
            "Portfolio size: 11-50\n"
            "Message: Looking forward to it\n"
            "Marketing consent: yes"
        ),
    },
    "demo_booking_team_status": {
        "name": "Ada Lovelace",
        "email": "ada@example.com",
        "when": "Tuesday, 16 June 2026 at 10:00 (EAT)",
        "verb": "confirmed",
    },
}
