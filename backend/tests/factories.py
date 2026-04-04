"""
Test data factories.

Uses plain functions (not factory-boy) to keep things lightweight.
Each factory function inserts a row into the DB and returns the ORM object.
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organisation import Organisation, Plan
from app.models.profile import Profile, Role
from app.models.property import Property, PropertyStatus, PropertyType, Unit, UnitStatus, UnitType

DEFAULT_ADDRESS = {
    "line1": "12 Kampala Road",
    "city": "Kampala",
    "state": "Central",
    "postcode": "00256",
    "country": "UG",
}

DEFAULT_RULES = {
    "gracePeriodDays": 5,
    "lateFeeType": "flat",
    "lateFeeValue": 50000,
    "depositMonths": 1,
    "noticePeriodDays": 30,
    "allowSubletting": False,
    "allowPets": False,
    "allowSmoking": False,
    "rentDayOfMonth": 1,
    "billingCurrency": "UGX",
    "maintenanceWindowHours": 24,
}


async def make_organisation(db: AsyncSession, **kwargs) -> Organisation:
    org = Organisation(
        logto_org_id=kwargs.get("logto_org_id", "org_dev"),
        name=kwargs.get("name", "Test Organisation"),
        slug=kwargs.get("slug", f"test-org-{uuid.uuid4().hex[:6]}"),
        plan=kwargs.get("plan", Plan.starter),
        currency=kwargs.get("currency", "UGX"),
        settings={},
    )
    db.add(org)
    await db.flush()
    return org


async def make_property(db: AsyncSession, org: Organisation, **kwargs) -> Property:
    prop = Property(
        organisation_id=org.id,
        name=kwargs.get("name", "Test Property"),
        type=kwargs.get("type", PropertyType.flat),
        status=kwargs.get("status", PropertyStatus.active),
        address=kwargs.get("address", DEFAULT_ADDRESS),
        rules=kwargs.get("rules", DEFAULT_RULES),
        description=kwargs.get("description", None),
        images=kwargs.get("images", []),
        tags=kwargs.get("tags", []),
        amenities=kwargs.get("amenities", []),
        currency=kwargs.get("currency", "UGX"),
    )
    db.add(prop)
    await db.flush()
    return prop


async def make_tenant(db: AsyncSession, org: Organisation, **kwargs):
    from app.models.tenant import OnboardingState, Tenant, TenantStatus
    tenant = Tenant(
        organisation_id=org.id,
        first_name=kwargs.get("first_name", "Test"),
        last_name=kwargs.get("last_name", "Tenant"),
        email=kwargs.get("email", f"tenant-{uuid.uuid4().hex[:6]}@example.com"),
        phone=kwargs.get("phone", "+256700000001"),
        status=kwargs.get("status", TenantStatus.inactive),
        onboarding_state=kwargs.get("onboarding_state", OnboardingState.invited),
        onboarding_token=kwargs.get("onboarding_token", None),
        tags=kwargs.get("tags", []),
    )
    db.add(tenant)
    await db.flush()
    return tenant


async def make_lease(db: AsyncSession, org: Organisation, unit: Unit, tenant, **kwargs):
    from datetime import date

    from app.models.lease import Lease, LeaseStatus
    lease = Lease(
        organisation_id=org.id,
        property_id=unit.property_id,
        unit_id=unit.id,
        tenant_id=tenant.id,
        status=kwargs.get("status", LeaseStatus.draft),
        start_date=kwargs.get("start_date", date(2026, 1, 1)),
        end_date=kwargs.get("end_date", date(2026, 12, 31)),
        monthly_rent=kwargs.get("monthly_rent", 500_000),
        currency=kwargs.get("currency", "UGX"),
        deposit_amount=kwargs.get("deposit_amount", None),
        deposit_paid=kwargs.get("deposit_paid", False),
        rent_day_of_month=kwargs.get("rent_day_of_month", 1),
        grace_period_days=kwargs.get("grace_period_days", 5),
        late_fee_type=kwargs.get("late_fee_type", "flat"),
        late_fee_value=kwargs.get("late_fee_value", 0),
        notice_period_days=kwargs.get("notice_period_days", 30),
        renewal_of_lease_id=kwargs.get("renewal_of_lease_id", None),
        notes=kwargs.get("notes", None),
    )
    db.add(lease)
    await db.flush()
    return lease


async def make_rent_schedule(db: AsyncSession, org: Organisation, lease, **kwargs):
    from datetime import date

    from app.models.payment import RentSchedule, RentScheduleStatus
    sched = RentSchedule(
        organisation_id=org.id,
        lease_id=lease.id,
        period_start=kwargs.get("period_start", date(2026, 1, 1)),
        period_end=kwargs.get("period_end", date(2026, 1, 31)),
        due_date=kwargs.get("due_date", date(2026, 1, 1)),
        amount_due=kwargs.get("amount_due", 500_000),
        amount_paid=kwargs.get("amount_paid", 0),
        late_fee_applied=kwargs.get("late_fee_applied", 0),
        status=kwargs.get("status", RentScheduleStatus.pending),
        paid_at=kwargs.get("paid_at", None),
        notes=kwargs.get("notes", None),
    )
    db.add(sched)
    await db.flush()
    return sched


async def make_payment(db: AsyncSession, org: Organisation, lease, schedule=None, **kwargs):
    from datetime import datetime, timezone

    from app.models.payment import Payment, PaymentStatus
    payment = Payment(
        organisation_id=org.id,
        lease_id=lease.id,
        rent_schedule_id=schedule.id if schedule else None,
        amount=kwargs.get("amount", 500_000),
        currency=kwargs.get("currency", "UGX"),
        category=kwargs.get("category", "rent"),
        method=kwargs.get("method", "cash"),
        reference=kwargs.get("reference", None),
        idempotency_key=kwargs.get("idempotency_key", None),
        status=kwargs.get("status", PaymentStatus.pending),
        paid_at=kwargs.get("paid_at", datetime.now(timezone.utc)),
        notes=kwargs.get("notes", None),
    )
    db.add(payment)
    await db.flush()
    return payment


async def make_deposit(db: AsyncSession, org: Organisation, lease, **kwargs):
    from app.models.payment import Deposit, DepositStatus
    deposit = Deposit(
        organisation_id=org.id,
        lease_id=lease.id,
        amount_held=kwargs.get("amount_held", 500_000),
        amount_returned=kwargs.get("amount_returned", 0),
        deductions=kwargs.get("deductions", []),
        status=kwargs.get("status", DepositStatus.held),
        returned_at=kwargs.get("returned_at", None),
        notes=kwargs.get("notes", None),
    )
    db.add(deposit)
    await db.flush()
    return deposit


async def make_inspection(db: AsyncSession, org: Organisation, prop: Property, **kwargs):
    from datetime import date

    from app.models.inspection import Inspection, InspectionState, InspectionType
    inspection = Inspection(
        organisation_id=org.id,
        property_id=prop.id,
        unit_id=kwargs.get("unit_id", None),
        lease_id=kwargs.get("lease_id", None),
        tenant_id=kwargs.get("tenant_id", None),
        inspector_id=kwargs.get("inspector_id", None),
        inspector_name=kwargs.get("inspector_name", "Test Inspector"),
        type=kwargs.get("type", InspectionType.routine),
        state=kwargs.get("state", InspectionState.scheduled),
        scheduled_date=kwargs.get("scheduled_date", date(2026, 4, 15)),
        scheduled_time_slot=kwargs.get("scheduled_time_slot", "09:00-11:00"),
        checklist=kwargs.get("checklist", []),
        photo_urls=kwargs.get("photo_urls", []),
        video_urls=kwargs.get("video_urls", []),
        maintenance_issue_ids=kwargs.get("maintenance_issue_ids", []),
    )
    db.add(inspection)
    await db.flush()
    return inspection


async def make_maintenance_issue(db: AsyncSession, org: Organisation, prop: Property, **kwargs):
    from datetime import datetime, timezone

    from app.models.inspection import MaintenanceIssue, MaintenanceState
    issue = MaintenanceIssue(
        organisation_id=org.id,
        property_id=prop.id,
        unit_id=kwargs.get("unit_id", None),
        lease_id=kwargs.get("lease_id", None),
        inspection_id=kwargs.get("inspection_id", None),
        reported_by=kwargs.get("reported_by", "landlord"),
        reported_by_id=kwargs.get("reported_by_id", "dev_owner1"),
        title=kwargs.get("title", "Leaking pipe"),
        description=kwargs.get("description", "Pipe under kitchen sink is leaking"),
        category=kwargs.get("category", "plumbing"),
        priority=kwargs.get("priority", "medium"),
        state=kwargs.get("state", MaintenanceState.reported),
        currency=kwargs.get("currency", "UGX"),
        reported_at=kwargs.get("reported_at", datetime.now(timezone.utc)),
        photo_urls=kwargs.get("photo_urls", []),
    )
    db.add(issue)
    await db.flush()
    return issue


async def make_notification_template(db: AsyncSession, org: Organisation, **kwargs):
    from app.models.notification import NotificationTemplate

    tmpl = NotificationTemplate(
        organisation_id=org.id,
        name=kwargs.get("name", "Test Template"),
        trigger=kwargs.get("trigger", "custom"),
        channel=kwargs.get("channel", "in_app"),
        subject=kwargs.get("subject", "Hello {{tenant_name}}"),
        body=kwargs.get("body", "Your rent of {{amount}} is due on {{due_date}}."),
        variables=kwargs.get("variables", ["tenant_name", "amount", "due_date"]),
        is_active=kwargs.get("is_active", True),
    )
    db.add(tmpl)
    await db.flush()
    return tmpl


async def make_notification(db: AsyncSession, org: Organisation, **kwargs):
    from datetime import datetime, timezone

    from app.models.notification import Notification, NotificationState

    now = datetime.now(timezone.utc)
    notif = Notification(
        organisation_id=org.id,
        template_id=kwargs.get("template_id", None),
        tenant_id=kwargs.get("tenant_id", None),
        channel=kwargs.get("channel", "in_app"),
        trigger=kwargs.get("trigger", "custom"),
        recipient_name=kwargs.get("recipient_name", "Test Recipient"),
        recipient_email=kwargs.get("recipient_email", "recipient@example.com"),
        recipient_phone=kwargs.get("recipient_phone", None),
        subject=kwargs.get("subject", "Test notification"),
        body=kwargs.get("body", "This is a test notification."),
        state=kwargs.get("state", NotificationState.queued),
        queued_at=kwargs.get("queued_at", now),
        sent_at=kwargs.get("sent_at", None),
        delivered_at=kwargs.get("delivered_at", None),
        read_at=kwargs.get("read_at", None),
        failed_at=kwargs.get("failed_at", None),
        failure_reason=kwargs.get("failure_reason", None),
        retry_count=kwargs.get("retry_count", 0),
        external_message_id=kwargs.get("external_message_id", None),
        property_id=kwargs.get("property_id", None),
        lease_id=kwargs.get("lease_id", None),
        payment_id=kwargs.get("payment_id", None),
        created_at=now,
    )
    db.add(notif)
    await db.flush()
    return notif


async def make_unit(db: AsyncSession, prop: Property, **kwargs) -> Unit:
    unit = Unit(
        property_id=prop.id,
        name=kwargs.get("name", "Unit 1A"),
        type=kwargs.get("type", UnitType.single),
        status=kwargs.get("status", UnitStatus.available),
        monthly_rent=kwargs.get("monthly_rent", 500_000),
        currency=kwargs.get("currency", "UGX"),
        bedrooms=kwargs.get("bedrooms", 1),
        bathrooms=kwargs.get("bathrooms", 1),
        amenities=kwargs.get("amenities", []),
        images=kwargs.get("images", []),
    )
    db.add(unit)
    await db.flush()
    return unit
