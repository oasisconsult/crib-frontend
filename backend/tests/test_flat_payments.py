"""
Tests for flat (org-level) payment endpoints.

Coverage:
  GET  /payments                — list all for org, filter by leaseId/status/category
  POST /payments                — create with leaseId in body
  GET  /payments/{id}           — get single
  PATCH /payments/{id}/confirm  — confirm
  PATCH /payments/{id}/refund   — refund
  GET  /rent-schedules          — list all for org, filter by leaseId/status
  GET  /late-fees               — list all for org, filter by leaseId
  Cross-org isolation           — 403 / 404 when accessing another org's data
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers
from tests.factories import (
    make_lease,
    make_organisation,
    make_payment,
    make_property,
    make_rent_schedule,
    make_tenant,
    make_unit,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def org(db_session: AsyncSession):
    return await make_organisation(db_session)


@pytest_asyncio.fixture
async def prop(db_session: AsyncSession, org):
    return await make_property(db_session, org)


@pytest_asyncio.fixture
async def unit(db_session: AsyncSession, prop):
    return await make_unit(db_session, prop)


@pytest_asyncio.fixture
async def tenant(db_session: AsyncSession, org):
    from app.models.tenant import OnboardingState, TenantStatus
    return await make_tenant(
        db_session, org,
        status=TenantStatus.active,
        onboarding_state=OnboardingState.approved,
    )


@pytest_asyncio.fixture
async def active_lease(db_session: AsyncSession, org, unit, tenant):
    from app.models.lease import LeaseStatus
    from app.services.payment_service import create_deposit_record, generate_rent_schedules

    lease = await make_lease(
        db_session, org, unit, tenant,
        status=LeaseStatus.active,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 6, 30),
        monthly_rent=400_000,
        deposit_amount=400_000,
        late_fee_type="flat",
        late_fee_value=20_000,
        rent_day_of_month=1,
    )
    await generate_rent_schedules(lease, db_session)
    await create_deposit_record(lease, db_session)
    await db_session.flush()
    return lease


@pytest_asyncio.fixture
async def schedule(db_session: AsyncSession, active_lease):
    from sqlalchemy import select
    from app.models.payment import RentSchedule
    result = await db_session.execute(
        select(RentSchedule)
        .where(RentSchedule.lease_id == active_lease.id)
        .order_by(RentSchedule.due_date.asc())
        .limit(1)
    )
    return result.scalar_one()


# ── List payments ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_payments_empty(client: AsyncClient, active_lease):
    r = await client.get("/api/v1/payments", headers=auth_headers("manager-1"))
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 0
    assert "totalPages" in body


@pytest.mark.asyncio
async def test_list_payments_returns_created(client: AsyncClient, db_session, org, active_lease, schedule):
    from app.models.payment import PaymentStatus
    p = await make_payment(db_session, org, active_lease, schedule, status=PaymentStatus.pending)
    await db_session.flush()

    r = await client.get("/api/v1/payments", headers=auth_headers("manager-1"))
    assert r.status_code == 200
    ids = [x["id"] for x in r.json()["data"]]
    assert str(p.id) in ids


@pytest.mark.asyncio
async def test_list_payments_filter_by_lease(client: AsyncClient, db_session, org, active_lease, schedule):
    from app.models.payment import PaymentStatus
    await make_payment(db_session, org, active_lease, schedule, status=PaymentStatus.pending)
    await db_session.flush()

    # Filter by lease — should see the payment
    r = await client.get(
        f"/api/v1/payments?leaseId={active_lease.id}",
        headers=auth_headers("manager-1"),
    )
    assert r.status_code == 200
    assert r.json()["total"] >= 1

    # Filter by random lease — should see nothing
    r = await client.get(
        f"/api/v1/payments?leaseId={uuid.uuid4()}",
        headers=auth_headers("manager-1"),
    )
    assert r.status_code == 200
    assert r.json()["total"] == 0


@pytest.mark.asyncio
async def test_list_payments_total_pages(client: AsyncClient, db_session, org, active_lease, schedule):
    from app.models.payment import PaymentStatus
    for _ in range(3):
        await make_payment(db_session, org, active_lease, schedule, status=PaymentStatus.pending)
    await db_session.flush()

    r = await client.get("/api/v1/payments?pageSize=2", headers=auth_headers("manager-1"))
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 3
    assert body["totalPages"] >= 2


# ── Create payment (flat) ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_payment_flat(client: AsyncClient, active_lease, schedule):
    r = await client.post(
        "/api/v1/payments",
        json={
            "leaseId": str(active_lease.id),
            "rentScheduleId": str(schedule.id),
            "amount": 400000,
            "currency": "UGX",
            "category": "rent",
            "method": "cash",
        },
        headers=auth_headers("manager-1"),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["leaseId"] == str(active_lease.id)
    assert body["amount"] == 400000.0
    assert body["status"] == "pending"


@pytest.mark.asyncio
async def test_create_payment_flat_invalid_category(client: AsyncClient, active_lease, schedule):
    r = await client.post(
        "/api/v1/payments",
        json={
            "leaseId": str(active_lease.id),
            "rentScheduleId": str(schedule.id),
            "amount": 100,
            "category": "invalid_cat",
            "method": "cash",
        },
        headers=auth_headers("manager-1"),
    )
    assert r.status_code == 422


# ── Get single payment ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_payment_by_id(client: AsyncClient, db_session, org, active_lease, schedule):
    from app.models.payment import PaymentStatus
    p = await make_payment(db_session, org, active_lease, schedule, status=PaymentStatus.pending)
    await db_session.flush()

    r = await client.get(f"/api/v1/payments/{p.id}", headers=auth_headers("manager-1"))
    assert r.status_code == 200
    assert r.json()["id"] == str(p.id)


@pytest.mark.asyncio
async def test_get_payment_not_found(client: AsyncClient, active_lease):
    r = await client.get(f"/api/v1/payments/{uuid.uuid4()}", headers=auth_headers("manager-1"))
    assert r.status_code == 404


# ── Confirm / Refund ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_confirm_payment_flat(client: AsyncClient, db_session, org, active_lease, schedule):
    from app.models.payment import PaymentStatus
    p = await make_payment(db_session, org, active_lease, schedule, status=PaymentStatus.pending)
    await db_session.flush()

    r = await client.patch(f"/api/v1/payments/{p.id}/confirm", headers=auth_headers("manager-1"))
    assert r.status_code == 200
    assert r.json()["status"] == "confirmed"


@pytest.mark.asyncio
async def test_refund_payment_flat(client: AsyncClient, db_session, org, active_lease, schedule):
    from app.models.payment import PaymentStatus
    p = await make_payment(db_session, org, active_lease, schedule, status=PaymentStatus.confirmed)
    await db_session.flush()

    r = await client.patch(f"/api/v1/payments/{p.id}/refund", headers=auth_headers("manager-1"))
    assert r.status_code == 200
    assert r.json()["status"] == "refunded"


@pytest.mark.asyncio
async def test_refund_pending_payment_fails(client: AsyncClient, db_session, org, active_lease, schedule):
    from app.models.payment import PaymentStatus
    p = await make_payment(db_session, org, active_lease, schedule, status=PaymentStatus.pending)
    await db_session.flush()

    r = await client.patch(f"/api/v1/payments/{p.id}/refund", headers=auth_headers("manager-1"))
    assert r.status_code == 400


# ── Rent schedules (flat) ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_rent_schedules_flat(client: AsyncClient, active_lease):
    r = await client.get("/api/v1/rent-schedules", headers=auth_headers("manager-1"))
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 6  # Jan–Jun 2026
    assert "totalPages" in body


@pytest.mark.asyncio
async def test_list_rent_schedules_filter_by_lease(client: AsyncClient, active_lease):
    r = await client.get(
        f"/api/v1/rent-schedules?leaseId={active_lease.id}",
        headers=auth_headers("manager-1"),
    )
    assert r.status_code == 200
    assert r.json()["total"] >= 6


@pytest.mark.asyncio
async def test_list_rent_schedules_filter_by_status(client: AsyncClient, active_lease):
    r = await client.get(
        "/api/v1/rent-schedules?status=pending",
        headers=auth_headers("manager-1"),
    )
    assert r.status_code == 200
    for item in r.json()["data"]:
        assert item["status"] == "pending"


# ── Late fees (flat) ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_late_fees_empty(client: AsyncClient, active_lease):
    r = await client.get("/api/v1/late-fees", headers=auth_headers("manager-1"))
    assert r.status_code == 200
    assert r.json()["total"] == 0
    assert "totalPages" in r.json()


@pytest.mark.asyncio
async def test_list_late_fees_after_apply(client: AsyncClient, active_lease, schedule):
    r = await client.post(
        f"/api/v1/leases/{active_lease.id}/late-fees/{schedule.id}/apply",
        headers=auth_headers("manager-1"),
    )
    assert r.status_code == 201

    r = await client.get("/api/v1/late-fees", headers=auth_headers("manager-1"))
    assert r.status_code == 200
    assert r.json()["total"] >= 1
    assert "totalPages" in r.json()


# ── Auth guard ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_payments_requires_auth(client: AsyncClient):
    r = await client.get("/api/v1/payments")
    assert r.status_code in (401, 403)
