"""Payment processing tasks — implemented in Sprint 6."""

from app.worker.celery_app import celery_app


@celery_app.task(name="app.worker.tasks.payments.apply_late_fees", bind=True)
def apply_late_fees(self) -> dict:
    """Scheduled task: apply late fees to overdue payments. Full impl in Sprint 6."""
    return {"status": "noop"}


@celery_app.task(name="app.worker.tasks.payments.send_rent_reminders", bind=True)
def send_rent_reminders(self) -> dict:
    """Scheduled task: send rent reminder notifications. Full impl in Sprint 6."""
    return {"status": "noop"}
