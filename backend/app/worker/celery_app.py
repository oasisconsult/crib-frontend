"""
Celery application factory.

Queues:
  default       — general async tasks
  notifications — email / SMS / WhatsApp delivery
  payments      — rent reminders, late fee application, ledger reconciliation

Tasks are defined in their respective domain modules and auto-discovered.
"""

from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "crib",
    broker=settings.effective_celery_broker,
    backend=settings.effective_celery_backend,
    include=[
        "app.worker.tasks.notifications",
        "app.worker.tasks.payments",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,

    # Queue routing
    task_routes={
        "app.worker.tasks.notifications.*": {"queue": "notifications"},
        "app.worker.tasks.payments.*": {"queue": "payments"},
    },

    # Retry defaults
    task_default_retry_delay=60,
    task_max_retries=3,

    beat_schedule={
        "mark-overdue-schedules-daily": {
            "task": "app.worker.tasks.payments.mark_overdue_schedules",
            "schedule": 86400,  # every 24 hours
        },
        "apply-late-fees-daily": {
            "task": "app.worker.tasks.payments.apply_late_fees_task",
            "schedule": 86400,
        },
        "send-rent-reminders-daily": {
            "task": "app.worker.tasks.payments.send_rent_reminders",
            "schedule": 86400,
        },
        # Mobile money polling — fallback for missed webhooks
        "poll-mtn-transactions-every-5min": {
            "task": "app.worker.tasks.payments.poll_mtn_transactions",
            "schedule": 300,  # every 5 minutes
        },
        "poll-airtel-transactions-every-5min": {
            "task": "app.worker.tasks.payments.poll_airtel_transactions",
            "schedule": 300,
        },
    },
)
