"""
Tests for the notifications and notification-templates endpoints.

Coverage:
  Templates : list, create, get, update, soft-delete, preview (renders {{variables}})
  Notifications: list (empty + filter by channel), send (in_app → queued state),
                 stats, mark_read
  Cross-org isolation: notifications/templates from other org not visible
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers
from tests.factories import (
    make_notification,
    make_notification_template,
    make_organisation,
)


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def ctx(dev_org, db_session: AsyncSession):
    await db_session.flush()
    return {"org": dev_org}


# ── Template list ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_templates_empty(client: AsyncClient, ctx):
    r = await client.get("/api/v1/notification-templates", headers=auth_headers())
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_list_templates_returns_own_org(client: AsyncClient, ctx, db_session):
    await make_notification_template(db_session, ctx["org"])
    other_org = await make_organisation(db_session, logto_org_id="org_other_notif_tmpl")
    await make_notification_template(db_session, other_org, name="Other Org Template")
    await db_session.flush()

    r = await client.get("/api/v1/notification-templates", headers=auth_headers())
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["name"] == "Test Template"


# ── Template create ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_template(client: AsyncClient, ctx):
    payload = {
        "name": "Rent Reminder",
        "trigger": "rent_due",
        "channel": "email",
        "subject": "Your rent is due, {{tenant_name}}",
        "body": "Hi {{tenant_name}}, your rent of {{amount}} is due on {{due_date}}.",
        "variables": ["tenant_name", "amount", "due_date"],
        "is_active": True,
    }
    r = await client.post("/api/v1/notification-templates", json=payload, headers=auth_headers())
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Rent Reminder"
    assert body["trigger"] == "rent_due"
    assert body["channel"] == "email"
    assert "tenant_name" in body["variables"]
    assert body["isActive"] is True


# ── Template get ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_template(client: AsyncClient, ctx, db_session):
    tmpl = await make_notification_template(db_session, ctx["org"], name="My Template")
    await db_session.flush()

    r = await client.get(f"/api/v1/notification-templates/{tmpl.id}", headers=auth_headers())
    assert r.status_code == 200
    assert r.json()["name"] == "My Template"


@pytest.mark.asyncio
async def test_get_template_404(client: AsyncClient, ctx):
    import uuid
    r = await client.get(f"/api/v1/notification-templates/{uuid.uuid4()}", headers=auth_headers())
    assert r.status_code == 404


# ── Template update ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_template(client: AsyncClient, ctx, db_session):
    tmpl = await make_notification_template(db_session, ctx["org"])
    await db_session.flush()

    r = await client.put(
        f"/api/v1/notification-templates/{tmpl.id}",
        json={"name": "Updated Name", "is_active": False},
        headers=auth_headers(),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Updated Name"
    assert body["isActive"] is False


# ── Template delete (soft) ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_template(client: AsyncClient, ctx, db_session):
    tmpl = await make_notification_template(db_session, ctx["org"])
    await db_session.flush()

    r = await client.delete(f"/api/v1/notification-templates/{tmpl.id}", headers=auth_headers())
    assert r.status_code == 204

    # Should no longer appear in list
    r2 = await client.get("/api/v1/notification-templates", headers=auth_headers())
    assert r2.json() == []

    # Should return 404 on direct get
    r3 = await client.get(f"/api/v1/notification-templates/{tmpl.id}", headers=auth_headers())
    assert r3.status_code == 404


# ── Template preview ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_preview_template_renders_variables(client: AsyncClient, ctx, db_session):
    tmpl = await make_notification_template(
        db_session,
        ctx["org"],
        subject="Hello {{tenant_name}}",
        body="Your rent of {{amount}} is due on {{due_date}}.",
    )
    await db_session.flush()

    r = await client.post(
        f"/api/v1/notification-templates/{tmpl.id}/preview",
        json={"variables": {"tenant_name": "Alice", "amount": "500,000 UGX", "due_date": "2026-04-01"}},
        headers=auth_headers(),
    )
    assert r.status_code == 200
    body = r.json()
    assert "Alice" in body["subject"]
    assert "500,000 UGX" in body["body"]
    assert "2026-04-01" in body["body"]


@pytest.mark.asyncio
async def test_preview_template_missing_variable_uses_placeholder(client: AsyncClient, ctx, db_session):
    tmpl = await make_notification_template(
        db_session, ctx["org"], body="Hello {{unknown_var}}."
    )
    await db_session.flush()

    r = await client.post(
        f"/api/v1/notification-templates/{tmpl.id}/preview",
        json={"variables": {}},
        headers=auth_headers(),
    )
    assert r.status_code == 200
    assert "[unknown_var]" in r.json()["body"]


# ── Notification list ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_notifications_empty(client: AsyncClient, ctx):
    r = await client.get("/api/v1/notifications", headers=auth_headers())
    assert r.status_code == 200
    body = r.json()
    assert body["data"] == []
    assert body["total"] == 0


@pytest.mark.asyncio
async def test_list_notifications_cross_org_isolation(client: AsyncClient, ctx, db_session):
    await make_notification(db_session, ctx["org"])
    other_org = await make_organisation(db_session, logto_org_id="org_other_notif")
    await make_notification(db_session, other_org)
    await db_session.flush()

    r = await client.get("/api/v1/notifications", headers=auth_headers())
    assert r.status_code == 200
    assert r.json()["total"] == 1


@pytest.mark.asyncio
async def test_list_notifications_filter_by_channel(client: AsyncClient, ctx, db_session):
    await make_notification(db_session, ctx["org"], channel="in_app")
    await make_notification(db_session, ctx["org"], channel="email")
    await db_session.flush()

    r = await client.get("/api/v1/notifications?channel=in_app", headers=auth_headers())
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 1
    assert data["data"][0]["channel"] == "in_app"


# ── Notification send ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_send_notification_in_app(client: AsyncClient, ctx):
    """in_app channel → queued row created; Celery task mocked."""
    with patch("app.worker.tasks.notifications.deliver_notification.delay"):
        r = await client.post(
            "/api/v1/notifications/send",
            json={
                "channel": "in_app",
                "trigger": "custom",
                "recipient_name": "Test User",
                "body": "You have a new notification.",
            },
            headers=auth_headers(),
        )
    assert r.status_code == 201
    body = r.json()
    assert body["channel"] == "in_app"
    assert body["state"] == "queued"
    assert body["recipientName"] == "Test User"


@pytest.mark.asyncio
async def test_send_notification_email(client: AsyncClient, ctx):
    with patch("app.worker.tasks.notifications.deliver_notification.delay"):
        r = await client.post(
            "/api/v1/notifications/send",
            json={
                "channel": "email",
                "trigger": "rent_due",
                "recipient_name": "Alice",
                "recipient_email": "alice@example.com",
                "subject": "Rent due",
                "body": "Your rent is due.",
            },
            headers=auth_headers(),
        )
    assert r.status_code == 201
    body = r.json()
    assert body["channel"] == "email"
    assert body["recipientEmail"] == "alice@example.com"
    assert body["state"] == "queued"


# ── Notification stats ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_stats_empty(client: AsyncClient, ctx):
    r = await client.get("/api/v1/notifications/stats", headers=auth_headers())
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 0
    assert body["deliveryRate"] == 0.0
    assert body["readRate"] == 0.0
    assert body["byChannel"] == {}


@pytest.mark.asyncio
async def test_get_stats_counts(client: AsyncClient, ctx, db_session):
    from app.models.notification import NotificationState

    await make_notification(db_session, ctx["org"], channel="in_app", state=NotificationState.delivered)
    await make_notification(db_session, ctx["org"], channel="in_app", state=NotificationState.read)
    await make_notification(db_session, ctx["org"], channel="email", state=NotificationState.failed)
    await db_session.flush()

    r = await client.get("/api/v1/notifications/stats", headers=auth_headers())
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 3
    assert body["failed"] == 1
    assert body["read"] == 1
    assert "in_app" in body["byChannel"]
    assert body["byChannel"]["in_app"] == 2


# ── Mark read ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_mark_read(client: AsyncClient, ctx, db_session):
    from app.models.notification import NotificationState

    notif = await make_notification(
        db_session, ctx["org"], state=NotificationState.delivered
    )
    await db_session.flush()

    r = await client.post(f"/api/v1/notifications/{notif.id}/read", headers=auth_headers())
    assert r.status_code == 200
    body = r.json()
    assert body["state"] == "read"
    assert body["readAt"] is not None


@pytest.mark.asyncio
async def test_mark_read_non_delivered_is_noop(client: AsyncClient, ctx, db_session):
    """Marking a queued notification as read is a no-op (state unchanged)."""
    from app.models.notification import NotificationState

    notif = await make_notification(
        db_session, ctx["org"], state=NotificationState.queued
    )
    await db_session.flush()

    r = await client.post(f"/api/v1/notifications/{notif.id}/read", headers=auth_headers())
    assert r.status_code == 200
    assert r.json()["state"] == "queued"


@pytest.mark.asyncio
async def test_mark_read_404(client: AsyncClient, ctx):
    import uuid
    r = await client.post(f"/api/v1/notifications/{uuid.uuid4()}/read", headers=auth_headers())
    assert r.status_code == 404
