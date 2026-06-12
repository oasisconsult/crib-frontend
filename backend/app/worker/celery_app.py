"""
Celery application factory.

Queues:
  default       — general async tasks
  notifications — email / SMS / WhatsApp delivery
  payments      — rent reminders, late fee application, ledger reconciliation

Tasks are defined in their respective domain modules and auto-discovered.
"""

from celery import Celery
from celery.schedules import crontab

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "crib",
    broker=settings.effective_celery_broker,
    backend=settings.effective_celery_backend,
    include=[
        "app.worker.tasks.notifications",
        "app.worker.tasks.payments",
        "app.worker.tasks.subscriptions",
        "app.worker.tasks.mobile_money",
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
        # ── Subscription lifecycle ────────────────────────────────────────────
        # All times UTC; Uganda EAT = UTC+3
        "check-subscription-expiry-daily": {
            "task": "app.worker.tasks.subscriptions.check_subscription_expiry",
            "schedule": crontab(hour="0", minute="5"),   # 03:05 EAT
        },
        "check-grace-period-expiry-daily": {
            "task": "app.worker.tasks.subscriptions.check_grace_period_expiry",
            "schedule": crontab(hour="0", minute="10"),  # 03:10 EAT
        },
        "send-renewal-reminders-daily": {
            "task": "app.worker.tasks.subscriptions.send_renewal_reminders",
            "schedule": crontab(hour="6", minute="0"),   # 09:00 EAT
        },
        # ── Rent payment lifecycle ────────────────────────────────────────────
        # Order matters: extend → mark overdue → apply fees → reminders
        "extend-rolling-schedules-daily": {
            "task": "app.worker.tasks.payments.extend_rolling_schedules",
            "schedule": crontab(hour="0", minute="0"),   # 03:00 EAT
        },
        "mark-overdue-schedules-daily": {
            "task": "app.worker.tasks.payments.mark_overdue_schedules",
            "schedule": crontab(hour="0", minute="15"),  # 03:15 EAT — after extend
        },
        "apply-late-fees-daily": {
            "task": "app.worker.tasks.payments.apply_late_fees_task",
            "schedule": crontab(hour="0", minute="20"),  # 03:20 EAT — after mark overdue
        },
        "send-rent-reminders-daily": {
            "task": "app.worker.tasks.payments.send_rent_reminders",
            "schedule": crontab(hour="6", minute="0"),   # 09:00 EAT — morning send
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
        # ── Mobile money reconciliation ───────────────────────────────────────
        # Runs after the nightly polling window — flags any 'received' txns
        # that are still unmatched after 24 h so admins can investigate.
        "reconcile-unmatched-mobile-money-daily": {
            "task": "app.worker.tasks.mobile_money.reconcile_unmatched_transactions",
            "schedule": crontab(hour="1", minute="0"),   # 04:00 EAT
        },
    },
)
