"""
Render service for the slug-keyed, superadmin-editable email_templates registry.

Security & reliability design:
  - Templates are rendered with `jinja2.sandbox.SandboxedEnvironment`, not the
    plain `Environment` used by app.core.agreement_template — that template's
    *source* is trusted, code-defined content; these are admin-edited and
    DB-stored, so we sandbox as defense-in-depth per Jinja2's own guidance for
    untrusted template authors (no attribute access to unsafe internals, etc).
  - `render()` ALWAYS falls back to the built-in EMAIL_TEMPLATE_DEFAULTS
    whenever the DB row is missing, inactive, has an empty subject/text body,
    or raises a TemplateError — a malformed superadmin edit can never break
    live email delivery, it just logs a warning and keeps using the last-known
    -good (default) copy.
  - `validate()` renders proposed copy against a documented sample context
    before it is ever persisted — the admin endpoint turns a TemplateError
    into a 422, so a broken template is never saved in the first place.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

import structlog
from fastapi import HTTPException, status
from jinja2 import TemplateError
from jinja2.sandbox import SandboxedEnvironment
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.notifications.base import DeliveryResult
from app.models.email_template import (
    EMAIL_TEMPLATE_DEFAULTS,
    EMAIL_TEMPLATE_SAMPLE_CONTEXTS,
    EmailTemplate,
)

log = structlog.get_logger(__name__)

_env = SandboxedEnvironment(
    autoescape=True,
    keep_trailing_newline=True,
    trim_blocks=True,
    lstrip_blocks=True,
)

_DEFAULTS_BY_SLUG: dict[str, dict] = {row["slug"]: row for row in EMAIL_TEMPLATE_DEFAULTS}
SLUGS: list[str] = list(_DEFAULTS_BY_SLUG)


@dataclass
class RenderedEmail:
    subject: str
    html_body: str
    text_body: str


def _require_known_slug(slug: str) -> None:
    if slug not in _DEFAULTS_BY_SLUG:
        raise ValueError(f"Unknown email template slug: {slug!r}")


def _render_source(source: str, context: dict) -> str:
    if not source:
        return ""
    return _env.from_string(source).render(**context)


def available_variables(slug: str) -> list[str]:
    """Variable names documented for this slug — drives both the admin UI's
    reference panel and the sample data used for preview/validation."""
    return sorted(EMAIL_TEMPLATE_SAMPLE_CONTEXTS.get(slug, {}))


def _render_default(slug: str, context: dict) -> RenderedEmail:
    row = _DEFAULTS_BY_SLUG[slug]
    return RenderedEmail(
        subject=_render_source(row["subject"], context),
        html_body=_render_source(row["html_body"], context),
        text_body=_render_source(row["text_body"], context),
    )


# ── Rendering (used by demo_booking_service when actually sending) ────────────

async def render(slug: str, context: dict, db: AsyncSession) -> RenderedEmail:
    """
    Render the active, superadmin-edited copy for `slug`, falling back to the
    built-in default if the row is missing, inactive, incomplete, or fails to
    render. Never raises on bad admin-authored content — logs and falls back.
    """
    _require_known_slug(slug)

    row = await db.scalar(select(EmailTemplate).where(EmailTemplate.slug == slug))
    if row is not None and row.is_active and row.subject and row.text_body:
        try:
            return RenderedEmail(
                subject=_render_source(row.subject, context),
                html_body=_render_source(row.html_body, context),
                text_body=_render_source(row.text_body, context),
            )
        except TemplateError:
            log.warning(
                "email_template.render_failed_using_default",
                slug=slug, exc_info=True,
            )

    return _render_default(slug, context)


# ── Validation (used before persisting an admin edit) ─────────────────────────

def validate(slug: str, *, subject: str, html_body: str, text_body: str) -> None:
    """
    Render proposed subject/html_body/text_body against the slug's sample
    context. Raises ValueError (with a field-prefixed, human-readable message)
    on a Jinja2 syntax or undefined-variable error.
    """
    _require_known_slug(slug)
    context = EMAIL_TEMPLATE_SAMPLE_CONTEXTS.get(slug, {})
    for field, source in (("subject", subject), ("html_body", html_body), ("text_body", text_body)):
        try:
            _render_source(source, context)
        except TemplateError as exc:
            raise ValueError(f"{field}: {exc}") from exc


# ── Admin CRUD ─────────────────────────────────────────────────────────────────

async def list_templates(db: AsyncSession) -> list[EmailTemplate]:
    result = await db.execute(select(EmailTemplate).order_by(EmailTemplate.slug))
    return list(result.scalars().all())


async def get_template_or_404(slug: str, db: AsyncSession) -> EmailTemplate:
    if slug not in _DEFAULTS_BY_SLUG:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Email template '{slug}' not found")
    row = await db.scalar(select(EmailTemplate).where(EmailTemplate.slug == slug))
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Email template '{slug}' not found")
    return row


async def update_template(
    slug: str,
    *,
    subject: str,
    html_body: str,
    text_body: str,
    is_active: bool,
    updated_by: str,
    db: AsyncSession,
) -> EmailTemplate:
    """Validates Jinja2 syntax before persisting — a broken template is rejected with a 422, never saved."""
    try:
        validate(slug, subject=subject, html_body=html_body, text_body=text_body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    row = await get_template_or_404(slug, db)
    row.subject = subject
    row.html_body = html_body
    row.text_body = text_body
    row.is_active = is_active
    row.updated_by = updated_by
    row.updated_at = datetime.now(timezone.utc)

    await db.flush()
    await db.refresh(row)
    log.info("email_template.updated", slug=slug, updated_by=updated_by)
    return row


# ── Preview & test-send ────────────────────────────────────────────────────────

async def preview(slug: str, db: AsyncSession) -> RenderedEmail:
    """Render the template that would actually be used right now (active edit, or default) against sample data."""
    _require_known_slug(slug)
    context = EMAIL_TEMPLATE_SAMPLE_CONTEXTS.get(slug, {})
    return await render(slug, context, db)


async def test_send(slug: str, recipient: str, db: AsyncSession) -> DeliveryResult:
    """Render with sample data and dispatch a real email, so a superadmin can see an edit land in an actual inbox."""
    from app.services.settings_service import get_email_provider_from_db

    rendered = await preview(slug, db)
    provider = await get_email_provider_from_db(db)
    result = await provider.send(
        recipient_name=recipient,
        recipient_email=recipient,
        recipient_phone=None,
        subject=f"[Test] {rendered.subject}",
        body=rendered.text_body,
        html_body=rendered.html_body or None,
    )
    log.info("email_template.test_send", slug=slug, recipient=recipient, success=result.success)
    return result
