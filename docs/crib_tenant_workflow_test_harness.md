from pathlib import Path

content = """# CRIB TENANT PORTAL — WORKFLOW ENGINE TEST HARNESS

## Objective

Review the existing Crib codebase and Tenant Self-Service Portal.

Execute a full tenant lifecycle workflow end-to-end using the Workflow Engine (NOT ad-hoc tests).

Validate:

- authentication
- lease lifecycle
- rent payments
- maintenance
- inspections
- messaging
- documents
- notifications
- wallet + statements

Identify failures, root causes, and system gaps.

---

# WORKFLOW: TENANT LIFECYCLE END-TO-END

## Phase 0 — System Setup Validation

### Step 0.1: Verify tenant exists
- Ensure tenant user exists
- Role = tenant
- Has lease, unit, landlord relationship

### Step 0.2: Verify portal boot
- Load /portal
- Validate auth, redirect, session

---

# PHASE 1 — LEASE ONBOARDING FLOW

## Step 1.1: Load lease
GET /leases/{tenant_id}

## Step 1.2: Lease confirmation
PATCH /leases/{id}/confirm

## Step 1.3: Lease PDF
GET /leases/{id}/pdf

---

# PHASE 2 — RENT PAYMENT FLOW

## Step 2.1: Rent status
GET /leases/{id}/rent-status

## Step 2.2: Initiate payment
POST /payments/initiate

## Step 2.3: Payment confirmation
GET /payments/{id}

## Step 2.4: Ledger validation
GET /leases/{id}/ledger/entries

## Step 2.5: Statement
GET /leases/{id}/statement

---

# PHASE 3 — MAINTENANCE FLOW

## Step 3.1: Create request
POST /maintenance

## Step 3.2: Assign contractor
PATCH /maintenance/{id}/assign

## Step 3.3: Status updates
PATCH /maintenance/{id}/status

## Step 3.4: Upload photos
POST /maintenance/{id}/photos

---

# PHASE 4 — INSPECTIONS

GET /inspections
POST /inspections/{id}/sign

---

# PHASE 5 — MESSAGING

GET /messages
POST /messages

---

# PHASE 6 — DOCUMENTS (CRITICAL GAP)

GET /tenants/{id}/documents
POST /tenants/{id}/documents

---

# PHASE 7 — NOTIFICATIONS

GET /notifications
PATCH /notifications/{id}/read

---

# PHASE 8 — SETTINGS VALIDATION

GET /settings/public

---

# EXECUTION RULES

If failure occurs:
- identify root cause
- propose fix
- implement if safe
- rerun step

---

# OUTPUT

- Execution summary
- API errors
- DB issues
- frontend issues
- missing features
"""