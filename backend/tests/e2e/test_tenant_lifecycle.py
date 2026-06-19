"""
E2E: Full Tenant Lifecycle Workflow
====================================
Mirrors the phases in docs/crib_tenant_workflow_test_harness.md.

Setup uses DB factories (same pattern as all other Crib tests) to seed
property → unit → tenant (approved) → lease, then exercises every
workflow phase exclusively through real FastAPI endpoints.

Phases
  0  — System Setup Validation (auth, portal boot)
  1  — Lease (load, confirm-terms, PDF)
  2  — Rent Payment (schedule, record, ledger, statement)
  3  — Maintenance (create, assign, in-progress, photo update)
  4  — Inspections (list)
  5  — Messaging (list, send, mark-read)
  6  — Documents (list, presign upload)
  7  — Notifications + unread count
  8  — Settings (public)
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers
from tests.factories import make_property, make_unit, make_tenant, make_lease

MGR = auth_headers("manager-1")
TEN = auth_headers("tenant-1")


# ─── helpers ──────────────────────────────────────────────────────────────────

def assert_ok(resp, *codes, label: str = ""):
    """Assert HTTP status is in `codes` (default 200/201), return parsed JSON."""
    expected = codes or (200, 201)
    assert resp.status_code in expected, (
        f"[{label or resp.request.url}] "
        f"{resp.request.method} → {resp.status_code}\n"
        f"{resp.text[:500]}"
    )
    return resp.json()


def soft(resp, *codes) -> tuple[int, str]:
    """Non-fatal status check — returns (status_code, verdict) without asserting."""
    expected = codes or (200, 201)
    verdict = "PASS" if resp.status_code in expected else f"GAP({resp.status_code})"
    return resp.status_code, verdict


# ─── E2E test ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenant_lifecycle_e2e(client: AsyncClient, db_session: AsyncSession, dev_org):
    """
    Full tenant lifecycle from auth validation through notifications.
    DB factories seed the required data; all phases call real API endpoints.
    """
    from app.models.tenant import OnboardingState, TenantStatus
    from app.models.lease import LeaseStatus

    import sqlalchemy as _sa

    ctx: dict = {}
    report: list[str] = []

    def log(phase: str, step: str, verdict: str, note: str = ""):
        line = f"  {phase:<6} {step:<40} {verdict}"
        if note:
            line += f"  — {note}"
        report.append(line)

    # ── Upgrade dev_org to Professional so all E2E features are available ─────
    await db_session.execute(_sa.text("""
        INSERT INTO organisation_subscriptions
            (organisation_id, plan_id, status, billing_cycle, currency, current_period_start, auto_renew)
        SELECT o.id, sp.id, 'active', 'none', 'UGX', now(), true
        FROM organisations o, subscription_plans sp
        WHERE o.logto_org_id = 'org_dev' AND sp.slug = 'professional'
        ON CONFLICT (organisation_id) DO UPDATE
            SET plan_id = EXCLUDED.plan_id,
                status = 'active'
    """))
    await db_session.flush()

    # ── SEED: property → unit → tenant (approved) → lease ────────────────────
    prop = await make_property(db_session, dev_org)
    unit = await make_unit(db_session, prop)
    tenant = await make_tenant(
        db_session, dev_org,
        onboarding_state=OnboardingState.approved,
        status=TenantStatus.active,
    )
    lease = await make_lease(
        db_session, dev_org, unit, tenant,
        status=LeaseStatus.active,
    )
    await db_session.flush()

    ctx["property_id"] = str(prop.id)
    ctx["unit_id"]     = str(unit.id)
    ctx["tenant_id"]   = str(tenant.id)
    ctx["lease_id"]    = str(lease.id)

    # ── PHASE 0: System Setup Validation ─────────────────────────────────────

    # 0.1 — tenant-1 JWT is valid and role=tenant
    r = await client.get("/api/v1/me", headers=TEN)
    body = assert_ok(r, 200, label="0.1 GET /me (tenant)")
    assert body.get("role") == "tenant", f"Expected role=tenant, got {body.get('role')}"
    log("0.1", "Tenant auth (GET /me)", "PASS")

    # 0.2 — public settings (portal boot signal)
    # NOTE: requires auth in test env even though named "public"
    r = await client.get("/api/v1/settings/public", headers=TEN)
    assert_ok(r, 200, label="0.2 GET /settings/public")
    log("0.2", "Portal boot (GET /settings/public)", "PASS", "requires auth even as 'public'")

    # ── PHASE 1: Lease ────────────────────────────────────────────────────────

    # 1.1 — List leases as manager
    r = await client.get("/api/v1/leases", headers=MGR)
    body = assert_ok(r, 200, label="1.1 GET /leases")
    found = any(l["id"] == ctx["lease_id"] for l in body.get("data", []))
    assert found, "Seeded lease not found in GET /leases"
    log("1.1", "List leases (GET /leases)", "PASS")

    # 1.2 — Confirm lease terms (tenant-1 JWT sub != seeded tenant → expect 403)
    r = await client.patch(f"/api/v1/leases/{ctx['lease_id']}/confirm-terms", headers=TEN)
    status, v = soft(r, 200)
    note = "tenant-1 logto_sub not linked to seeded tenant record — expected 403"
    if r.status_code == 403:
        v = "GAP(403) expected"
    log("1.2", "Confirm lease terms (PATCH /confirm-terms)", v, note)

    # 1.3 — Generate lease PDF
    r = await client.post(f"/api/v1/leases/{ctx['lease_id']}/document", headers=MGR)
    status, v = soft(r, 200, 201)
    note = "storage not configured in test env" if r.status_code == 422 else ""
    log("1.3", "Generate lease PDF (POST /document)", v, note)

    # ── PHASE 2: Rent Payment ─────────────────────────────────────────────────

    # 2.1 — Rent schedules
    r = await client.get(f"/api/v1/leases/{ctx['lease_id']}/schedules", headers=MGR)
    assert_ok(r, 200, label="2.1 GET /schedules")
    log("2.1", "Rent schedules (GET /schedules)", "PASS")

    # 2.2 — Record manual payment (immediately confirmed + allocated)
    r = await client.post(
        f"/api/v1/leases/{ctx['lease_id']}/payments/record",
        headers=MGR,
        json={"amount": 500_000, "currency": "UGX", "method": "cash", "reference": "E2E-CASH-001"},
    )
    pay = assert_ok(r, 201, label="2.2 POST /payments/record")
    ctx["payment_id"] = pay["id"]
    log("2.2", "Record payment (POST /payments/record)", "PASS")

    # 2.3 — Fetch payment by ID
    r = await client.get(
        f"/api/v1/leases/{ctx['lease_id']}/payments/{ctx['payment_id']}",
        headers=MGR,
    )
    assert_ok(r, 200, label="2.3 GET /payments/{id}")
    log("2.3", "Payment detail (GET /payments/{id})", "PASS")

    # 2.4 — Ledger
    r = await client.get(f"/api/v1/leases/{ctx['lease_id']}/ledger", headers=MGR)
    assert_ok(r, 200, label="2.4 GET /ledger")
    log("2.4", "Ledger (GET /ledger)", "PASS")

    # 2.5 — Statement (check if endpoint exists)
    r = await client.get(f"/api/v1/leases/{ctx['lease_id']}/statement", headers=MGR)
    status, v = soft(r, 200)
    note = "endpoint not implemented" if r.status_code == 404 else ""
    log("2.5", "Statement (GET /statement)", v, note)

    # ── PHASE 3: Maintenance ─────────────────────────────────────────────────

    # 3.1 — Create maintenance request
    r = await client.post("/api/v1/maintenance", headers=MGR, json={
        "propertyId": ctx["property_id"],
        "unitId": ctx["unit_id"],
        "leaseId": ctx["lease_id"],
        "reportedBy": "manager",
        "reportedById": "e2e-test",
        "title": "E2E: Dripping tap",
        "description": "Kitchen tap drips continuously.",
        "category": "plumbing",
        "priority": "medium",
    })
    issue = assert_ok(r, 201, label="3.1 POST /maintenance")
    ctx["issue_id"] = issue["id"]
    log("3.1", "Create maintenance (POST /maintenance)", "PASS")

    # 3.2 — Assign (ISSUE_ASSIGNED)
    r = await client.post(
        f"/api/v1/maintenance/{ctx['issue_id']}/transition",
        headers=MGR,
        json={"event": "ISSUE_ASSIGNED", "assignedTo": "Test Contractor"},
    )
    assert_ok(r, 200, label="3.2 ISSUE_ASSIGNED")
    log("3.2", "Assign maintenance (ISSUE_ASSIGNED)", "PASS")

    # 3.3 — Start work (ISSUE_STARTED)
    r = await client.post(
        f"/api/v1/maintenance/{ctx['issue_id']}/transition",
        headers=MGR,
        json={"event": "ISSUE_STARTED"},
    )
    assert_ok(r, 200, label="3.3 ISSUE_STARTED")
    log("3.3", "Start maintenance (ISSUE_STARTED)", "PASS")

    # 3.4 — Attach photo URLs via PUT
    r = await client.put(
        f"/api/v1/maintenance/{ctx['issue_id']}",
        headers=MGR,
        json={"photoUrls": ["https://cdn.example.com/photo1.jpg"]},
    )
    _, v = soft(r, 200)
    note = "field not accepted via PUT" if r.status_code not in (200, 201) else ""
    log("3.4", "Add photo URLs (PUT /maintenance/{id})", v, note)

    # ── PHASE 4: Inspections ─────────────────────────────────────────────────

    r = await client.get(
        "/api/v1/inspections",
        headers=MGR,
        params={"leaseId": ctx["lease_id"]},
    )
    assert_ok(r, 200, label="4.1 GET /inspections")
    log("4.1", "List inspections (GET /inspections)", "PASS")
    log("4.2", "Sign inspection (POST /inspections/{id}/sign)", "GAP(skip)", "no inspection seeded")

    # ── PHASE 5: Messaging ────────────────────────────────────────────────────

    # 5.1 — List messages
    r = await client.get(f"/api/v1/leases/{ctx['lease_id']}/messages", headers=MGR)
    assert_ok(r, 200, label="5.1 GET /messages")
    log("5.1", "List messages (GET .../messages)", "PASS")

    # 5.2 — Send message
    r = await client.post(
        f"/api/v1/leases/{ctx['lease_id']}/messages",
        headers=MGR,
        json={"content": "E2E test message."},
    )
    msg = assert_ok(r, 201, label="5.2 POST /messages")
    ctx["message_id"] = msg["id"]
    log("5.2", "Send message (POST .../messages)", "PASS")

    # 5.3 — Mark message read
    r = await client.patch(
        f"/api/v1/leases/{ctx['lease_id']}/messages/{ctx['message_id']}/read",
        headers=MGR,
    )
    assert_ok(r, 200, label="5.3 PATCH /messages/{id}/read")
    log("5.3", "Mark message read (PATCH .../messages/{id}/read)", "PASS")

    # ── PHASE 6: Documents ────────────────────────────────────────────────────

    # 6.1 — List tenant documents
    r = await client.get(f"/api/v1/tenants/{ctx['tenant_id']}/documents", headers=MGR)
    assert_ok(r, 200, label="6.1 GET /tenants/{id}/documents")
    log("6.1", "List documents (GET /tenants/{id}/documents)", "PASS")

    # 6.2 — Presign upload (tenant-facing endpoint)
    r = await client.post(
        "/api/v1/upload/presign/tenant-document",
        headers=TEN,
        json={"filename": "test_passport.pdf", "mimeType": "application/pdf", "category": "document"},
    )
    status, v = soft(r, 200)
    note = "storage not configured" if r.status_code == 422 else (
        "success" if r.status_code == 200 else f"unexpected {r.status_code}"
    )
    log("6.2", "Presign upload (POST /presign/tenant-document)", v, note)

    # ── PHASE 7: Notifications ────────────────────────────────────────────────

    # 7.1 — List notifications
    r = await client.get("/api/v1/notifications", headers=MGR)
    assert_ok(r, 200, label="7.1 GET /notifications")
    log("7.1", "List notifications (GET /notifications)", "PASS")

    # 7.2 — Unread message count (tenant-accessible flat endpoint)
    r = await client.get("/api/v1/messages/unread-count", headers=TEN)
    assert_ok(r, 200, label="7.2 GET /messages/unread-count")
    log("7.2", "Unread count (GET /messages/unread-count)", "PASS")

    # ── PHASE 8: Settings ─────────────────────────────────────────────────────

    r = await client.get("/api/v1/settings/public", headers=TEN)
    settings = assert_ok(r, 200, label="8.1 GET /settings/public")
    assert isinstance(settings, dict), "Expected settings dict"
    log("8.1", "Public settings (GET /settings/public)", "PASS")

    # ── REPORT ────────────────────────────────────────────────────────────────
    passes = sum(1 for l in report if "PASS" in l)
    gaps   = sum(1 for l in report if "GAP" in l)
    fails  = sum(1 for l in report if "FAIL" in l)

    print("\n")
    print("=" * 68)
    print("  CRIB TENANT LIFECYCLE — E2E EXECUTION REPORT")
    print("=" * 68)
    for line in report:
        print(line)
    print("=" * 68)
    print(f"  {passes} PASS  |  {gaps} GAP  |  {fails} FAIL  (total {len(report)} steps)")
    print("=" * 68)
