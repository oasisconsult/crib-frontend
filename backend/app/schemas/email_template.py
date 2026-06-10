"""Pydantic schemas for the superadmin-editable email-templates registry."""

from __future__ import annotations

from pydantic import EmailStr

from app.schemas.common import CamelModel


class EmailTemplateOut(CamelModel):
    slug: str
    name: str
    description: str
    subject: str
    html_body: str
    text_body: str
    is_active: bool
    available_variables: list[str]
    updated_by: str | None
    updated_at: str
    created_at: str


class EmailTemplateUpdate(CamelModel):
    """Payload to edit a template's copy. Validated against sample data before persisting (422 on bad syntax)."""
    subject: str
    html_body: str
    text_body: str
    is_active: bool = True


class EmailTemplatePreviewOut(CamelModel):
    """A template rendered against its documented sample context — what the superadmin sees in the Preview pane."""
    subject: str
    html_body: str
    text_body: str


class EmailTemplateTestSendRequest(CamelModel):
    recipient: EmailStr


class EmailTemplateTestSendResult(CamelModel):
    success: bool
    message: str
