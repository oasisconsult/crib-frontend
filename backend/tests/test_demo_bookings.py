"""
Tests for the Book a Demo feature (public submission + admin management).

Coverage:
  Public create : success persists booking, sets consent timestamp, sends emails
  Validation    : past slot -> 422, bad timezone -> 422, double-booking -> 409
  Honeypot      : bot submissions silently accepted but not persisted
  Admin list    : auth guard (403/200), search filter
  Admin status  : auth guard, success, invalid status -> 422, not found -> 404
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
from tests.conftest import auth_headers


def superadmin_headers() -> dict[str, str]:
    return auth_headers("superadmin-1")


def owner_headers() -> dict[str, str]:
    return auth_headers("owner-1")


# Far enough in the future that "past slot" validation never trips.
# Each test uses its own slot_time so concurrent inserts never collide
# on the (slot_date, slot_time) unique constraint.
_FUTURE_DATE = date.today() + timedelta(days=30)


def _payload(slot_time: str, **overrides) -> dict:
    body = {
        "firstName": "Ada",
        "lastName": "Lovelace",
        "email": "ada@example.com",
        "phone": "+256700000000",
        "company": "Analytical Engines Ltd",
        "portfolioSize": "11-50",
        "message": "Looking forward to it",
        "marketingConsent": True,
        "slotDate": _FUTURE_DATE.isoformat(),
        "slotTime": slot_time,
        "timezone": "Africa/Kampala",
    }
    body.update(overrides)
    return body


@pytest.fixture(autouse=True)
def mock_email_provider():
    """Stub the email provider so no real send attempts happen during tests."""
    provider = AsyncMock()
    provider.send = AsyncMock(return_value=DeliveryResult(success=True, external_message_id="test-msg"))
    with patch("app.services.settings_service.get_email_provider_from_db", new_callable=AsyncMock, return_value=provider):
        yield provider


# ── Public submission ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_booking_success_persists_and_sends_emails(
    client: AsyncClient, db_session: AsyncSession, mock_email_provider,
):
    r = await client.post("/api/v1/public/demo-bookings", json=_payload("09:00:00"))
    assert r.status_code == 201
    assert r.json() == {"message": "Thanks! We've received your booking request."}

    booking = await db_session.scalar(select(DemoBooking).where(DemoBooking.email == "ada@example.com"))
    assert booking is not None
    assert booking.consent_given_at is not None
    assert mock_email_provider.send.await_count == 2  # team alert + booker confirmation


@pytest.mark.asyncio
async def test_create_booking_without_consent_leaves_timestamp_null(client: AsyncClient, db_session: AsyncSession):
    r = await client.post(
        "/api/v1/public/demo-bookings",
        json=_payload("10:00:00", marketingConsent=False, email="no-consent@example.com"),
    )
    assert r.status_code == 201

    booking = await db_session.scalar(select(DemoBooking).where(DemoBooking.email == "no-consent@example.com"))
    assert booking is not None
    assert booking.marketing_consent is False
    assert booking.consent_given_at is None


@pytest.mark.asyncio
async def test_create_booking_rejects_past_slot(client: AsyncClient):
    past_date = date.today() - timedelta(days=1)
    r = await client.post(
        "/api/v1/public/demo-bookings",
        json=_payload("09:00:00", slotDate=past_date.isoformat(), email="late@example.com"),
    )
    assert r.status_code == 422
    assert "past" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_booking_rejects_unknown_timezone(client: AsyncClient):
    r = await client.post(
        "/api/v1/public/demo-bookings",
        json=_payload("11:00:00", timezone="Mars/Olympus_Mons", email="mars@example.com"),
    )
    assert r.status_code == 422
    assert r.json()["detail"] == "Unrecognised timezone"


@pytest.mark.asyncio
async def test_create_booking_conflict_on_double_booking(client: AsyncClient):
    slot_time = "12:00:00"
    first = await client.post(
        "/api/v1/public/demo-bookings",
        json=_payload(slot_time, email="first@example.com"),
    )
    assert first.status_code == 201

    second = await client.post(
        "/api/v1/public/demo-bookings",
        json=_payload(slot_time, email="second@example.com"),
    )
    assert second.status_code == 409
    assert second.json()["detail"] == "That time slot has just been booked. Please choose another."


@pytest.mark.asyncio
async def test_create_booking_honeypot_silently_accepted_but_not_persisted(
    client: AsyncClient, db_session: AsyncSession, mock_email_provider,
):
    r = await client.post(
        "/api/v1/public/demo-bookings",
        json=_payload("13:00:00", website="https://spam.example.com", email="bot@example.com"),
    )
    assert r.status_code == 201
    assert r.json() == {"message": "Thanks! We've received your booking request."}

    booking = await db_session.scalar(select(DemoBooking).where(DemoBooking.email == "bot@example.com"))
    assert booking is None
    mock_email_provider.send.assert_not_awaited()


# ── Admin: list ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_bookings_requires_superadmin(client: AsyncClient):
    r = await client.get("/api/v1/demo-bookings", headers=owner_headers())
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_list_bookings_superadmin_sees_results(client: AsyncClient):
    create = await client.post(
        "/api/v1/public/demo-bookings",
        json=_payload("14:00:00", email="listme@example.com", firstName="Grace", lastName="Hopper"),
    )
    assert create.status_code == 201

    r = await client.get("/api/v1/demo-bookings", headers=superadmin_headers())
    assert r.status_code == 200
    body = r.json()
    assert any(b["email"] == "listme@example.com" for b in body["data"])


@pytest.mark.asyncio
async def test_list_bookings_search_filters_by_name(client: AsyncClient):
    await client.post(
        "/api/v1/public/demo-bookings",
        json=_payload("15:00:00", email="grace@example.com", firstName="Grace", lastName="Hopper"),
    )
    await client.post(
        "/api/v1/public/demo-bookings",
        json=_payload("16:00:00", email="margaret@example.com", firstName="Margaret", lastName="Hamilton"),
    )

    r = await client.get("/api/v1/demo-bookings", params={"search": "Hopper"}, headers=superadmin_headers())
    assert r.status_code == 200
    body = r.json()
    emails = {b["email"] for b in body["data"]}
    assert "grace@example.com" in emails
    assert "margaret@example.com" not in emails


# ── Admin: status update ───────────────────────────────────────────────────────

async def _create_and_get_id(client: AsyncClient, db_session: AsyncSession, slot_time: str, email: str) -> str:
    r = await client.post("/api/v1/public/demo-bookings", json=_payload(slot_time, email=email))
    assert r.status_code == 201
    booking = await db_session.scalar(select(DemoBooking).where(DemoBooking.email == email))
    return str(booking.id)


@pytest.mark.asyncio
async def test_update_status_requires_superadmin(client: AsyncClient, db_session: AsyncSession):
    booking_id = await _create_and_get_id(client, db_session, "17:00:00", "guard@example.com")
    r = await client.patch(
        f"/api/v1/demo-bookings/{booking_id}/status",
        json={"status": "confirmed"},
        headers=owner_headers(),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_update_status_superadmin_success(client: AsyncClient, db_session: AsyncSession):
    booking_id = await _create_and_get_id(client, db_session, "18:00:00", "confirm@example.com")
    r = await client.patch(
        f"/api/v1/demo-bookings/{booking_id}/status",
        json={"status": "confirmed"},
        headers=superadmin_headers(),
    )
    assert r.status_code == 200
    assert r.json()["status"] == "confirmed"


@pytest.mark.asyncio
async def test_update_status_rejects_invalid_value(client: AsyncClient, db_session: AsyncSession):
    booking_id = await _create_and_get_id(client, db_session, "19:00:00", "invalid-status@example.com")
    r = await client.patch(
        f"/api/v1/demo-bookings/{booking_id}/status",
        json={"status": "archived"},
        headers=superadmin_headers(),
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_update_status_not_found(client: AsyncClient):
    r = await client.patch(
        "/api/v1/demo-bookings/00000000-0000-0000-0000-000000000000/status",
        json={"status": "confirmed"},
        headers=superadmin_headers(),
    )
    assert r.status_code == 404


# ── Status-change notifications ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_status_confirm_emails_booker_and_team(
    client: AsyncClient, db_session: AsyncSession, mock_email_provider,
):
    booking_id = await _create_and_get_id(client, db_session, "20:00:00", "confirm-notify@example.com")
    mock_email_provider.send.reset_mock()  # ignore the create-time team-alert + confirmation emails

    r = await client.patch(
        f"/api/v1/demo-bookings/{booking_id}/status",
        json={"status": "confirmed"},
        headers=superadmin_headers(),
    )
    assert r.status_code == 200

    assert mock_email_provider.send.await_count == 2  # booker status email + team status alert
    recipients = {c.kwargs["recipient_email"] for c in mock_email_provider.send.await_args_list}
    assert recipients == {"confirm-notify@example.com", "hello@crib.ug"}
    subjects = {c.kwargs["subject"] for c in mock_email_provider.send.await_args_list}
    assert any("confirmed" in s.lower() for s in subjects)


@pytest.mark.asyncio
async def test_update_status_cancel_emails_booker_and_team(
    client: AsyncClient, db_session: AsyncSession, mock_email_provider,
):
    booking_id = await _create_and_get_id(client, db_session, "20:30:00", "cancel-notify@example.com")
    mock_email_provider.send.reset_mock()

    r = await client.patch(
        f"/api/v1/demo-bookings/{booking_id}/status",
        json={"status": "cancelled"},
        headers=superadmin_headers(),
    )
    assert r.status_code == 200

    assert mock_email_provider.send.await_count == 2  # booker status email + team status alert
    recipients = {c.kwargs["recipient_email"] for c in mock_email_provider.send.await_args_list}
    assert recipients == {"cancel-notify@example.com", "hello@crib.ug"}
    subjects = {c.kwargs["subject"] for c in mock_email_provider.send.await_args_list}
    assert any("cancelled" in s.lower() for s in subjects)


@pytest.mark.asyncio
async def test_update_status_reapplying_same_status_does_not_resend_emails(
    client: AsyncClient, db_session: AsyncSession, mock_email_provider,
):
    booking_id = await _create_and_get_id(client, db_session, "21:00:00", "noop-notify@example.com")

    r1 = await client.patch(
        f"/api/v1/demo-bookings/{booking_id}/status",
        json={"status": "confirmed"},
        headers=superadmin_headers(),
    )
    assert r1.status_code == 200
    mock_email_provider.send.reset_mock()  # ignore create + first-confirm emails

    r2 = await client.patch(
        f"/api/v1/demo-bookings/{booking_id}/status",
        json={"status": "confirmed"},
        headers=superadmin_headers(),
    )
    assert r2.status_code == 200
    assert r2.json()["status"] == "confirmed"

    mock_email_provider.send.assert_not_awaited()
