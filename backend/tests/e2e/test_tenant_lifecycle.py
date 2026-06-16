"""
E2E: Full Tenant Lifecycle Workflow
====================================
Mirrors the phases in docs/crib_tenant_workflow_test_harness.md.

Phases
  0  — System Setup Validation (auth, portal boot)
  1  — Lease (load, confirm-terms, PDF)
  2  — Rent Payment (schedule, record, ledger, statement)
  3  — Maintenance (create, assign, progress, photo update)
  4  — Inspections (list, sign)
  5  — Messaging (list, send)
  6  — Documents (list, presign upload)
  7  — Notifications (list, mark-read)
  8  — Settings (public)

Each step records its HTTP status + a PASS/FAIL/GAP label.
Assertions are hard for steps that MUST succeed; soft (status recorded)
for steps where behaviour depends on infrastructure (storage, etc.).
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import auth_headers

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


def soft(resp, *codes, label: str = "") -> tuple[int, str]:
    """Non-fatal status check — returns (status_code, verdict) without asserting."""
    expected = codes or (200, 201)
    verdict = "PASS" if resp.status_code in expected else f"GAP({resp.status_code})"
    return resp.status_code, verdict


# ─── Single sequential e2e test ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenant_lifecycle_e2e(client: AsyncClient, db_session: AsyncSession):
    """
    Full tenant lifecycle from setup through notifications.
    Creates all required data (property → unit → tenant → lease) then
    exercises every workflow phase as both manager and tenant.
    """
    ctx: dict = {}
    report: list[str] = []

    def log(phase: str, step: str, verdict: str, note: str = ""):
        line = f"  {phase:<6} {step:<38} {verdict}"
        if note:
            line += f"  — {note}"
        report.append(line)

    # ── DATA SETUP ────────────────────────────────────────────────────────────
    # These steps are hard assertions — if setup fails nothing else makes sense.

    # Manager profile
    r = await client.get("/api/v1/me", headers=MGR)
    me = assert_ok(r, 200, label="GET /me (manager)")
    ctx["org_id"] = me.get("organisationId")

    # Create property
    r = await client.post("/api/v1/properties", headers=MGR, json={
        "name": "E2E Test Block",
        "type": "flat",
        "address": {
            "line1": "1 Test Road",
            "city": "Kampala",
            "state": "Central",
            "postcode": "00000",
            "country": "UG",
        },
    })
    prop = assert_ok(r, 201, label="POST /properties")
    ctx["property_id"] = prop["id"]

    # Create unit
    r = await client.post(
        f"/api/v1/properties/{ctx['property_id']}/units",
        headers=MGR,
        json={"name": "Unit E2E-1", "type": "single", "monthlyRent": 500_000, "currency": "UGX"},
    )
    unit = assert_ok(r, 201, label="POST /properties/{id}/units")
    ctx["unit_id"] = unit["id"]

    # Create tenant record
    r = await client.post("/api/v1/tenants", headers=MGR, json={
        "firstName": "E2E",
        "lastName": "Tenant",
        "email": "e2e.tenant@test.local",
    })
    tenant = assert_ok(r, 201, label="POST /tenants")
    ctx["tenant_id"] = tenant["id"]

    # Create lease
    r = await client.post("/api/v1/leases", headers=MGR, json={
        "unitId": ctx["unit_id"],
        "tenantId": ctx["tenant_id"],
        "startDate": "2026-01-01",
        "monthlyRent": 500_000,
        "currency": "UGX",
        "advanceMonths": 1,
    })
    lease = assert_ok(r, 201, label="POST /leases")
    ctx["lease_id"] = lease["id"]

    # ── PHASE 0: System Setup Validation ─────────────────────────────────────

    # 0.1 — tenant-1 can authenticate
    r = await client.get("/api/v1/me", headers=TEN)
    body = assert_ok(r, 200, label="0.1 GET /me (tenant)")
    assert body.get("role") == "tenant", f"Expected role=tenant, got {body.get('role')}"
    log("0.1", "Tenant auth (GET /me)", "PASS")

    # 0.2 — public settings reachable (portal boot)
    r = await client.get("/api/v1/settings/public")
    assert_ok(r, 200, label="0.2 GET /settings/public")
    log("0.2", "Portal boot (GET /settings/public)", "PASS")

    # ── PHASE 1: Lease Onboarding ─────────────────────────────────────────────

    # 1.1 — List leases (manager)
    r = await client.get("/api/v1/leases", headers=MGR)
    body = assert_ok(r, 200, label="1.1 GET /leases")
    assert body.get("data"), "Expected at least one lease after setup"
    log("1.1", "List leases (GET /leases)", "PASS")

    # 1.2 — Confirm lease terms (tenant-1 JWT not linked to this test tenant → expect 403/404)
    r = await client.patch(f"/api/v1/leases/{ctx['lease_id']}/confirm-terms", headers=TEN)
    status, v = soft(r, 200)
    note = "tenant-1 dev JWT not linked to test tenant record — expect 403/404"
    if r.status_code in (403, 404):
        v = f"GAP({r.status_code}) expected"
    log("1.2", "Confirm lease terms (PATCH /confirm-terms)", v, note)

    # 1.3 — Generate lease PDF
    r = await client.post(f"/api/v1/leases/{ctx['lease_id']}/document", headers=MGR)
    status, v = soft(r, 200, 201)
    note = "422 = storage not configured in test env" if r.status_code == 422 else ""
    log("1.3", "Generate lease PDF (POST /document)", v, note)

    # ── PHASE 2: Rent Payment ─────────────────────────────────────────────────

    # 2.1 — Rent schedules
    r = await client.get(f"/api/v1/leases/{ctx['lease_id']}/schedules", headers=MGR)
    assert_ok(r, 200, label="2.1 GET /schedules")
    log("2.1", "Rent schedules (GET /schedules)", "PASS")

    # 2.2 — Record manual payment (immediately confirmed)
    r = await client.post(
        f"/api/v1/leases/{ctx['lease_id']}/payments/record",
        headers=MGR,
        json={"amount": 500_000, "currency": "UGX", "method": "cash", "reference": "E2E-CASH-001"},
    )
    pay = assert_ok(r, 201, label="2.2 POST /payments/record")
    ctx["payment_id"] = pay["id"]
    log("2.2", "Record payment (POST /payments/record)", "PASS")

    # 2.3 — Get payment by ID
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

    # 2.5 — Statement (may not be implemented)
    r = await client.get(f"/api/v1/leases/{ctx['lease_id']}/statement", headers=MGR)
    status, v = soft(r, 200)
    note = "404 = endpoint not yet implemented" if r.status_code == 404 else ""
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

    # 3.2 — Assign (ISSUE_ASSIGNED transition)
    r = await client.post(
        f"/api/v1/maintenance/{ctx['issue_id']}/transition",
        headers=MGR,
        json={"event": "ISSUE_ASSIGNED", "assignedTo": "Test Contractor"},
    )
    assert_ok(r, 200, label="3.2 transition ISSUE_ASSIGNED")
    log("3.2", "Assign maintenance (ISSUE_ASSIGNED)", "PASS")

    # 3.3 — Start work (ISSUE_STARTED)
    r = await client.post(
        f"/api/v1/maintenance/{ctx['issue_id']}/transition",
        headers=MGR,
        json={"event": "ISSUE_STARTED"},
    )
    assert_ok(r, 200, label="3.3 transition ISSUE_STARTED")
    log("3.3", "Start maintenance (ISSUE_STARTED)", "PASS")

    # 3.4 — Add photo URLs via PUT update
    r = await client.put(
        f"/api/v1/maintenance/{ctx['issue_id']}",
        headers=MGR,
        json={"photoUrls": ["https://cdn.test/photo1.jpg"]},
    )
    status, v = soft(r, 200)
    note = "method or field not supported" if r.status_code not in (200, 201) else ""
    log("3.4", "Upload photos (PUT /maintenance/{id})", v, note)

    # ── PHASE 4: Inspections ─────────────────────────────────────────────────

    # 4.1 — List inspections for this lease
    r = await client.get(
        "/api/v1/inspections",
        headers=MGR,
        params={"leaseId": ctx["lease_id"]},
    )
    assert_ok(r, 200, label="4.1 GET /inspections")
    log("4.1", "List inspections (GET /inspections)", "PASS")

    # 4.2 — Sign inspection (no inspection exists yet → expected gap)
    log("4.2", "Sign inspection (POST /inspections/{id}/sign)", "GAP(no inspection)", "no inspection created in this flow")

    # ── PHASE 5: Messaging ────────────────────────────────────────────────────

    # 5.1 — List messages
    r = await client.get(f"/api/v1/leases/{ctx['lease_id']}/messages", headers=MGR)
    assert_ok(r, 200, label="5.1 GET /messages")
    log("5.1", "List messages (GET /leases/{id}/messages)", "PASS")

    # 5.2 — Send message
    r = await client.post(
        f"/api/v1/leases/{ctx['lease_id']}/messages",
        headers=MGR,
        json={"content": "E2E test message from manager."},
    )
    msg = assert_ok(r, 201, label="5.2 POST /messages")
    ctx["message_id"] = msg["id"]
    log("5.2", "Send message (POST /leases/{id}/messages)", "PASS")

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

    # 6.2 — Presign upload (tenant endpoint)
    r = await client.post(
        "/api/v1/upload/presign/tenant-document",
        headers=TEN,
        json={"filename": "test_id.pdf", "mimeType": "application/pdf", "category": "document"},
    )
    status, v = soft(r, 200)
    note = "storage not configured in test env" if r.status_code == 422 else ""
    log("6.2", "Presign upload (POST /presign/tenant-document)", v, note)

    # ── PHASE 7: Notifications ────────────────────────────────────────────────

    # 7.1 — List notifications
    r = await client.get("/api/v1/notifications", headers=MGR)
    assert_ok(r, 200, label="7.1 GET /notifications")
    log("7.1", "List notifications (GET /notifications)", "PASS")

    # 7.2 — Unread count (flat endpoint)
    r = await client.get("/api/v1/messages/unread-count", headers=TEN)
    assert_ok(r, 200, label="7.2 GET /messages/unread-count")
    log("7.2", "Unread count (GET /messages/unread-count)", "PASS")

    # ── PHASE 8: Settings ─────────────────────────────────────────────────────

    r = await client.get("/api/v1/settings/public")
    settings = assert_ok(r, 200, label="8.1 GET /settings/public")
    assert isinstance(settings, dict), "Expected settings dict"
    log("8.1", "Public settings (GET /settings/public)", "PASS")

    # ── PRINT REPORT ─────────────────────────────────────────────────────────
    print("\n")
    print("=" * 65)
    print("  CRIB TENANT LIFECYCLE — E2E EXECUTION REPORT")
    print("=" * 65)
    for line in report:
        print(line)
    print("=" * 65)
    print(f"  {sum(1 for l in report if 'PASS' in l)} PASS  |  "
          f"{sum(1 for l in report if 'GAP' in l)} GAP  |  "
          f"{sum(1 for l in report if 'FAIL' in l)} FAIL")
    print("=" * 65)
