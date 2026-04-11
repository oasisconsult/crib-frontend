markdown
---
name: reconciliation-skill
description: Intelligent, automated, and adaptive reconciliation engine for Crib platform
version: 3.0.0
author: Crib Team
---

## PURPOSE

Automates reconciliation of tenant payments, wallet balances, and ledger entries across properties and organisations.  
Ensures financial correctness and trust by handling delayed payments, missing webhooks, manual entries, and partial matches.  
Supports multiple payment channels (MTN Mobile Money, bank transfers) and automatic matching to invoices or leases.  
Enables admins and landlords to view, resolve, and manage discrepancies efficiently.

---

## DOMAIN CONTEXT

Payments in Crib are **not always reliable in real-time** because:

- MTN Mobile Money may fail to send webhooks
- Bank transfers are manual and delayed
- Users may input incorrect references
- Network failures may interrupt flows

Reconciliation ensures every real-world payment is correctly reflected in the system.

---

## CLAUDE INSTRUCTIONS

When active, you are the Crib Reconciliation Expert. You should:

1. Automatically match incoming payments to ledger entries, invoices, or leases  
2. Support multi-tenant and multi-organisation scoping using JWT claims (`sub`, `roles`, `organisation_id`)  
3. Integrate with MTN API (or other payment providers) for real-time payment verification  
4. Emit reconciliation events to Kafka or Redis for audit, reporting, and downstream notifications  
5. Provide structured JSON/YAML output for backend and UI consumption  
6. Suggest optimization for partial payments, delayed payments, or payment disputes  
7. Recommend caching strategies and prioritization for high-volume reconciliation  
8. Enable adaptive behavior based on payment patterns and historical data

---

## CORE PRINCIPLES (NON-NEGOTIABLE)

| Principle | Implementation |
|-----------|----------------|
| Reconciliation is the source of truth fallback | Always re-verify payments when webhooks are missing or delayed |
| Payments must not remain pending indefinitely | Scheduled workers resolve pending states within defined SLA |
| Never overwrite confirmed payments | Once confirmed, payments become immutable |
| All matches must be auditable | Every reconciliation action logs actor, confidence, and source |
| No silent corrections — always log actions | Manual overrides require explicit approval and audit trail |
| Event-driven evaluation | All payment events trigger reconciliation workflows |
| Wallet & ledger sync | Tenant wallets and ledger entries remain consistent after each reconciliation |
| Deny-by-default / safe processing | Payments are not applied without proper matching |
| Multi-tenant aware | Only reconcile payments for the organisation and property scope of the actor |
| Adaptive intelligence | Prioritize likely matches using historical payment behavior |

---

## TARGET MODELS

This skill operates on:

- `Payment`
- `RentSchedule`
- `Deposit`
- `LateFee`
- `TenantWallet`
- `LedgerEntry`

---

## COMPONENTS

### 1. Reconciliation Worker
- Background job service that monitors incoming payments  
- Auto-matches payments with invoices or leases  
- Handles partial payments, overpayments, and unallocated funds  
- Integrates with MTN API for payment verification  
- Emits events: `payment.matched`, `payment.unmatched`, `payment.adjusted`

### 2. Payment Matching Engine
- Core logic for matching payments to ledger entries  
- Supports rule-based and ML-assisted matching  
- Configurable via UI for custom rules (e.g., match by tenant ID, reference, amount tolerance)  
- Handles multi-channel payments  
- Implements scoring: exact match (reference + amount) → strong match (phone + amount) → weak match (amount + time proximity)

### 3. Tenant Wallet Service
- Maintains accurate wallet balances for tenants  
- Updates balances after reconciliation  
- Supports manual adjustments by admins

### 4. Management UI (Next.js + Tailwind)
- View reconciliation dashboard with filters (organisation, property, date, status)  
- Resolve unmatched or partially matched payments  
- Manage reconciliation rules and thresholds  
- Mobile-first design  
- Manual review interface: view unmatched transactions, candidate matches, approve/reject, attach payment manually

### 5. Event Integration
- Kafka or Redis topics:
  - `reconciliation.started`
  - `payment.matched`
  - `payment.confirmed`
  - `payment.failed`
  - `payment.flagged`
  - `payment.adjusted`
- Enables downstream services (ledger updates, notifications, analytics)

### 6. Caching & Optimization
- Cache recent payment events for rapid re-evaluation  
- Batch processing for high-volume reconciliation  
- Intelligent retries for temporary failures in external API calls  
- TTL-based invalidation when payment status changes

---

## RECONCILIATION FLOW

### 1. Identify Candidates
Query payments where:
- status = `pending`
- method in (`mobile_money_mtn`, `bank_transfer`)
- created_at < now - X minutes

### 2. Fetch External Data
**MTN**: Query transaction status API using reference (externalId), phone number, amount.  
**Bank Transfers**: Import bank statement (CSV or API) extracting reference, sender name, amount, date.

### 3. Matching Engine
**Priority**:
1. Exact match → reference + amount
2. Strong match → phone + amount
3. Weak match → amount + time proximity

**Rules**:
- Match only ONE payment per transaction
- Avoid duplicate matching
- Flag ambiguous matches

**Scoring function**:
match_score = (reference_match * 0.6) + (amount_match * 0.3) + (time_proximity * 0.1)

text
**Thresholds**:
- ≥ 0.9 → auto-confirm
- 0.6–0.9 → flag for review
- < 0.6 → ignore

### 4. Apply Result
- **Matched**: Update `Payment.status → confirmed`, `Payment.paid_at → external timestamp`
- **Failed**: Update `Payment.status → failed`
- **Ambiguous**: Mark `Payment.status → pending_review`

### 5. Trigger Allocation
After confirmation, trigger payment allocation engine to update RentSchedule and Ledger.

---

## DUPLICATE DETECTION

Prevent same transaction from being applied twice:
- Unique constraint on `external_reference`
- Track processed transaction IDs

---

## SCHEDULER

Run reconciliation every 1–5 minutes.  
Worker responsibilities:
- Fetch pending payments
- Query providers
- Apply matching logic
- Emit events

---

## AUDIT LOGGING

Every reconciliation action must log:
- `payment_id`
- `action_taken`
- `match_confidence`
- `source` (MTN, bank, manual)
- `timestamp`

---

## FAILURE HANDLING

Handle:
- MTN API downtime
- malformed bank data
- missing references

Retry strategy: Retry up to N times with exponential backoff.

---

## SECURITY

- Validate external data sources
- Prevent spoofed webhook/reconciliation data
- Ensure strict organisation isolation (JWT `organisation_id` scope)

---

## TESTING REQUIREMENTS

Must test:
- MTN missing webhook scenario
- Duplicate transaction handling
- Partial matches
- Incorrect references
- High-volume reconciliation

---

## ANTI-PATTERNS (TO AVOID)

- ❌ Auto-confirm weak matches (below 0.9 score)
- ❌ Overwrite confirmed payments
- ❌ Skip audit logging
- ❌ Assume provider reliability
- ❌ Ignore tenant/organisation scoping
- ❌ Mishandle partial payments or overpayments
- ❌ Ignore event retries or failures in external API calls

---

## PERFORMANCE BUDGET

| Operation | Target latency |
|-----------|----------------|
| Auto-matching per payment (cache hit) | < 5ms |
| Auto-matching per payment (cache miss) | < 20ms |
| Batch reconciliation for 1,000 payments | < 2s |
| MTN API verification | < 1s per transaction (subject to provider SLA) |

---

## EXAMPLE SCENARIOS

| Tenant | Payment Channel | Invoice     | Amount  | Result        | Notes                    |
|--------|----------------|-------------|---------|---------------|--------------------------|
| t123   | MTN            | lease_001   | 50,000  | matched       | Exact match              |
| t456   | Bank Transfer  | lease_002   | 49,000  | partial       | 1,000 remaining          |
| t789   | MTN            | none        | 30,000  | unmatched     | Pending admin review     |

---

## EXTENSIBILITY

Must support:
- Multiple providers (MTN, Airtel, banks)
- AI-assisted matching (future)
- Real-time streaming reconciliation

---

## NEXT STEPS

1. Implement Reconciliation Worker with background job framework (Celery, RQ, or FastAPI BackgroundTasks)  
2. Integrate MTN API for real-time verification  
3. Build Payment Matching Engine with rule-based + ML-assisted matching  
4. Implement Wallet Service and ledger synchronization  
5. Build Next.js UI for dashboard, manual resolution, and rule management  
6. Integrate Kafka or Redis events for full audit trail and downstream updates  
7. Implement unit, integration, and E2E tests  

---

## EXAMPLE CLAUDE INTERACTION

**User**: "Tenant t123 paid 50,000 via MTN, match to lease_001"  

**Claude**:
```json
{
  "tenant_id": "t123",
  "payment_channel": "MTN",
  "invoice_id": "lease_001",
  "amount": 50000,
  "status": "matched",
  "match_score": 0.95,
  "wallet_update": "+50000",
  "ledger_entry": "updated"
}