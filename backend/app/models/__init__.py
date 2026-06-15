# Import all models so that Base.metadata is fully populated for create_all / alembic autogenerate.
from app.models import (  # noqa: F401
    contractor,
    demo_booking,
    efris,
    email_template,
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
from app.features.rent_increase.model import RentIncrease  # noqa: F401
from app.features.eviction_notice.model import EvictionNotice  # noqa: F401
