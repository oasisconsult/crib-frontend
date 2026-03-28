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

    # Beat schedule will be added here in Sprint 6
    beat_schedule={},
)
