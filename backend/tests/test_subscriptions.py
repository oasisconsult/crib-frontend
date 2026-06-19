"""
Tests for the Subscription & Billing system.

Coverage:
  - GET  /api/v1/subscriptions/plans
  - GET  /api/v1/subscriptions/current       (auto-creates Free subscription)
  - POST /api/v1/subscriptions/select-plan   (free → active, paid → pending)
  - POST /api/v1/subscriptions/cancel
  - GET  /api/v1/subscriptions/usage
  - GET  /api/v1/subscriptions/audit-log
  - POST /api/v1/billing/payments/submit
  - GET  /api/v1/billing/payments/history
  - GET  /api/v1/billing/settings
  - GET  /api/v1/invoices
  - POST /api/v1/admin/billing/payments/{id}/verify
  - POST /api/v1/admin/billing/payments/{id}/reject
  - GET  /api/v1/admin/billing/settings
  - PATCH /api/v1/admin/billing/settings
  - GET  /api/v1/admin/billing/plans
  - PATCH /api/v1/admin/billing/plans/{id}
  - POST /api/v1/admin/billing/subscriptions/{id}/extend
  - subscription_limits feature gating (402 enforcement)
  - RBAC: non-superadmin blocked from admin billing endpoints
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.subscription import (
    OrganisationSubscription, SubscriptionPayment, SubscriptionPlan,
    SubscriptionPaymentStatus, SubscriptionStatus,
)
from tests.conftest import auth_headers

PREFIX = "/api/v1"


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_plan_id(slug: str, db: AsyncSession) -> str:
    result = await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.slug == slug))
    plan = result.scalar_one_or_none()
    assert plan is not None, f"Plan '{slug}' not seeded — check conftest."
    return str(plan.id)


async def _get_subscription(org_id: str, db: AsyncSession) -> OrganisationSubscription | None:
    result = await db.execute(
        select(OrganisationSubscription).where(
            OrganisationSubscription.organisation_id == uuid.UUID(org_id)
        )
    )
    return result.scalar_one_or_none()


# ── Plan catalogue ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_plans_returns_four(client: AsyncClient):
    """GET /subscriptions/plans should return all four public plans."""
    resp = await client.get(f"{PREFIX}/subscriptions/plans", headers=auth_headers("manager-1"))
    assert resp.status_code == 200
    plans = resp.json()
    assert len(plans) == 4
    slugs = [p["slug"] for p in plans]
    assert "free" in slugs
    assert "professional" in slugs
    assert "agency" in slugs
    assert "enterprise" in slugs


@pytest.mark.asyncio
async def test_plans_ordered_by_display_order(client: AsyncClient):
    """Plans must be returned in ascending display order."""
    resp = await client.get(f"{PREFIX}/subscriptions/plans", headers=auth_headers("manager-1"))
    orders = [p["displayOrder"] for p in resp.json()]
    assert orders == sorted(orders)


@pytest.mark.asyncio
async def test_free_plan_has_zero_price(client: AsyncClient):
    """Free plan must have zero prices."""
    resp = await client.get(f"{PREFIX}/subscriptions/plans", headers=auth_headers("manager-1"))
    free = next(p for p in resp.json() if p["slug"] == "free")
    assert free["monthlyPriceUgx"] == 0
    assert free["annualPriceUgx"] == 0


@pytest.mark.asyncio
async def test_professional_plan_price(client: AsyncClient):
    """Professional plan should have 159,000 UGX monthly (pricing v2 / migration 065)."""
    resp = await client.get(f"{PREFIX}/subscriptions/plans", headers=auth_headers("manager-1"))
    pro = next(p for p in resp.json() if p["slug"] == "professional")
    assert pro["monthlyPriceUgx"] == 159_000
    assert pro["annualPriceUgx"] == 1_526_400


# ── Current subscription ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_current_subscription_auto_creates_free(
    client: AsyncClient, db_session: AsyncSession
):
    """
    Calling GET /subscriptions/current with an owner that has no subscription
    should auto-create a Free subscription.
    """
    resp = await client.get(
        f"{PREFIX}/subscriptions/current", headers=auth_headers("owner-1")
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["plan"]["slug"] == "free"
    assert body["status"] == "active"
    assert body["billingCycle"] == "none"


@pytest.mark.asyncio
async def test_current_subscription_idempotent(client: AsyncClient):
    """Calling current twice should not create two subscriptions."""
    h = auth_headers("manager-1")
    r1 = await client.get(f"{PREFIX}/subscriptions/current", headers=h)
    r2 = await client.get(f"{PREFIX}/subscriptions/current", headers=h)
    assert r1.json()["id"] == r2.json()["id"]


# ── Plan selection ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_select_free_plan_activates_immediately(
    client: AsyncClient, db_session: AsyncSession
):
    """Selecting the Free plan should immediately set status=active."""
    free_id = await _get_plan_id("free", db_session)
    resp = await client.post(
        f"{PREFIX}/subscriptions/select-plan",
        headers=auth_headers("owner-1"),
        json={"planId": free_id, "billingCycle": "none", "currency": "UGX"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "active"
    assert body["plan"]["slug"] == "free"


@pytest.mark.asyncio
async def test_select_paid_plan_moves_to_pending_payment(
    client: AsyncClient, db_session: AsyncSession
):
    """Selecting a paid plan should move the subscription to pending_payment."""
    pro_id = await _get_plan_id("professional", db_session)
    resp = await client.post(
        f"{PREFIX}/subscriptions/select-plan",
        headers=auth_headers("owner-1"),
        json={"planId": pro_id, "billingCycle": "monthly", "currency": "UGX"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "pending_payment"
    assert body["plan"]["slug"] == "professional"
    assert body["billingCycle"] == "monthly"
    assert body["pricePaid"] == 159_000


@pytest.mark.asyncio
async def test_select_plan_requires_owner_or_manager(client: AsyncClient, db_session: AsyncSession):
    """Tenants must not be able to change the subscription plan."""
    free_id = await _get_plan_id("free", db_session)
    resp = await client.post(
        f"{PREFIX}/subscriptions/select-plan",
        headers=auth_headers("tenant-1"),
        json={"planId": free_id, "billingCycle": "none", "currency": "UGX"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_select_nonexistent_plan_returns_404(client: AsyncClient):
    resp = await client.post(
        f"{PREFIX}/subscriptions/select-plan",
        headers=auth_headers("owner-1"),
        json={"planId": str(uuid.uuid4()), "billingCycle": "monthly", "currency": "UGX"},
    )
    assert resp.status_code == 404


# ── Usage endpoint ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_usage_returns_correct_shape(client: AsyncClient):
    """GET /subscriptions/usage must return all six usage fields."""
    resp = await client.get(f"{PREFIX}/subscriptions/usage", headers=auth_headers("manager-1"))
    assert resp.status_code == 200
    body = resp.json()
    for field in [
        "propertiesUsed", "propertiesLimit", "propertiesPercent",
        "unitsUsed", "unitsLimit", "unitsPercent",
        "usersUsed", "usersLimit", "usersPercent",
        "storageUsedMb", "storageLimitMb", "storagePercent",
    ]:
        assert field in body, f"Missing field: {field}"


@pytest.mark.asyncio
async def test_usage_free_plan_limits(client: AsyncClient):
    """Free plan limits (pricing v2): 2 properties, 15 units, 1 user."""
    # Ensure a free subscription exists
    await client.get(f"{PREFIX}/subscriptions/current", headers=auth_headers("owner-1"))
    resp = await client.get(f"{PREFIX}/subscriptions/usage", headers=auth_headers("owner-1"))
    body = resp.json()
    assert body["propertiesLimit"] == 2
    assert body["unitsLimit"] == 15
    assert body["usersLimit"] == 1


# ── Cancel ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cancel_subscription(client: AsyncClient, db_session: AsyncSession):
    """POST /subscriptions/cancel should set status=cancelled."""
    # First ensure subscription exists
    await client.get(f"{PREFIX}/subscriptions/current", headers=auth_headers("owner-1"))
    resp = await client.post(
        f"{PREFIX}/subscriptions/cancel",
        headers=auth_headers("owner-1"),
        json={"reason": "No longer needed"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "cancelled"
    assert body["cancelledAt"] is not None


# ── Audit log ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_audit_log_records_created_event(client: AsyncClient):
    """After auto-creating a subscription, the audit log must have a 'created' entry."""
    await client.get(f"{PREFIX}/subscriptions/current", headers=auth_headers("manager-1"))
    resp = await client.get(f"{PREFIX}/subscriptions/audit-log", headers=auth_headers("manager-1"))
    assert resp.status_code == 200
    events = [e["eventType"] for e in resp.json()]
    assert "created" in events


# ── Payment submission ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_submit_payment_creates_record(client: AsyncClient, db_session: AsyncSession):
    """POST /billing/payments/submit should create a SubscriptionPayment."""
    pro_id = await _get_plan_id("professional", db_session)
    resp = await client.post(
        f"{PREFIX}/billing/payments/submit",
        headers=auth_headers("owner-1"),
        json={
            "planId": pro_id,
            "billingCycle": "monthly",
            "currency": "UGX",
            "paymentMethod": "mtn_momo",
            "amount": 200000,
            "phoneNumber": "+256700123456",
            "accountName": "Test Owner",
            "transactionReference": "MTN123456789",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["paymentMethod"] == "mtn_momo"
    assert body["amount"] == 200_000
    assert body["status"] == "pending_verification"
    assert body["transactionReference"] == "MTN123456789"


@pytest.mark.asyncio
async def test_submit_payment_moves_sub_to_pending_verification(
    client: AsyncClient, db_session: AsyncSession
):
    """After submitting payment, the subscription status must be pending_verification."""
    pro_id = await _get_plan_id("professional", db_session)
    await client.post(
        f"{PREFIX}/billing/payments/submit",
        headers=auth_headers("owner-1"),
        json={
            "planId": pro_id,
            "billingCycle": "monthly",
            "currency": "UGX",
            "paymentMethod": "bank_transfer",
            "amount": 200000,
            "transactionReference": "BANK-REF-001",
            "bankName": "Stanbic Bank Uganda",
            "transferDate": "2026-05-18",
        },
    )
    sub_resp = await client.get(f"{PREFIX}/subscriptions/current", headers=auth_headers("owner-1"))
    assert sub_resp.json()["status"] == "pending_verification"


@pytest.mark.asyncio
async def test_payment_history_returns_submitted_payment(
    client: AsyncClient, db_session: AsyncSession
):
    """Submitted payments must appear in the billing history."""
    pro_id = await _get_plan_id("professional", db_session)
    await client.post(
        f"{PREFIX}/billing/payments/submit",
        headers=auth_headers("owner-1"),
        json={
            "planId": pro_id, "billingCycle": "monthly", "currency": "UGX",
            "paymentMethod": "cash", "amount": 200000, "transactionReference": "CASH-001",
        },
    )
    hist = await client.get(f"{PREFIX}/billing/payments/history", headers=auth_headers("owner-1"))
    assert hist.status_code == 200
    assert hist.json()["total"] >= 1


# ── Billing settings ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_billing_settings_returns_bank_details(client: AsyncClient):
    """GET /billing/settings must return bank details for the payment form."""
    resp = await client.get(f"{PREFIX}/billing/settings", headers=auth_headers("manager-1"))
    assert resp.status_code == 200
    body = resp.json()
    assert "bankName" in body
    assert "bankAccountNumber" in body
    assert "mtnNumber" in body
    assert "vatRatePercent" in body
    assert float(body["vatRatePercent"]) == 18.0


# ── Invoices ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_invoices_list(client: AsyncClient, db_session: AsyncSession):
    """Invoices endpoint must return a paginated structure."""
    pro_id = await _get_plan_id("professional", db_session)
    # Submit a payment to generate an invoice
    await client.post(
        f"{PREFIX}/billing/payments/submit",
        headers=auth_headers("owner-1"),
        json={
            "planId": pro_id, "billingCycle": "monthly", "currency": "UGX",
            "paymentMethod": "mtn_momo", "amount": 200000, "transactionReference": "INV-TEST-001",
        },
    )
    resp = await client.get(f"{PREFIX}/invoices", headers=auth_headers("owner-1"))
    assert resp.status_code == 200
    body = resp.json()
    assert "data" in body
    assert "total" in body
    assert body["total"] >= 1
    inv = body["data"][0]
    assert "invoiceNumber" in inv
    assert inv["invoiceNumber"].startswith("CR-INV")


# ── Admin billing — verification ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_verify_payment_activates_subscription(
    client: AsyncClient, db_session: AsyncSession
):
    """Admin verifying a payment should activate the subscription."""
    pro_id = await _get_plan_id("professional", db_session)

    # Submit payment as owner
    pay_resp = await client.post(
        f"{PREFIX}/billing/payments/submit",
        headers=auth_headers("owner-1"),
        json={
            "planId": pro_id, "billingCycle": "monthly", "currency": "UGX",
            "paymentMethod": "bank_transfer", "amount": 200000, "transactionReference": "VERIFY-001",
            "bankName": "Stanbic Bank", "transferDate": "2026-05-18",
        },
    )
    assert pay_resp.status_code == 201
    payment_id = pay_resp.json()["id"]

    # Admin verifies
    verify_resp = await client.post(
        f"{PREFIX}/admin/billing/payments/{payment_id}/verify",
        headers=auth_headers("user-superadmin-1"),
        json={"notes": "Payment confirmed — bank statement checked."},
    )
    assert verify_resp.status_code == 200
    verify_body = verify_resp.json()
    assert verify_body["status"] == "verified"

    # Subscription should now be active or trialing
    sub_resp = await client.get(f"{PREFIX}/subscriptions/current", headers=auth_headers("owner-1"))
    sub_status = sub_resp.json()["status"]
    assert sub_status in ("active", "trialing")


@pytest.mark.asyncio
async def test_admin_reject_payment_keeps_sub_pending(
    client: AsyncClient, db_session: AsyncSession
):
    """Admin rejecting a payment should keep subscription in pending_payment."""
    pro_id = await _get_plan_id("professional", db_session)

    pay_resp = await client.post(
        f"{PREFIX}/billing/payments/submit",
        headers=auth_headers("owner-1"),
        json={
            "planId": pro_id, "billingCycle": "monthly", "currency": "UGX",
            "paymentMethod": "cash", "amount": 200000, "transactionReference": "REJECT-001",
        },
    )
    payment_id = pay_resp.json()["id"]

    reject_resp = await client.post(
        f"{PREFIX}/admin/billing/payments/{payment_id}/reject",
        headers=auth_headers("user-superadmin-1"),
        json={"reason": "Transaction reference not found in our records."},
    )
    assert reject_resp.status_code == 200
    assert reject_resp.json()["status"] == "rejected"
    assert "not found" in reject_resp.json()["rejectionReason"]

    sub_resp = await client.get(f"{PREFIX}/subscriptions/current", headers=auth_headers("owner-1"))
    assert sub_resp.json()["status"] == "pending_payment"


@pytest.mark.asyncio
async def test_cannot_verify_already_verified_payment(
    client: AsyncClient, db_session: AsyncSession
):
    """Verifying an already-verified payment should return 400."""
    pro_id = await _get_plan_id("professional", db_session)
    pay_resp = await client.post(
        f"{PREFIX}/billing/payments/submit",
        headers=auth_headers("owner-1"),
        json={
            "planId": pro_id, "billingCycle": "monthly", "currency": "UGX",
            "paymentMethod": "mtn_momo", "amount": 200000, "transactionReference": "DOUBLE-VERIFY",
        },
    )
    pid = pay_resp.json()["id"]
    h = auth_headers("user-superadmin-1")
    await client.post(f"{PREFIX}/admin/billing/payments/{pid}/verify", headers=h, json={})
    resp2 = await client.post(f"{PREFIX}/admin/billing/payments/{pid}/verify", headers=h, json={})
    assert resp2.status_code == 400


# ── Admin billing settings ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_get_billing_settings(client: AsyncClient):
    """Superadmin can read billing settings."""
    resp = await client.get(
        f"{PREFIX}/admin/billing/settings",
        headers=auth_headers("user-superadmin-1"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "vatRatePercent" in body
    assert "bankName" in body
    assert "trialDays" in body
    assert body["trialDays"] == 14


@pytest.mark.asyncio
async def test_admin_update_billing_settings(client: AsyncClient):
    """Superadmin can update billing settings."""
    resp = await client.patch(
        f"{PREFIX}/admin/billing/settings",
        headers=auth_headers("user-superadmin-1"),
        json={"vatRatePercent": 20.0, "bankBranch": "Kampala Road Branch"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert float(body["vatRatePercent"]) == 20.0
    assert body["bankBranch"] == "Kampala Road Branch"


@pytest.mark.asyncio
async def test_non_superadmin_blocked_from_admin_billing(client: AsyncClient):
    """Managers must not access the admin billing endpoints."""
    resp = await client.get(
        f"{PREFIX}/admin/billing/settings",
        headers=auth_headers("manager-1"),
    )
    assert resp.status_code == 403


# ── Admin plan management ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_list_plans_includes_all(client: AsyncClient):
    """Admin plan list should return all plans (including hidden ones)."""
    resp = await client.get(
        f"{PREFIX}/admin/billing/plans",
        headers=auth_headers("user-superadmin-1"),
    )
    assert resp.status_code == 200
    assert len(resp.json()) >= 4


@pytest.mark.asyncio
async def test_admin_update_plan_price(client: AsyncClient, db_session: AsyncSession):
    """Admin can update plan pricing."""
    pro_id = await _get_plan_id("professional", db_session)
    resp = await client.patch(
        f"{PREFIX}/admin/billing/plans/{pro_id}",
        headers=auth_headers("user-superadmin-1"),
        json={"monthlyPriceUgx": 250000},
    )
    assert resp.status_code == 200
    assert resp.json()["monthlyPriceUgx"] == 250_000


@pytest.mark.asyncio
async def test_admin_update_plan_limits(client: AsyncClient, db_session: AsyncSession):
    """Admin can update plan limits."""
    pro_id = await _get_plan_id("professional", db_session)
    resp = await client.patch(
        f"{PREFIX}/admin/billing/plans/{pro_id}",
        headers=auth_headers("user-superadmin-1"),
        json={"maxProperties": 15, "maxUnits": 75},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["maxProperties"] == 15
    assert body["maxUnits"] == 75


# ── Admin subscription operations ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_extend_subscription(client: AsyncClient, db_session: AsyncSession):
    """Admin can extend a subscription's period."""
    # First get a subscription for owner-1
    await client.get(f"{PREFIX}/subscriptions/current", headers=auth_headers("owner-1"))
    sub_resp = await client.get(f"{PREFIX}/subscriptions/current", headers=auth_headers("owner-1"))
    sub_id = sub_resp.json()["id"]

    resp = await client.post(
        f"{PREFIX}/admin/billing/subscriptions/{sub_id}/extend",
        headers=auth_headers("user-superadmin-1"),
        json={"days": 30, "reason": "Goodwill extension for testing."},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["currentPeriodEnd"] is not None


# ── Pending payments queue ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_pending_payments_queue(client: AsyncClient, db_session: AsyncSession):
    """Admin can see the pending verification queue."""
    pro_id = await _get_plan_id("professional", db_session)
    await client.post(
        f"{PREFIX}/billing/payments/submit",
        headers=auth_headers("owner-1"),
        json={
            "planId": pro_id, "billingCycle": "monthly", "currency": "UGX",
            "paymentMethod": "airtel_money", "amount": 200000, "transactionReference": "QUEUE-TEST",
        },
    )
    resp = await client.get(
        f"{PREFIX}/admin/billing/payments/pending",
        headers=auth_headers("user-superadmin-1"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "data" in body
    assert body["total"] >= 1


# ── Feature gating (subscription limits) ──────────────────────────────────────

@pytest.mark.asyncio
async def test_feature_limit_enforcement_property(
    client: AsyncClient, db_session: AsyncSession
):
    """
    Free plan allows 1 property. After creating one, the limit check should
    raise 402 — tested here at the service layer (unit test style).
    """
    from app.services.subscription_limits import _get_active_plan_limits, _limit_exceeded

    # Seed a free subscription for a fake org
    free_plan = (await db_session.execute(
        select(SubscriptionPlan).where(SubscriptionPlan.slug == "free")
    )).scalar_one()

    # _limit_exceeded is a pure function — test it directly
    assert _limit_exceeded(0, 1) is False   # 0 used, limit 1 → not exceeded
    assert _limit_exceeded(1, 1) is True    # 1 used, limit 1 → exceeded
    assert _limit_exceeded(100, -1) is False # unlimited (-1) → never exceeded
    assert _limit_exceeded(0, 0) is True    # 0 limit → always exceeded


@pytest.mark.asyncio
async def test_subscription_limits_service_returns_usage_shape(
    client: AsyncClient, db_session: AsyncSession
):
    """get_usage() should return all expected keys with numeric values."""
    from sqlalchemy import select as sa_select
    from app.models.organisation import Organisation

    # Ensure owner-1 has a subscription
    await client.get(f"{PREFIX}/subscriptions/current", headers=auth_headers("owner-1"))

    # Get org for owner-1 dev user
    result = await db_session.execute(
        sa_select(Organisation).order_by(Organisation.created_at.asc()).limit(1)
    )
    org = result.scalar_one_or_none()
    if org is None:
        pytest.skip("No organisation in test DB for usage check")

    from app.services.subscription_limits import get_usage
    usage = await get_usage(org.id, db_session)

    required_keys = [
        "properties_used", "properties_limit", "properties_percent",
        "units_used", "units_limit", "units_percent",
        "users_used", "users_limit", "users_percent",
    ]
    for k in required_keys:
        assert k in usage, f"Missing key: {k}"
        assert isinstance(usage[k], (int, float))


# ── Currency and billing cycle validation ──────────────────────────────────────

@pytest.mark.asyncio
async def test_select_plan_annual_usd(client: AsyncClient, db_session: AsyncSession):
    """Selecting annual billing in USD should store correct price snapshot."""
    agency_id = await _get_plan_id("agency", db_session)
    resp = await client.post(
        f"{PREFIX}/subscriptions/select-plan",
        headers=auth_headers("owner-1"),
        json={"planId": agency_id, "billingCycle": "annual", "currency": "USD"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["billingCycle"] == "annual"
    assert body["currency"] == "USD"
    assert body["pricePaid"] == 104_640  # annual USD cents for agency plan (pricing v2)


@pytest.mark.asyncio
async def test_select_plan_monthly_ugx(client: AsyncClient, db_session: AsyncSession):
    """Monthly UGX billing for agency plan."""
    agency_id = await _get_plan_id("agency", db_session)
    resp = await client.post(
        f"{PREFIX}/subscriptions/select-plan",
        headers=auth_headers("owner-1"),
        json={"planId": agency_id, "billingCycle": "monthly", "currency": "UGX"},
    )
    assert resp.status_code == 200
    assert resp.json()["pricePaid"] == 399_000  # pricing v2 agency monthly


# ── Pricing v2 — plan catalogue (migration 065) ────────────────────────────────

@pytest.mark.asyncio
async def test_pricing_v2_free_plan_limits(client: AsyncClient):
    """Free plan must have max 2 properties and 15 units (pricing v2)."""
    resp = await client.get(f"{PREFIX}/subscriptions/plans", headers=auth_headers("manager-1"))
    free = next(p for p in resp.json() if p["slug"] == "free")
    assert free["maxProperties"] == 2
    assert free["maxUnits"] == 15
    assert free["maxUsers"] == 1
    assert free["maxStorageMb"] == 100


@pytest.mark.asyncio
async def test_pricing_v2_agency_plan_price(client: AsyncClient):
    """Agency plan must have 399,000 UGX monthly (pricing v2)."""
    resp = await client.get(f"{PREFIX}/subscriptions/plans", headers=auth_headers("manager-1"))
    agency = next(p for p in resp.json() if p["slug"] == "agency")
    assert agency["monthlyPriceUgx"] == 399_000
    assert agency["annualPriceUgx"] == 3_830_400
    assert agency["maxProperties"] == -1   # unlimited
    assert agency["maxUnits"] == 500
    assert agency["maxUsers"] == 20


@pytest.mark.asyncio
async def test_pricing_v2_professional_usd_price(client: AsyncClient):
    """Professional plan USD pricing (pricing v2)."""
    resp = await client.get(f"{PREFIX}/subscriptions/plans", headers=auth_headers("manager-1"))
    pro = next(p for p in resp.json() if p["slug"] == "professional")
    assert pro["monthlyPriceUsdCents"] == 4_500
    assert pro["annualPriceUsdCents"] == 43_200


# ── Pricing v2 — plan feature flags (migration 065) ───────────────────────────

@pytest.mark.asyncio
async def test_free_plan_new_features_are_disabled(db_session: AsyncSession):
    """Free plan must have all v2 feature flags set to False."""
    free_plan = (await db_session.execute(
        select(SubscriptionPlan).where(SubscriptionPlan.slug == "free")
    )).scalar_one()
    features = free_plan.features
    for flag in ("inspection_reports", "esignature_enabled", "onboarding_enabled",
                 "efris", "screenings", "maintenance_workflows", "document_storage",
                 "tenant_messaging", "team_members"):
        assert features.get(flag) is False, (
            f"Free plan should have {flag}=False, got {features.get(flag)!r}"
        )


@pytest.mark.asyncio
async def test_professional_plan_core_features_enabled(db_session: AsyncSession):
    """Professional plan must have v2 core features enabled."""
    pro_plan = (await db_session.execute(
        select(SubscriptionPlan).where(SubscriptionPlan.slug == "professional")
    )).scalar_one()
    features = pro_plan.features
    for flag in ("analytics_advanced", "maintenance_workflows", "document_storage",
                 "tenant_messaging", "inspection_reports", "esignature_enabled",
                 "onboarding_enabled"):
        assert features.get(flag) is True, (
            f"Professional plan should have {flag}=True, got {features.get(flag)!r}"
        )
    # These should be False on professional
    for flag in ("efris", "team_members", "screenings"):
        assert features.get(flag) is False, (
            f"Professional plan should have {flag}=False, got {features.get(flag)!r}"
        )


@pytest.mark.asyncio
async def test_agency_plan_all_features_enabled(db_session: AsyncSession):
    """Agency plan must have EFRIS, screenings, team_members, and audit_logs enabled."""
    agency_plan = (await db_session.execute(
        select(SubscriptionPlan).where(SubscriptionPlan.slug == "agency")
    )).scalar_one()
    features = agency_plan.features
    for flag in ("efris", "screenings", "team_members", "audit_logs",
                 "inspection_reports", "esignature_enabled", "custom_branding"):
        assert features.get(flag) is True, (
            f"Agency plan should have {flag}=True, got {features.get(flag)!r}"
        )


@pytest.mark.asyncio
async def test_enterprise_plan_all_features_enabled(db_session: AsyncSession):
    """Enterprise plan must have every feature flag set to True."""
    ent_plan = (await db_session.execute(
        select(SubscriptionPlan).where(SubscriptionPlan.slug == "enterprise")
    )).scalar_one()
    features = ent_plan.features
    for flag in ("analytics_advanced", "inspection_reports", "esignature_enabled",
                 "onboarding_enabled", "efris", "screenings", "team_members",
                 "custom_branding", "priority_support", "dedicated_support",
                 "api_access", "sso", "audit_logs"):
        assert features.get(flag) is True, (
            f"Enterprise plan should have {flag}=True, got {features.get(flag)!r}"
        )


# ── Feature gating service layer ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_check_feature_access_raises_402_for_free_plan(
    client: AsyncClient, db_session: AsyncSession
):
    """check_feature_access raises 402 when the org's plan lacks the feature."""
    from app.services.subscription_limits import check_feature_access
    from fastapi import HTTPException

    # Bootstrap a free subscription for the dev org
    await client.get(f"{PREFIX}/subscriptions/current", headers=auth_headers("owner-1"))

    # Get the dev org id
    from sqlalchemy import select as sa_select
    from app.models.organisation import Organisation
    org = (await db_session.execute(
        sa_select(Organisation).where(Organisation.logto_org_id == "org_dev")
    )).scalar_one()

    # inspection_reports is False on free plan → must raise 402
    with pytest.raises(HTTPException) as exc_info:
        await check_feature_access(org.id, "inspection_reports", db_session)
    assert exc_info.value.status_code == 402
    detail: dict = exc_info.value.detail  # type: ignore[assignment]
    assert detail["feature"] == "inspection_reports"
    assert detail["code"] == "feature_not_available"


@pytest.mark.asyncio
async def test_check_feature_access_passes_for_enabled_feature(
    client: AsyncClient, db_session: AsyncSession
):
    """check_feature_access does not raise for a feature enabled on the plan."""
    from app.services.subscription_limits import check_feature_access
    from app.models.organisation import Organisation

    # Upgrade dev org subscription to agency (has efris=True, team_members=True)
    agency_id = await _get_plan_id("agency", db_session)
    await client.post(
        f"{PREFIX}/subscriptions/select-plan",
        headers=auth_headers("owner-1"),
        json={"planId": agency_id, "billingCycle": "monthly", "currency": "UGX"},
    )

    # Manually mark it active (normally requires payment verification)
    from app.models.subscription import OrganisationSubscription, SubscriptionStatus
    org = (await db_session.execute(
        select(Organisation).where(Organisation.logto_org_id == "org_dev")
    )).scalar_one()
    sub = (await db_session.execute(
        select(OrganisationSubscription).where(
            OrganisationSubscription.organisation_id == org.id
        )
    )).scalar_one()
    sub.status = SubscriptionStatus.active
    await db_session.flush()

    # efris is True on agency plan — must not raise
    await check_feature_access(org.id, "efris", db_session)   # no exception = pass


@pytest.mark.asyncio
async def test_check_feature_access_superadmin_bypass(
    client: AsyncClient, db_session: AsyncSession
):
    """Superadmin has org_id=None; gating code must guard with 'if org_id is not None'."""
    # This verifies that superadmins aren't accidentally blocked by feature checks.
    # The guard is at the call site: if org_id is not None: await check_feature_access(...)
    # We test the service directly: passing None should not be called by callers,
    # but check_feature_access_bool handles it gracefully.
    from app.services.subscription_limits import check_feature_access_bool
    # org_id=None simulates a code path that forgot the guard — returns False safely
    result = await check_feature_access_bool(None, "inspection_reports", db_session)  # type: ignore[arg-type]
    assert result is False  # safe fallback, not a crash


# ── Admin plan feature flag management ────────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_update_plan_features_dict(client: AsyncClient, db_session: AsyncSession):
    """PATCH /admin/billing/plans/{id} can update the features JSONB dict."""
    pro_id = await _get_plan_id("professional", db_session)
    resp = await client.patch(
        f"{PREFIX}/admin/billing/plans/{pro_id}",
        headers=auth_headers("user-superadmin-1"),
        json={"features": {"analytics_basic": True, "screenings": True, "efris": False}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["features"]["screenings"] is True
    assert body["features"]["efris"] is False
    assert body["features"]["analytics_basic"] is True


@pytest.mark.asyncio
async def test_admin_update_plan_features_reflects_in_plan_response(
    client: AsyncClient, db_session: AsyncSession
):
    """After admin toggles a feature, the updated value must appear in the plan API response."""
    pro_id = await _get_plan_id("professional", db_session)

    # screenings is False on professional by default
    before = await client.get(f"{PREFIX}/subscriptions/plans", headers=auth_headers("manager-1"))
    pro_before = next(p for p in before.json() if p["slug"] == "professional")
    assert pro_before["features"]["screenings"] is False

    # Admin enables screenings
    patch_resp = await client.patch(
        f"{PREFIX}/admin/billing/plans/{pro_id}",
        headers=auth_headers("user-superadmin-1"),
        json={"features": {"screenings": True}},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["features"]["screenings"] is True

    # Confirm the public plans endpoint now reflects the change
    after = await client.get(f"{PREFIX}/subscriptions/plans", headers=auth_headers("manager-1"))
    pro_after = next(p for p in after.json() if p["slug"] == "professional")
    assert pro_after["features"]["screenings"] is True


@pytest.mark.asyncio
async def test_non_superadmin_cannot_update_plan_features(
    client: AsyncClient, db_session: AsyncSession
):
    """Only superadmin may update plan feature flags."""
    pro_id = await _get_plan_id("professional", db_session)
    resp = await client.patch(
        f"{PREFIX}/admin/billing/plans/{pro_id}",
        headers=auth_headers("owner-1"),
        json={"features": {"efris": True}},
    )
    assert resp.status_code in (403, 401)
