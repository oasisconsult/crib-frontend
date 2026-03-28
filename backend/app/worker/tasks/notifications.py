"""Notification delivery tasks — implemented in Sprint 8."""

from app.worker.celery_app import celery_app


@celery_app.task(name="app.worker.tasks.notifications.deliver_notification", bind=True)
def deliver_notification(self, notification_id: str) -> dict:
    """Placeholder — full implementation in Sprint 8."""
    return {"status": "queued", "notification_id": notification_id}
