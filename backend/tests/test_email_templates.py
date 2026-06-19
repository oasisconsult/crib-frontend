"""
Tests for the superadmin-editable email-templates registry.

Coverage:
  Admin CRUD   : auth guard, list/get, update persists + stamps updated_by,
                 update rejects malformed Jinja2 syntax (422, never persisted)
  Preview      : renders the active template against its documented sample data
  Test-send    : dispatches a real send through the (mocked) email provider
  Fallback     : render() always falls back to EMAIL_TEMPLATE_DEFAULTS when the
                 row is inactive, missing, or fails to render — a malformed
                 edit can never break live email delivery
  End-to-end   : editing a template via the admin endpoint changes the copy of
                 the email actually sent by the demo-booking flow
"""

from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.notifications.base import DeliveryResult
from app.models.demo_booking import DemoBooking
from app.models.email_template import EMAIL_TEMPLATE_DEFAULTS, EmailTemplate
from app.services import email_template_service
from tests.conftest import auth_headers

_SLUG = "demo_booking_confirmed"
_SAMPLE_CONTEXT = {"first_name": "Ada", "when": "soon", "contact_email": "demo@geoboxafrica.com"}


def superadmin_headers() -> dict[str, str]:
    return auth_headers("superadmin-1")


def owner_headers() -> dict[str, str]:
    return auth_headers("owner-1")


@pytest.fixture(autouse=True)
def mock_email_provider():
    """Stub the email provider so no real send attempts happen during tests."""
    provider = AsyncMock()
    provider.send = AsyncMock(return_value=DeliveryResult(success=True, external_message_id="test-msg"))
    with patch("app.services.settings_service.get_email_provider_from_db", new_callable=AsyncMock, return_value=provider):
        yield provider


async def _row(db_session: AsyncSession, slug: str = _SLUG) -> EmailTemplate:
    row = await db_session.scalar(select(EmailTemplate).where(EmailTemplate.slug == slug))
    assert row is not None
    return row


# ── Admin: list & get ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_requires_superadmin(client: AsyncClient):
    r = await client.get("/api/v1/admin/email-templates", headers=owner_headers())
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_list_returns_the_full_registry(client: AsyncClient):
    r = await client.get("/api/v1/admin/email-templates", headers=superadmin_headers())
    assert r.status_code == 200
    slugs = {t["slug"] for t in r.json()}
    assert slugs == {row["slug"] for row in EMAIL_TEMPLATE_DEFAULTS}


@pytest.mark.asyncio
async def test_get_single_template_documents_its_variables(client: AsyncClient):
    r = await client.get(f"/api/v1/admin/email-templates/{_SLUG}", headers=superadmin_headers())
    assert r.status_code == 200
    body = r.json()
    assert body["slug"] == _SLUG
    assert "first_name" in body["availableVariables"]


@pytest.mark.asyncio
async def test_get_unknown_slug_returns_404(client: AsyncClient):
    r = await client.get("/api/v1/admin/email-templates/not-a-real-slug", headers=superadmin_headers())
    assert r.status_code == 404


# ── Admin: update ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_requires_superadmin(client: AsyncClient):
    r = await client.put(
        f"/api/v1/admin/email-templates/{_SLUG}",
        json={"subject": "x", "htmlBody": "", "textBody": "x", "isActive": True},
        headers=owner_headers(),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_update_persists_and_stamps_updated_by(client: AsyncClient, db_session: AsyncSession):
    r = await client.put(
        f"/api/v1/admin/email-templates/{_SLUG}",
        json={
            "subject": "Demo confirmed for {{ first_name }}!",
            "htmlBody": "<p>Hi {{ first_name }}, see you {{ when }}.</p>",
            "textBody": "Hi {{ first_name }}, see you {{ when }}.",
            "isActive": True,
        },
        headers=superadmin_headers(),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["subject"] == "Demo confirmed for {{ first_name }}!"
    assert body["updatedBy"] == "dev_superadmin1"  # auth_headers("superadmin-1") -> TokenClaims.sub

    row = await _row(db_session)
    assert row.subject == "Demo confirmed for {{ first_name }}!"
    assert row.updated_by == "dev_superadmin1"


@pytest.mark.asyncio
async def test_update_rejects_malformed_template_syntax_and_never_persists_it(
    client: AsyncClient, db_session: AsyncSession,
):
    before = (await _row(db_session)).subject

    r = await client.put(
        f"/api/v1/admin/email-templates/{_SLUG}",
        json={
            "subject": "{{ unclosed",
            "htmlBody": "<p>fine</p>",
            "textBody": "fine",
            "isActive": True,
        },
        headers=superadmin_headers(),
    )
    assert r.status_code == 422

    after = (await _row(db_session)).subject
    assert after == before  # rejected edit was never persisted


# ── Preview & test-send ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_preview_renders_sample_data(client: AsyncClient):
    r = await client.post(f"/api/v1/admin/email-templates/{_SLUG}/preview", headers=superadmin_headers())
    assert r.status_code == 200
    body = r.json()
    assert "{{" not in body["subject"]  # fully rendered — no leftover placeholders
    assert "Ada" in body["textBody"]


@pytest.mark.asyncio
async def test_test_send_dispatches_through_the_email_provider(client: AsyncClient, mock_email_provider):
    r = await client.post(
        f"/api/v1/admin/email-templates/{_SLUG}/test-send",
        json={"recipient": "qa@example.com"},
        headers=superadmin_headers(),
    )
    assert r.status_code == 200
    assert r.json()["success"] is True

    mock_email_provider.send.assert_awaited_once()
    assert mock_email_provider.send.await_args.kwargs["recipient_email"] == "qa@example.com"
    assert mock_email_provider.send.await_args.kwargs["subject"].startswith("[Test] ")


# ── Fallback-on-failure ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_render_falls_back_to_default_when_inactive(db_session: AsyncSession):
    row = await _row(db_session)
    row.subject = "Customised — should never be used while inactive"
    row.is_active = False
    await db_session.flush()

    rendered = await email_template_service.render(_SLUG, _SAMPLE_CONTEXT, db_session)
    assert rendered.subject == "Your Crib demo is confirmed!"


@pytest.mark.asyncio
async def test_render_falls_back_to_default_when_row_missing(db_session: AsyncSession):
    await db_session.execute(EmailTemplate.__table__.delete().where(EmailTemplate.slug == _SLUG))
    await db_session.flush()

    rendered = await email_template_service.render(_SLUG, _SAMPLE_CONTEXT, db_session)
    assert rendered.subject == "Your Crib demo is confirmed!"


@pytest.mark.asyncio
async def test_render_falls_back_to_default_when_active_template_fails_to_render(db_session: AsyncSession):
    row = await _row(db_session)
    row.text_body = "Hi {{ unclosed"
    await db_session.flush()

    rendered = await email_template_service.render(_SLUG, _SAMPLE_CONTEXT, db_session)
    assert rendered.subject == "Your Crib demo is confirmed!"
    assert "your Crib product demo is confirmed for" in rendered.text_body


# ── End-to-end: editing a template changes what actually gets sent ────────────

@pytest.mark.asyncio
async def test_editing_template_changes_the_email_the_booking_flow_actually_sends(
    client: AsyncClient, db_session: AsyncSession, mock_email_provider,
):
    custom_subject = "CUSTOM — your demo is confirmed, {{ first_name }}!"
    r = await client.put(
        f"/api/v1/admin/email-templates/{_SLUG}",
        json={
            "subject": custom_subject,
            "htmlBody": "<p>Hi {{ first_name }}</p>",
            "textBody": "Hi {{ first_name }}, confirmed for {{ when }}. Contact {{ contact_email }}.",
            "isActive": True,
        },
        headers=superadmin_headers(),
    )
    assert r.status_code == 200

    slot_date = (date.today() + timedelta(days=45)).isoformat()
    create = await client.post(
        "/api/v1/public/demo-bookings",
        json={
            "firstName": "Grace", "lastName": "Hopper", "email": "grace-template@example.com",
            "phone": "+256700000001", "marketingConsent": False,
            "slotDate": slot_date, "slotTime": "09:00:00", "timezone": "Africa/Kampala",
        },
    )
    assert create.status_code == 201
    mock_email_provider.send.reset_mock()  # ignore the create-time team-alert + confirmation emails

    booking = await db_session.scalar(select(DemoBooking).where(DemoBooking.email == "grace-template@example.com"))
    confirm = await client.patch(
        f"/api/v1/demo-bookings/{booking.id}/status",
        json={"status": "confirmed"},
        headers=superadmin_headers(),
    )
    assert confirm.status_code == 200

    booker_calls = [
        c for c in mock_email_provider.send.await_args_list
        if c.kwargs["recipient_email"] == "grace-template@example.com"
    ]
    assert len(booker_calls) == 1
    assert booker_calls[0].kwargs["subject"] == "CUSTOM — your demo is confirmed, Grace!"
