# Import all models so that Base.metadata is fully populated for create_all / alembic autogenerate.
from app.models import (  # noqa: F401
    demo_booking,
    inspection,
    lease,
    ledger,
    message,
    mobile_money,
    notification,
    organisation,
    payment,
    payment_allocation,
    profile,
    property,
    rbac,
    subscription,
    system_setting,
    tenancy_agreement,
    tenant,
    wallet,
)
from app.models.caretaker_invite import CaretakerInvite  # noqa: F401
from app.models.gdpr import GdprRequest  # noqa: F401
