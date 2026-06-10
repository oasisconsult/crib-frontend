"""
Email template endpoints — superadmin only.

A fixed, slug-keyed registry of the platform's transactional email templates
(currently the 4 demo-booking flows — see app.models.email_template). The admin
UI edits existing entries; it cannot create or delete templates.

Endpoints:
  GET  /admin/email-templates             — list all templates
  GET  /admin/email-templates/{slug}      — single template
  PUT  /admin/email-templates/{slug}      — update copy (validated, 422 on bad syntax)
  POST /admin/email-templates/{slug}/preview    — render against sample data
  POST /admin/email-templates/{slug}/test-send  — render + send a real test email
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, require_superadmin
from app.core.database import get_db
from app.models.email_template import EmailTemplate
from app.schemas.email_template import (
    EmailTemplateOut,
    EmailTemplatePreviewOut,
    EmailTemplateTestSendRequest,
    EmailTemplateTestSendResult,
    EmailTemplateUpdate,
)
from app.services import email_template_service

router = APIRouter(prefix="/admin/email-templates", tags=["admin"])

# _super enforces the superadmin guard. Handlers that don't use the user value
# bind it to `_` to silence linters while keeping the auth check active.
_super = Depends(require_superadmin())


def _out(template: EmailTemplate) -> EmailTemplateOut:
    return EmailTemplateOut(
        slug=template.slug,
        name=template.name,
        description=template.description,
        subject=template.subject,
        html_body=template.html_body,
        text_body=template.text_body,
        is_active=template.is_active,
        available_variables=email_template_service.available_variables(template.slug),
        updated_by=template.updated_by,
        updated_at=template.updated_at.isoformat(),
        created_at=template.created_at.isoformat(),
    )


# ── Read ───────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[EmailTemplateOut])
async def list_email_templates(
    _: CurrentUser = _super,
    db: AsyncSession = Depends(get_db),
):
    """Return all templates in the registry."""
    templates = await email_template_service.list_templates(db)
    return [_out(t) for t in templates]


@router.get("/{slug}", response_model=EmailTemplateOut)
async def get_email_template(
    slug: str,
    _: CurrentUser = _super,
    db: AsyncSession = Depends(get_db),
):
    """Return a single template."""
    return _out(await email_template_service.get_template_or_404(slug, db))


# ── Write ──────────────────────────────────────────────────────────────────────

@router.put("/{slug}", response_model=EmailTemplateOut)
async def update_email_template(
    slug: str,
    body: EmailTemplateUpdate,
    current_user: CurrentUser = _super,
    db: AsyncSession = Depends(get_db),
):
    """
    Update a template's subject/body copy.

    The proposed copy is rendered against documented sample data first — a
    Jinja2 syntax error returns 422 and nothing is persisted, so a malformed
    edit can never reach (and break) live email delivery.
    """
    template = await email_template_service.update_template(
        slug,
        subject=body.subject,
        html_body=body.html_body,
        text_body=body.text_body,
        is_active=body.is_active,
        updated_by=current_user.sub,
        db=db,
    )
    return _out(template)


# ── Preview & test-send ────────────────────────────────────────────────────────

@router.post("/{slug}/preview", response_model=EmailTemplatePreviewOut)
async def preview_email_template(
    slug: str,
    _: CurrentUser = _super,
    db: AsyncSession = Depends(get_db),
):
    """Render the template that would be used right now (saved edit, or default) against sample data."""
    rendered = await email_template_service.preview(slug, db)
    return EmailTemplatePreviewOut(
        subject=rendered.subject,
        html_body=rendered.html_body,
        text_body=rendered.text_body,
    )


@router.post("/{slug}/test-send", response_model=EmailTemplateTestSendResult)
async def test_send_email_template(
    slug: str,
    body: EmailTemplateTestSendRequest,
    _: CurrentUser = _super,
    db: AsyncSession = Depends(get_db),
):
    """Render with sample data and send a real test email to the given recipient."""
    result = await email_template_service.test_send(slug, body.recipient, db)
    return EmailTemplateTestSendResult(
        success=result.success,
        message="Test email sent." if result.success else (result.failure_reason or "Failed to send test email."),
    )
