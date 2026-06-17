"""
Crib Tenant Workflow Test Harness
Runs against the live dev backend at localhost:8001
"""
import json
import sys
import uuid
import requests

BASE = "http://localhost:8001/api/v1"
MGR  = {"X-Dev-User-Id": "manager-1"}
OWN  = {"X-Dev-User-Id": "owner-1"}
ADM  = {"X-Dev-User-Id": "superadmin-1"}

LEASE_ID  = "0a336955-3363-4668-829e-b3833ee40819"
TENANT_ID = "af9abb31-96fd-41e0-b565-7a6efe89c41f"
UNIT_ID   = "b723c340-fd00-4f00-b6b4-3d7fa35a492b"

PASS = "✅"
FAIL = "❌"
SKIP = "⚠️ "
INFO = "  "

results = []

def check(label, resp, expect=(200,), show_body=False):
    code = resp.status_code
    ok = code in expect
    sym = PASS if ok else FAIL
    try:
        body = resp.json()
    except Exception:
        body = resp.text[:120]
    detail = ""
    if not ok:
        detail = f" → {body}" if isinstance(body, (str, dict)) else ""
    print(f"  {sym} {label}: HTTP {code}{detail}")
    if show_body and ok:
        if isinstance(body, dict):
            keys = list(body.keys())[:8]
            print(f"     keys={keys}")
        elif isinstance(body, list):
            print(f"     count={len(body)}")
    results.append((label, ok, code))
    return body if ok else None


def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


def step(title):
    print(f"\n--- {title} ---")


# ─────────────────────────────────────────────────────────────
# PHASE 0: System Setup
# ─────────────────────────────────────────────────────────────
section("PHASE 0 — SYSTEM SETUP")

step("0.1 Health check")
r = requests.get("http://localhost:8001/health")
body = check("GET /health", r, (200,))
if body:
    print(f"     uptime={body.get('uptime_seconds')}s status={body.get('status')}")

step("0.2 Dev user identity (manager)")
r = requests.get(f"{BASE}/me", headers=MGR)
body = check("GET /me (manager)", r, (200,))
mgr_profile_id = body.get("id") if body else None
if body:
    print(f"     role={body.get('role')} name={body.get('displayName')} org={body.get('organisationId','')[:8]}...")
    print(f"     profileId={mgr_profile_id}")

step("0.3 Dev user identity (owner)")
r = requests.get(f"{BASE}/me", headers=OWN)
body = check("GET /me (owner)", r, (200,))
if body:
    print(f"     role={body.get('role')} name={body.get('displayName')}")

step("0.4 Public settings (authenticated)")
r = requests.get(f"{BASE}/settings/public", headers=MGR)
check("GET /settings/public", r, (200,), show_body=True)


# ─────────────────────────────────────────────────────────────
# PHASE 1: Lease
# ─────────────────────────────────────────────────────────────
section("PHASE 1 — LEASE")

step("1.1 Get lease")
r = requests.get(f"{BASE}/leases/{LEASE_ID}", headers=MGR)
body = check("GET /leases/{id}", r, (200,), show_body=True)
prop_id = None
if body:
    prop_id = body.get("propertyId")
    print(f"     state={body.get('state')} tenant={body.get('tenantId','')[:8]}...")
    print(f"     unit={body.get('unitId','')[:8]}... propertyId={str(prop_id or '')[:8]}...")
    print(f"     sigs={len(body.get('signatures', []))}")

step("1.2 List all leases (filter by tenant)")
r = requests.get(f"{BASE}/leases?tenantId={TENANT_ID}", headers=MGR)
body = check("GET /leases?tenantId=", r, (200,))
if body:
    items = body if isinstance(body, list) else body.get("data", [body])
    print(f"     count={len(items)} states={[x.get('state') for x in items]}")

step("1.3 Lease ledger entries")
r = requests.get(f"{BASE}/leases/{LEASE_ID}/ledger/entries", headers=MGR)
body = check("GET /leases/{id}/ledger/entries", r, (200,))
if body:
    items = body if isinstance(body, list) else body.get("data", [])
    print(f"     entries={len(items)}")

step("1.4 Lease agreement signing info")
r = requests.get(f"{BASE}/leases/{LEASE_ID}/agreement/signing-info", headers=MGR)
body = check("GET /leases/{id}/agreement/signing-info", r, (200, 404))
if body and r.status_code == 200:
    print(f"     hash={str(body.get('documentHash',''))[:16]}... events={body.get('signingEventCount')}")

step("1.5 Statement CSV")
r = requests.get(f"{BASE}/leases/{LEASE_ID}/statement", headers=MGR)
check("GET /leases/{id}/statement", r, (200,))
if r.status_code == 200:
    lines = r.text.strip().split('\n')
    print(f"     CSV rows={len(lines)}")


# ─────────────────────────────────────────────────────────────
# PHASE 2: Rent Payments
# ─────────────────────────────────────────────────────────────
section("PHASE 2 — RENT PAYMENTS")

step("2.1 List payments")
r = requests.get(f"{BASE}/leases/{LEASE_ID}/payments", headers=MGR)
body = check("GET /leases/{id}/payments", r, (200,))
payments = []
if body:
    payments = body if isinstance(body, list) else body.get("data", [])
    print(f"     count={len(payments)}")
    if payments:
        p = payments[0]
        print(f"     latest: amount={p.get('amount')} status={p.get('status')} category={p.get('category')}")

step("2.2 List rent schedules")
r = requests.get(f"{BASE}/rent-schedules?leaseId={LEASE_ID}", headers=MGR)
body = check("GET /rent-schedules?leaseId=", r, (200,))
schedules = []
if body:
    schedules = body if isinstance(body, list) else body.get("data", [])
    print(f"     count={len(schedules)}")

step("2.3 Wallet balance")
r = requests.get(f"{BASE}/tenants/{TENANT_ID}/wallet", headers=MGR)
body = check("GET /tenants/{id}/wallet", r, (200,))
if body:
    print(f"     balance={body.get('balance')} {body.get('currency')}")

step("2.4 Wallet transactions")
r = requests.get(f"{BASE}/tenants/{TENANT_ID}/wallet/transactions", headers=MGR)
body = check("GET /tenants/{id}/wallet/transactions", r, (200,))
if body:
    txns = body.get("data", [])
    print(f"     count={len(txns)} total={body.get('total')}")


# ─────────────────────────────────────────────────────────────
# PHASE 3: Maintenance
# ─────────────────────────────────────────────────────────────
section("PHASE 3 — MAINTENANCE")

step("3.1 List maintenance requests")
r = requests.get(f"{BASE}/maintenance?leaseId={LEASE_ID}", headers=MGR)
body = check("GET /maintenance?leaseId=", r, (200,))
maint_items = []
if body:
    maint_items = body if isinstance(body, list) else body.get("data", [])
    print(f"     count={len(maint_items)}")

step("3.2 Create maintenance request")
payload = {
    "leaseId": LEASE_ID,
    "propertyId": prop_id or "",
    "unitId": UNIT_ID,
    "title": "Harness Test — Leaking tap",
    "description": "Test from workflow harness. Please ignore.",
    "category": "plumbing",
    "priority": "low",
    "reportedBy": "Manager",
    "reportedById": mgr_profile_id or "",
}
r = requests.post(f"{BASE}/maintenance", json=payload, headers=MGR)
body = check("POST /maintenance", r, (200, 201))
maint_id = None
if body:
    maint_id = body.get("id") if isinstance(body, dict) else None
    print(f"     id={maint_id} state={body.get('state') if isinstance(body, dict) else ''}")

if maint_id:
    step("3.3 Get maintenance request")
    r = requests.get(f"{BASE}/maintenance/{maint_id}", headers=MGR)
    check("GET /maintenance/{id}", r, (200,))

    step("3.4 Transition → assigned")
    r = requests.post(
        f"{BASE}/maintenance/{maint_id}/transition",
        json={"event": "ISSUE_ASSIGNED", "assigned_to": "Test Contractor"},
        headers=MGR,
    )
    check("POST /maintenance/{id}/transition (assigned)", r, (200,))

    step("3.5 Transition → in_progress")
    r = requests.post(
        f"{BASE}/maintenance/{maint_id}/transition",
        json={"event": "ISSUE_STARTED"},
        headers=MGR,
    )
    check("POST /maintenance/{id}/transition (in_progress)", r, (200,))

    step("3.6 Transition → resolved")
    r = requests.post(
        f"{BASE}/maintenance/{maint_id}/transition",
        json={"event": "ISSUE_RESOLVED"},
        headers=MGR,
    )
    check("POST /maintenance/{id}/transition (resolved)", r, (200,))


# ─────────────────────────────────────────────────────────────
# PHASE 4: Inspections
# ─────────────────────────────────────────────────────────────
section("PHASE 4 — INSPECTIONS")

step("4.1 List inspections")
r = requests.get(f"{BASE}/inspections?leaseId={LEASE_ID}", headers=MGR)
body = check("GET /inspections?leaseId=", r, (200,))
inspections = []
if body:
    inspections = body if isinstance(body, list) else body.get("data", [])
    print(f"     count={len(inspections)}")
    if inspections:
        ins = inspections[0]
        print(f"     latest: state={ins.get('state')} type={ins.get('inspectionType')}")

step("4.2 Create inspection")
payload = {
    "leaseId": LEASE_ID,
    "propertyId": prop_id or "",
    "unitId": UNIT_ID,
    "type": "routine",
    "scheduledDate": "2026-07-01",
}
r = requests.post(f"{BASE}/inspections", json=payload, headers=MGR)
body = check("POST /inspections", r, (200, 201))
insp_id = None
if body and isinstance(body, dict):
    insp_id = body.get("id")
    print(f"     id={insp_id} state={body.get('state')}")


# ─────────────────────────────────────────────────────────────
# PHASE 5: Messaging
# ─────────────────────────────────────────────────────────────
section("PHASE 5 — MESSAGING")

step("5.1 List messages (flat)")
r = requests.get(f"{BASE}/messages?leaseId={LEASE_ID}", headers=MGR)
body = check("GET /messages?leaseId=", r, (200,))
if body:
    msgs = body if isinstance(body, list) else body.get("data", [])
    print(f"     count={len(msgs)}")

step("5.2 List messages (lease-scoped)")
r = requests.get(f"{BASE}/leases/{LEASE_ID}/messages", headers=MGR)
body = check("GET /leases/{id}/messages", r, (200,))
if body:
    msgs = body if isinstance(body, list) else body.get("data", [])
    print(f"     count={len(msgs)}")

step("5.3 Send message")
payload = {"content": "Test message from workflow harness — please ignore."}
r = requests.post(f"{BASE}/leases/{LEASE_ID}/messages", json=payload, headers=MGR)
body = check("POST /leases/{id}/messages", r, (200, 201))
msg_id = None
if body:
    msg_id = body.get("id")
    print(f"     id={msg_id}")


# ─────────────────────────────────────────────────────────────
# PHASE 6: Documents
# ─────────────────────────────────────────────────────────────
section("PHASE 6 — DOCUMENTS")

step("6.1 List tenant documents")
r = requests.get(f"{BASE}/tenants/{TENANT_ID}/documents", headers=MGR)
body = check("GET /tenants/{id}/documents", r, (200,))
if body:
    docs = body if isinstance(body, list) else body.get("data", [])
    print(f"     count={len(docs)}")

step("6.2 Sealed PDF endpoint")
r = requests.get(f"{BASE}/leases/{LEASE_ID}/agreement/sealed.pdf", headers=MGR, allow_redirects=False)
check("GET /leases/{id}/agreement/sealed.pdf", r, (200, 202, 302, 404))


# ─────────────────────────────────────────────────────────────
# PHASE 7: Notifications
# ─────────────────────────────────────────────────────────────
section("PHASE 7 — NOTIFICATIONS")

step("7.1 List notifications")
r = requests.get(f"{BASE}/notifications", headers=MGR)
body = check("GET /notifications", r, (200,))
notifs = []
if body:
    notifs = body if isinstance(body, list) else body.get("data", [])
    print(f"     count={len(notifs)}")

if notifs:
    nid = notifs[0].get("id")
    step("7.2 Mark notification read")
    r = requests.post(f"{BASE}/notifications/{nid}/read", headers=MGR)
    check(f"POST /notifications/{nid[:8]}.../read", r, (200,))


# ─────────────────────────────────────────────────────────────
# PHASE 8: Analytics
# ─────────────────────────────────────────────────────────────
section("PHASE 8 — ANALYTICS / REPORTING")

step("8.1 Analytics dashboard")
r = requests.get(f"{BASE}/analytics/dashboard", headers=MGR)
check("GET /analytics/dashboard", r, (200,), show_body=True)

step("8.2 Analytics cashflow")
r = requests.get(f"{BASE}/analytics/cashflow", headers=MGR)
check("GET /analytics/cashflow", r, (200,))

step("8.3 Income/expense report")
r = requests.get(f"{BASE}/reports/income-expense", headers=MGR)
check("GET /reports/income-expense", r, (200,))

step("8.4 Occupancy report")
r = requests.get(f"{BASE}/reports/occupancy", headers=MGR)
check("GET /reports/occupancy", r, (200,))

step("8.5 Rent arrears report")
r = requests.get(f"{BASE}/reports/rent-arrears", headers=MGR)
check("GET /reports/rent-arrears", r, (200,))

step("8.6 Rent collection report")
r = requests.get(f"{BASE}/reports/rent-collection", headers=MGR)
check("GET /reports/rent-collection", r, (200,))


# ─────────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────────
print(f"\n{'='*60}")
print("  SUMMARY")
print(f"{'='*60}")
passed = [r for r in results if r[1]]
failed = [r for r in results if not r[1]]
print(f"\n  {PASS} PASSED: {len(passed)}/{len(results)}")
print(f"  {FAIL} FAILED: {len(failed)}/{len(results)}")
if failed:
    print("\n  Failures:")
    for label, ok, code in failed:
        print(f"    {FAIL} [{code}] {label}")
