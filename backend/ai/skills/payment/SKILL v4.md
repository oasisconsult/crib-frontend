Absolutely — here is a **fully rewritten, upgraded, enterprise‑grade Payment Skill Specification (v4.0)**, matching the structure, depth, and clarity of your Policy Engine v5 spec.

This is now a **production‑ready engineering artifact**, suitable for architecture docs, onboarding, and implementation planning.

---

# **Payment Engine Skill Specification (v4.0)**  
Intelligent, adaptive, multi‑tenant payment system for the Crib Platform  
(FastAPI + Next.js + MTN Mobile Money + Ledger + Wallet + Kafka)

---

## **Metadata**
```
name: payment-skill
description: Intelligent, cost-aware, adaptive payment system for Crib platform
version: 4.0.0
author: Crib Team
```

---

# **1. Purpose**

The Payment Engine provides **intelligent, adaptive, cost‑aware payment processing** across the Crib platform.  
It handles:

- Rent payments  
- Wallet top‑ups  
- Ledger updates  
- Mobile money + card routing  
- Failure prediction  
- Retry scheduling  
- Auto‑reconciliation  
- Multi‑tenant financial isolation  
- Event‑driven accounting  

The system is designed for **high reliability**, **auditability**, and **tenant‑first mobile UX**.

---

# **2. Claude Instructions (Skill Behavior)**

When this skill is active, you act as the **Crib Intelligent Payment Expert**. You must:

1. Detect existing payment code and suggest improvements.  
2. Implement adaptive payment behavior:
   - Predict failures  
   - Recommend retry schedules  
   - Suggest cost‑optimal channels  
3. Enforce JWT‑driven multi‑tenant security (`sub`, `roles`, `organisation_id`).  
4. Integrate with MTN API, wallet, ledger, and notifications.  
5. Generate FastAPI endpoints + mobile‑first Next.js components.  
6. Emit and consume Kafka events for payment lifecycle.  
7. Log all adaptive decisions for audit and analytics.  
8. Always return **concrete, runnable examples**.

---

# **3. Core Principles**

| Principle | Implementation |
|----------|----------------|
| **Adaptive Routing** | Choose cheapest/fastest channel (card vs mobile money). |
| **Failure Prediction** | ML/heuristics predict failure likelihood before charging. |
| **Retry Intelligence** | Dynamic retry schedules based on prediction score. |
| **Event‑Driven Ledger** | All financial actions emit Kafka events. |
| **Multi‑Tenant Isolation** | Wallets, ledgers, and payments isolated by `organisation_id`. |
| **Auditability** | Every decision logged with reason + prediction score. |
| **Cost Awareness** | Minimize transaction fees and failed payment costs. |

---

# **4. Domain Models**

## **4.1 Payment**
Represents a high‑level payment request.

```
id, tenant_id, organisation_id
amount, currency
status (initiated, predicted, routed, pending, reconciled, allocated, completed, failed)
recommended_channel
predicted_failure_score
retry_strategy
created_at, updated_at
```

---

## **4.2 PaymentAttempt**
Tracks each attempt (including retries).

```
payment_id
attempt_number
channel_used
status (pending, success, failed)
failure_reason
cost
prediction_snapshot
created_at
```

---

## **4.3 PaymentDecision**
Returned by the engine instead of a boolean.

```json
{
  "status": "predicted",
  "allowed": true,
  "recommended_channel": "mtn_mobile_money",
  "predicted_failure_score": 0.78,
  "retry_strategy": "delayed",
  "cost_estimate": {
    "card": 3.2,
    "mobile_money": 1.1
  },
  "explain": "Mobile money cheaper and has higher success rate for this tenant"
}
```

---

## **4.4 Wallet**
Tracks balances for tenants and organisations.

```
id, owner_type (tenant/org)
balance
version
frozen (bool)
updated_at
```

Supports optimistic concurrency.

---

## **4.5 LedgerEntry**
Immutable double‑entry accounting.

```
id
debit_account
credit_account
amount
payment_id
metadata (prediction score, routing decision)
created_at
```

---

# **5. Payment State Machine**

```
initiated
  → predicted
  → routed
  → pending
  → reconciled
  → allocated
  → completed

Failure paths:
  → predicted_failure
  → retry_scheduled
  → permanently_failed
```

This ensures deterministic, auditable flows.

---

# **6. PaymentService (Backend)**

### **Responsibilities**
- Payment creation  
- Failure prediction  
- Routing optimization  
- Retry scheduling  
- Wallet + ledger updates  
- Reconciliation  
- Event publishing  
- Multi‑tenant enforcement  

### **Key Methods**
- `create_payment(...)`  
- `predict_failure(payment)`  
- `recommend_channel(payment)`  
- `schedule_retry(payment)`  
- `reconcile(payment)`  
- `allocate(payment)`  
- `update_wallets(payment)`  
- `write_ledger_entries(payment)`  
- `_publish_event(event_type, payload)`  

---

# **7. Adaptive Routing Engine**

### **Inputs**
- tenant history  
- org routing preferences  
- channel fees  
- MTN availability  
- time of day  
- amount  

### **Outputs**
- recommended channel  
- cost estimate  
- fallback channel  
- routing confidence score  

---

# **8. Failure Prediction Engine**

### **Features**
- tenant payment history  
- channel success rates  
- time‑based patterns  
- org‑level failure patterns  
- amount thresholds  

### **Outputs**
- `predicted_failure_score` (0–1)  
- recommended retry strategy  
- recommended channel  

### **Retry Strategies**
- immediate  
- delayed (5–30 minutes)  
- next‑day  
- manual intervention  

---

# **9. Reconciliation Worker**

### **Responsibilities**
- Poll MTN API  
- Match pending transactions  
- Detect duplicates  
- Detect stale transactions  
- Update wallet + ledger  
- Emit events  

### **Heuristics**
- fuzzy matching  
- amount tolerance  
- timestamp windows  
- retry attempt correlation  

---

# **10. Event System**

### **Topics**
- `payment.created.v1`
- `payment.predicted.v1`
- `payment.routed.v1`
- `payment.attempted.v1`
- `payment.reconciled.v1`
- `payment.failed.v1`
- `payment.retry_scheduled.v1`
- `wallet.updated.v1`
- `ledger.entry_created.v1`

### **Event Metadata**
- correlation_id  
- idempotency_key  
- prediction_snapshot  
- routing_snapshot  

---

# **11. Frontend (Next.js + Tailwind)**

### **Components**
- **PaymentTimeline** (mobile‑first)  
- **AdaptivePaymentButton**  
- **RetrySuggestionBanner**  
- **CostComparisonCard**  
- **PaymentStatusTracker**  

### **API Client**
```typescript
export const paymentApi = {
  create: (data) => api.post('/payments', data),
  estimate: (data) => api.post('/payments/estimate', data),
  retry: (id) => api.post(`/payments/${id}/retry`),
  timeline: (id) => api.get(`/payments/${id}/timeline`)
}
```

---

# **12. Notification Engine**

### **Adaptive Notifications**
- predicted failure alerts  
- retry reminders  
- wallet low balance  
- successful payment confirmations  
- cost‑saving suggestions  

---

# **13. Testing Strategy**

| Test Type | Scope |
|-----------|--------|
| Unit | routing engine, prediction engine, wallet updates |
| Integration | MTN API failures, multi‑tenant isolation |
| E2E | onboarding → payment → allocation → ledger → notifications |
| Property‑based | randomized payment flows |
| Chaos testing | MTN outages, slow responses |
| Replay testing | historical event replays |

---

# **14. Performance Budget**

| Operation | Target p99 |
|-----------|------------|
| Adaptive decision | < 20ms |
| Allocation engine | < 100ms |
| Wallet update | < 30ms |
| Notification dispatch | < 50ms |
| Reconciliation cycle | < 200ms |

---

# **15. Implementation Roadmap (v4)**

1. Implement PaymentDecision + PaymentAttempt models  
2. Build AdaptiveRoutingEngine  
3. Build FailurePredictionEngine  
4. Implement state machine transitions  
5. Add reconciliation worker  
6. Add wallet versioning + freeze states  
7. Add ledger double‑entry bookkeeping  
8. Build PaymentTimeline UI  
9. Add Kafka event schemas  
10. Add insights dashboard  

---

# **16. Common Pitfalls & Safeguards**

### **Avoid**
❌ Mixing tenant/org wallets  
❌ Overwriting wallet balances  
❌ Missing ledger entries  
❌ Not logging prediction decisions  
❌ Not validating JWT claims  

### **Do**
✅ Use optimistic concurrency for wallets  
✅ Use idempotency keys for payments  
✅ Emit events for every state transition  
✅ Log prediction + routing snapshots  
✅ Enforce multi‑tenant boundaries  
