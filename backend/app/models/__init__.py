<<<<<<< HEAD
# Import all models so that Base.metadata is fully populated for create_all / alembic autogenerate.
from app.models import (  # noqa: F401
    demo_booking,
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
=======
# Import all models so that Base.metadata is fully populated for create_all / alembic autogenerate.
from app.models import (  # noqa: F401
    demo_booking,
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
>>>>>>> c5b456736fe5b4d2905d6e5582a5cb3aad64eac6
