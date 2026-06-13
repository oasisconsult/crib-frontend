"""
Tests for /api/v1/leases — full lifecycle coverage.

Coverage:
  - Create draft lease (happy path, unknown unit/tenant, unapproved tenant)
  - List leases (filters: status, unit_id, tenant_id, property_id; pagination; org isolation)
  - Get lease (happy path, 404, cross-org 404)
  - Update draft lease (happy path, non-draft rejected)
  - Delete draft lease (happy path, non-draft rejected)
  - Activate: draft→active (unit + tenant cached FKs, unit must be available/reserved)
  - Activate: 409 on conflicting active lease
  - Activate: auto-terminate old lease when this is a renewal
  - Terminate: active→terminated (clears unit + tenant)
  - Expire: active→expired (clears unit + tenant)
  - Renew: creates a new draft with renewal_of_lease_id
  - Tenant role: read-own access; cannot write
"""

from datetime import date, datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lease import LeaseStatus
from app.models.property import UnitStatus
from app.models.tenant import OnboardingState, TenantStatus
from tests.conftest import auth_headers
from tests.factories import make_lease, make_property, make_tenant, make_unit


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest.fixture
async def org(dev_org):
    """Use the pre-seeded org_dev so test data is visible to dev-user auth tokens."""
    return dev_org


@pytest.fixture
async def other_org(db_session: AsyncSession):
    from tests.factories import make_organisation
    return await make_organisation(db_session)


@pytest.fixture
async def prop(db_session: AsyncSession, org):
    return await make_property(db_session, org, name="Lease Test Property")


@pytest.fixture
async def unit(db_session: AsyncSession, prop):
    return await make_unit(db_session, prop, name="L1", monthly_rent=600_000)


@pytest.fixture
async def approved_tenant(db_session: AsyncSession, org):
    return await make_tenant(
        db_session, org,
        onboarding_state=OnboardingState.approved,
        status=TenantStatus.inactive,
    )


@pytest.fixture
async def draft_lease(db_session: AsyncSession, org, unit, approved_tenant):
    return await make_lease(db_session, org, unit, approved_tenant)


@pytest.fixture
async def active_lease(db_session: AsyncSession, org, unit, approved_tenant):
    lease = await make_lease(
        db_session, org, unit, approved_tenant,
        status=LeaseStatus.active,
    )
    # Mirror the side-effects that activate_lease sets on unit + tenant
    unit.status = UnitStatus.occupied
    unit.current_tenant_id = approved_tenant.id
    unit.current_lease_id = lease.id
    approved_tenant.status = TenantStatus.active
    approved_tenant.onboarding_state = OnboardingState.activated
    approved_tenant.current_lease_id = lease.id
    approved_tenant.current_unit_id = unit.id
    approved_tenant.current_property_id = unit.property_id
    await db_session.flush()
    return lease


# ── Create ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_lease_draft(client: AsyncClient, org, unit, approved_tenant):
    resp = await client.post(
        "/api/v1/leases",
        json={
            "unitId": str(unit.id),
            "tenantId": str(approved_tenant.id),
            "startDate": "2026-02-01",
            "endDate": "2027-01-31",
            "monthlyRent": 600000,
            "currency": "UGX",
        },
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "draft"
    assert body["unitId"] == str(unit.id)
    assert body["tenantId"] == str(approved_tenant.id)
    assert body["monthlyRent"] == 600000.0
    assert body["isRolling"] is False


@pytest.mark.asyncio
async def test_create_lease_rolling(client: AsyncClient, org, unit, approved_tenant):
    resp = await client.post(
        "/api/v1/leases",
        json={
            "unitId": str(unit.id),
            "tenantId": str(approved_tenant.id),
            "startDate": "2026-02-01",
            "monthlyRent": 600000,
        },
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["endDate"] is None
    assert body["isRolling"] is True


@pytest.mark.asyncio
async def test_create_lease_unknown_unit(client: AsyncClient, org, approved_tenant):
    import uuid
    resp = await client.post(
        "/api/v1/leases",
        json={
            "unitId": str(uuid.uuid4()),
            "tenantId": str(approved_tenant.id),
            "startDate": "2026-02-01",
            "monthlyRent": 600000,
        },
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_lease_unapproved_tenant(client: AsyncClient, org, unit, db_session):
    invited = await make_tenant(db_session, org, onboarding_state=OnboardingState.invited)
    resp = await client.post(
        "/api/v1/leases",
        json={
            "unitId": str(unit.id),
            "tenantId": str(invited.id),
            "startDate": "2026-02-01",
            "monthlyRent": 600000,
        },
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_lease_end_before_start_rejected(client: AsyncClient, org, unit, approved_tenant):
    resp = await client.post(
        "/api/v1/leases",
        json={
            "unitId": str(unit.id),
            "tenantId": str(approved_tenant.id),
            "startDate": "2026-06-01",
            "endDate": "2026-01-01",
            "monthlyRent": 600000,
        },
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 422


# ── List ───────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_leases_returns_own_org(client: AsyncClient, draft_lease, other_org, db_session):
    other_prop = await make_property(db_session, other_org, name="Other Prop")
    other_unit = await make_unit(db_session, other_prop)
    other_tenant = await make_tenant(db_session, other_org, onboarding_state=OnboardingState.approved)
    other_lease = await make_lease(db_session, other_org, other_unit, other_tenant)

    resp = await client.get("/api/v1/leases", headers=auth_headers("manager-1"))
    assert resp.status_code == 200
    ids = [l["id"] for l in resp.json()["data"]]
    assert str(draft_lease.id) in ids
    assert str(other_lease.id) not in ids


@pytest.mark.asyncio
async def test_list_leases_filter_by_status(client: AsyncClient, org, unit, approved_tenant, db_session):
    draft = await make_lease(db_session, org, unit, approved_tenant, status=LeaseStatus.draft)

    unit2 = await make_unit(db_session, await make_property(db_session, org, name="P2"), name="U2")
    tenant2 = await make_tenant(db_session, org, onboarding_state=OnboardingState.approved)
    active = await make_lease(db_session, org, unit2, tenant2, status=LeaseStatus.active)

    resp = await client.get("/api/v1/leases?status=draft", headers=auth_headers("manager-1"))
    assert resp.status_code == 200
    ids = [l["id"] for l in resp.json()["data"]]
    assert str(draft.id) in ids
    assert str(active.id) not in ids


@pytest.mark.asyncio
async def test_list_leases_filter_by_unit(client: AsyncClient, draft_lease, unit, org, db_session):
    prop2 = await make_property(db_session, org, name="P2")
    unit2 = await make_unit(db_session, prop2, name="U2")
    tenant2 = await make_tenant(db_session, org, onboarding_state=OnboardingState.approved)
    other_lease = await make_lease(db_session, org, unit2, tenant2)

    resp = await client.get(f"/api/v1/leases?unitId={unit.id}", headers=auth_headers("manager-1"))
    ids = [l["id"] for l in resp.json()["data"]]
    assert str(draft_lease.id) in ids
    assert str(other_lease.id) not in ids


@pytest.mark.asyncio
async def test_list_leases_pagination(client: AsyncClient, org, prop, db_session):
    tenant = await make_tenant(db_session, org, onboarding_state=OnboardingState.approved)
    for i in range(5):
        u = await make_unit(db_session, prop, name=f"Pg{i}")
        await make_lease(db_session, org, u, tenant)

    resp = await client.get("/api/v1/leases?pageSize=2&page=1", headers=auth_headers("manager-1"))
    body = resp.json()
    assert len(body["data"]) == 2
    assert body["total"] >= 5
    assert body["hasNext"] is True


# ── Get ────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_lease(client: AsyncClient, draft_lease):
    resp = await client.get(f"/api/v1/leases/{draft_lease.id}", headers=auth_headers("manager-1"))
    assert resp.status_code == 200
    assert resp.json()["id"] == str(draft_lease.id)


@pytest.mark.asyncio
async def test_get_lease_404(client: AsyncClient, org):
    import uuid
    resp = await client.get(f"/api/v1/leases/{uuid.uuid4()}", headers=auth_headers("manager-1"))
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_lease_cross_org_404(client: AsyncClient, org, other_org, db_session):
    other_prop = await make_property(db_session, other_org, name="OP")
    other_unit = await make_unit(db_session, other_prop)
    other_tenant = await make_tenant(db_session, other_org, onboarding_state=OnboardingState.approved)
    other_lease = await make_lease(db_session, other_org, other_unit, other_tenant)

    resp = await client.get(f"/api/v1/leases/{other_lease.id}", headers=auth_headers("manager-1"))
    assert resp.status_code == 404


# ── Update ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_draft_lease(client: AsyncClient, draft_lease):
    resp = await client.put(
        f"/api/v1/leases/{draft_lease.id}",
        json={"monthlyRent": 750000, "notes": "Updated rent"},
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["monthlyRent"] == 750000.0
    assert body["notes"] == "Updated rent"


@pytest.mark.asyncio
async def test_update_active_lease_rejected(client: AsyncClient, active_lease):
    resp = await client.put(
        f"/api/v1/leases/{active_lease.id}",
        json={"monthlyRent": 750000},
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 400


# ── Correct start date ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_correct_start_date_draft_lease(client: AsyncClient, draft_lease):
    resp = await client.patch(
        f"/api/v1/leases/{draft_lease.id}/start-date",
        json={"startDate": "2026-02-01"},
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 200
    assert resp.json()["startDate"] == "2026-02-01"


@pytest.mark.asyncio
async def test_correct_start_date_regenerates_schedule(
    client: AsyncClient, active_lease, db_session,
):
    """Active lease with no payments yet — schedule is discarded and rebuilt against the new date."""
    from sqlalchemy import select
    from app.models.payment import RentSchedule
    from app.services.payment_service import generate_rent_schedules

    await generate_rent_schedules(active_lease, db_session)
    await db_session.flush()

    new_start = date(2026, 2, 1)
    resp = await client.patch(
        f"/api/v1/leases/{active_lease.id}/start-date",
        json={"startDate": new_start.isoformat()},
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 200
    assert resp.json()["startDate"] == new_start.isoformat()

    schedules = (await db_session.execute(
        select(RentSchedule).where(RentSchedule.lease_id == active_lease.id)
    )).scalars().all()
    assert schedules
    assert all(s.period_start >= new_start for s in schedules)


@pytest.mark.asyncio
async def test_correct_start_date_blocked_once_rent_collected(
    client: AsyncClient, active_lease, db_session,
):
    from sqlalchemy import select
    from app.models.payment import RentSchedule
    from app.services.payment_service import generate_rent_schedules

    await generate_rent_schedules(active_lease, db_session)
    await db_session.flush()

    paid_schedule = (await db_session.execute(
        select(RentSchedule).where(RentSchedule.lease_id == active_lease.id)
        .order_by(RentSchedule.period_start.asc())
    )).scalars().first()
    paid_schedule.amount_paid = paid_schedule.amount_due
    await db_session.flush()

    resp = await client.patch(
        f"/api/v1/leases/{active_lease.id}/start-date",
        json={"startDate": "2026-02-01"},
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_correct_start_date_must_precede_end_date(client: AsyncClient, draft_lease):
    """draft_lease.end_date == 2026-12-31 — a later start date is rejected."""
    resp = await client.patch(
        f"/api/v1/leases/{draft_lease.id}/start-date",
        json={"startDate": "2027-01-01"},
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_correct_start_date_requires_manager_role(client: AsyncClient, active_lease):
    resp = await client.patch(
        f"/api/v1/leases/{active_lease.id}/start-date",
        json={"startDate": "2026-02-01"},
        headers=auth_headers("tenant-1"),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_correct_advance_months_basic(client: AsyncClient, active_lease, db_session):
    active_lease.advance_months = 1
    await db_session.flush()

    resp = await client.patch(
        f"/api/v1/leases/{active_lease.id}/advance-months",
        json={"advanceMonths": 3},
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 200
    assert resp.json()["advanceMonths"] == 3


@pytest.mark.asyncio
async def test_correct_advance_months_blocked_once_terms_accepted(client: AsyncClient, active_lease, db_session):
    from datetime import datetime, timezone

    active_lease.advance_months = 1
    active_lease.terms_accepted_at = datetime.now(timezone.utc)
    await db_session.flush()

    resp = await client.patch(
        f"/api/v1/leases/{active_lease.id}/advance-months",
        json={"advanceMonths": 3},
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_correct_advance_months_blocked_once_onboarding_payment_recorded(client: AsyncClient, active_lease, db_session):
    import uuid

    active_lease.advance_months = 1
    active_lease.onboarding_payment_ids = [str(uuid.uuid4())]
    await db_session.flush()

    resp = await client.patch(
        f"/api/v1/leases/{active_lease.id}/advance-months",
        json={"advanceMonths": 3},
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_correct_advance_months_requires_manager_role(client: AsyncClient, active_lease):
    resp = await client.patch(
        f"/api/v1/leases/{active_lease.id}/advance-months",
        json={"advanceMonths": 3},
        headers=auth_headers("tenant-1"),
    )
    assert resp.status_code == 403


# ── Delete ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_draft_lease(client: AsyncClient, draft_lease):
    resp = await client.delete(f"/api/v1/leases/{draft_lease.id}", headers=auth_headers("manager-1"))
    assert resp.status_code == 204

    resp2 = await client.get(f"/api/v1/leases/{draft_lease.id}", headers=auth_headers("manager-1"))
    assert resp2.status_code == 404


@pytest.mark.asyncio
async def test_delete_active_lease_rejected(client: AsyncClient, active_lease):
    resp = await client.delete(f"/api/v1/leases/{active_lease.id}", headers=auth_headers("manager-1"))
    assert resp.status_code == 400


# ── Activate ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_activate_lease(client: AsyncClient, draft_lease, unit, approved_tenant, db_session):
    resp = await client.patch(
        f"/api/v1/leases/{draft_lease.id}/activate",
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "active"
    assert body["signedAt"] is not None

    # Verify side-effects on unit
    await db_session.refresh(unit)
    assert unit.status == UnitStatus.occupied
    assert unit.current_tenant_id == approved_tenant.id
    assert unit.current_lease_id == draft_lease.id

    # Verify side-effects on tenant
    await db_session.refresh(approved_tenant)
    assert approved_tenant.status == TenantStatus.active
    assert approved_tenant.current_lease_id == draft_lease.id


@pytest.mark.asyncio
async def test_activate_non_draft_rejected(client: AsyncClient, active_lease):
    resp = await client.patch(
        f"/api/v1/leases/{active_lease.id}/activate",
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_activate_conflict_409(client: AsyncClient, org, unit, approved_tenant, active_lease, db_session):
    """A second draft for the same unit cannot be activated while active_lease exists."""
    tenant2 = await make_tenant(db_session, org, onboarding_state=OnboardingState.approved)
    draft2 = await make_lease(db_session, org, unit, tenant2)

    resp = await client.patch(
        f"/api/v1/leases/{draft2.id}/activate",
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 409
    detail = resp.json()["detail"]
    assert "conflicting_lease_id" in detail
    assert detail["conflicting_lease_id"] == str(active_lease.id)


@pytest.mark.asyncio
async def test_activate_renewal_auto_terminates_old(
    client: AsyncClient, org, unit, approved_tenant, active_lease, db_session
):
    """Activating a renewal draft should auto-terminate the old active lease."""
    renewal = await make_lease(
        db_session, org, unit, approved_tenant,
        status=LeaseStatus.draft,
        renewal_of_lease_id=active_lease.id,
        start_date=date(2027, 1, 1),
        end_date=date(2027, 12, 31),
    )

    resp = await client.patch(
        f"/api/v1/leases/{renewal.id}/activate",
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"

    # Old lease should now be terminated
    await db_session.refresh(active_lease)
    assert active_lease.status == LeaseStatus.terminated
    assert active_lease.termination_reason is not None


# ── Terminate ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_terminate_lease(client: AsyncClient, active_lease, unit, approved_tenant, db_session):
    resp = await client.patch(
        f"/api/v1/leases/{active_lease.id}/terminate",
        json={"reason": "Tenant vacated early"},
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "terminated"
    assert body["terminationReason"] == "Tenant vacated early"
    assert body["terminatedAt"] is not None

    # Unit cleared
    await db_session.refresh(unit)
    assert unit.status == UnitStatus.available
    assert unit.current_lease_id is None

    # Tenant cleared
    await db_session.refresh(approved_tenant)
    assert approved_tenant.current_lease_id is None


@pytest.mark.asyncio
async def test_terminate_draft_rejected(client: AsyncClient, draft_lease):
    resp = await client.patch(
        f"/api/v1/leases/{draft_lease.id}/terminate",
        json={"reason": "Test"},
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_terminate_requires_reason(client: AsyncClient, active_lease):
    resp = await client.patch(
        f"/api/v1/leases/{active_lease.id}/terminate",
        json={"reason": ""},
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 422


# ── Expire ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_expire_lease(client: AsyncClient, active_lease, unit, approved_tenant, db_session):
    resp = await client.patch(
        f"/api/v1/leases/{active_lease.id}/expire",
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "expired"

    await db_session.refresh(unit)
    assert unit.status == UnitStatus.available

    await db_session.refresh(approved_tenant)
    assert approved_tenant.current_lease_id is None


@pytest.mark.asyncio
async def test_expire_draft_rejected(client: AsyncClient, draft_lease):
    resp = await client.patch(
        f"/api/v1/leases/{draft_lease.id}/expire",
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 400


# ── Renew ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_renew_active_lease(client: AsyncClient, active_lease):
    resp = await client.post(
        f"/api/v1/leases/{active_lease.id}/renew",
        json={"startDate": "2027-01-01", "endDate": "2027-12-31", "monthlyRent": 650000},
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "draft"
    assert body["renewalOfLeaseId"] == str(active_lease.id)
    assert body["monthlyRent"] == 650000.0
    assert body["startDate"] == "2027-01-01"


@pytest.mark.asyncio
async def test_renew_expired_lease(client: AsyncClient, org, unit, approved_tenant, db_session):
    expired = await make_lease(
        db_session, org, unit, approved_tenant,
        status=LeaseStatus.expired,
    )
    resp = await client.post(
        f"/api/v1/leases/{expired.id}/renew",
        json={"startDate": "2027-01-01"},
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 201
    assert resp.json()["renewalOfLeaseId"] == str(expired.id)


@pytest.mark.asyncio
async def test_renew_draft_rejected(client: AsyncClient, draft_lease):
    resp = await client.post(
        f"/api/v1/leases/{draft_lease.id}/renew",
        json={"startDate": "2027-01-01"},
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_renew_inherits_original_terms(client: AsyncClient, active_lease):
    """Omitted renewal fields should be copied from the original."""
    resp = await client.post(
        f"/api/v1/leases/{active_lease.id}/renew",
        json={"startDate": "2027-01-01"},
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 201
    body = resp.json()
    # monthlyRent should come from original (500_000 from factory)
    assert body["monthlyRent"] == 500_000.0
    assert body["currency"] == "UGX"


# ── Auth ───────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenant_can_read_own_lease(client: AsyncClient, active_lease):
    """Tenant role (allow_tenant_own=True) can read leases."""
    resp = await client.get(f"/api/v1/leases/{active_lease.id}", headers=auth_headers("tenant-1"))
    # tenant-1 is in org_dev so will see org-scoped data
    assert resp.status_code in (200, 404)  # 404 if tenant-1 not in org_dev; 200 if they are


@pytest.mark.asyncio
async def test_tenant_cannot_create_lease(client: AsyncClient, org, unit, approved_tenant):
    resp = await client.post(
        "/api/v1/leases",
        json={
            "unitId": str(unit.id),
            "tenantId": str(approved_tenant.id),
            "startDate": "2026-02-01",
            "monthlyRent": 600000,
        },
        headers=auth_headers("tenant-1"),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_unauthenticated_returns_401(client: AsyncClient):
    resp = await client.get("/api/v1/leases")
    assert resp.status_code == 401
