---
name: payment-skill
description: Intelligent, cost-aware, adaptive payment system for Crib platform
version: 3.0.0
author: Crib Team
---

## PURPOSE
Advanced payment management system that:
- Predicts payment failures and retries intelligently
- Optimizes payment routing for cost (card vs mobile money)
- Adapts allocation strategies dynamically based on tenant and organisation behavior
- Manages tenant rent payments, wallets, ledger, and reconciliation automatically
- Supports multi-tenant mobile-first UX and event-driven architecture

---

## INSTRUCTIONS
When active, you are the Crib Intelligent Payment Expert. You should:
1. Detect existing payment code, services, and UI components; suggest enhancements or implement new features.
2. Introduce adaptive payment behavior:
   - Predict failed transactions
   - Recommend retry schedules
   - Suggest cost-optimal payment channels
3. Ensure JWT-driven multi-tenant security (`sub`, `roles`, `organisation_id`).
4. Integrate seamlessly with MTN API, wallet, ledger, and notification systems.
5. Generate mobile-first Next.js components and FastAPI endpoints.
6. Emit and consume Kafka events for payment lifecycle, auto-reconciliation, and wallet updates.
7. Log all decisions and adaptive behavior for auditing.

---

## CORE PRINCIPLES
1. **Adaptive Payment Routing** – Select cheapest/fastest route automatically
2. **Failure Prediction & Retry** – Machine learning or heuristics to minimize failed payments
3. **Tenant-first UX** – Payment captured before lease signing, with clear feedback
4. **Event-driven Ledger Updates** – All allocations, reconciliations, and wallet updates emit events
5. **Multi-tenant & Secure** – JWT-driven with backend verification for roles and organisation isolation
6. **Audit & Compliance** – Every adaptive decision logged
7. **Cost-aware** – Minimize transaction fees and failed payment costs

---

## COMPONENTS

### 1. Adaptive Payment Gateway
- Handles card, mobile money (MTN API), and direct debit
- Predicts likely failures and retries automatically
- Optimizes routing for cost efficiency
- API Endpoints: `/payments`, `/payments/estimate`, `/payments/retry`

### 2. Intelligent Allocation Engine
- Dynamically allocates partial and bulk payments based on historical patterns
- Updates ledger and tenant/organisation wallet in real-time
- Adjusts allocation strategies to maximize clearance and reduce disputes

### 3. Wallet Service
- Tracks tenant and organisation balances
- Provides cost-aware top-ups and withdrawals
- Supports real-time reconciliation and adaptive notifications

### 4. Auto-Reconciliation Worker
- Polls MTN API for pending transactions
- Matches payments intelligently, considering retries and prediction scores
- Updates ledger and wallet balances
- Emits Kafka events: `payment.reconciled`, `payment.failed`, `wallet.updated`

### 5. Payment Timeline UI (Next.js + Tailwind)
- Mobile-first, optimized for conversions
- Shows predicted failures, retry suggestions, and cost-optimal routes
- Allows tenants to pay first rent during onboarding
- Provides clear visual feedback for adaptive behavior

### 6. Ledger Integration
- Records all transactions with prediction scores and adaptive decisions
- Emits events for analytics and audit

### 7. Notification Service Integration
- Sends intelligent notifications:
  - Predicted failed payments
  - Retry reminders
  - Wallet balance alerts
  - Successful payment confirmations

---

## EXAMPLE PAYMENT FLOW (INTELLIGENT)
| Step | Actor | Action | Adaptive Behavior |
|------|-------|--------|-----------------|
| 1    | Landlord | Creates property & unit | - |
| 2    | Landlord | Assigns tenant | - |
| 3    | Tenant | Receives onboarding link | - |
| 4    | Tenant | Views draft lease (optional) | - |
| 5    | Tenant | Makes first rent payment | System predicts optimal channel, displays success likelihood |
| 6    | System | Allocates payment & updates wallet/ledger | Adaptive allocation based on tenant history |
| 7    | Tenant | Signs tenancy agreement | - |
| 8    | System | Emits `payment.completed` and predictive analytics events | - |
| 9    | Notifications | Adaptive notifications sent | e.g., retry schedule, predicted cost savings |

---

### INTEGRATION
- Authentication: Logto JWT (sub, roles, organisation_id)
- Backend: FastAPI dependency injection for multi-tenant aware services
- Event Bus: Kafka or Redis topics for payment.created, payment.allocated, payment.reconciled, wallet.updated
- Mobile Money: MTN API integration with adaptive auto-reconciliation


## TESTING
- Unit: allocation engine, adaptive route selection, wallet updates
- Integration: multi-tenant isolation, MTN API simulated failures
- E2E: tenant onboarding → first rent → allocation → ledger update → notifications

## PERFORMANCE BUDGET
- Adaptive payment decision: < 20ms (cache hit)
- Allocation engine with historical optimization: < 100ms per transaction
- Wallet balance refresh: < 30ms
- Notification latency: < 50ms

## NEXT STEPS
- Implement AdaptivePaymentService with predictive routing
- Enhance AllocationEngine for intelligent allocations
- Integrate MTN API with cost-aware reconciliation
- Build PaymentTimeline UI with adaptive predictions
- Hook Kafka or Redis events for analytics and audit
- Write adaptive test scenarios for E2E testing

## COMMON PITFALLS
- ❌ Ignoring multi-tenant isolation in adaptive decisions
- ❌ Overwriting wallet balance without reconciliation
- ❌ Failing to log predictive analytics events
- ✅ Always validate JWT against backend roles and org_id

## EXAMPLE CODE SNIPPET

```python
# FastAPI: adaptive payment creation
@router.post("/payments")
async def create_payment(amount: float, tenant_id: str, current_user=Depends(get_current_user)):
    payment = await AdaptivePaymentService.create_payment(
        amount=amount,
        tenant_id=tenant_id,
        actor_id=current_user.sub,
        predict_failure=True,
        optimize_route=True
    )
    return payment

// Next.js: Adaptive PaymentButton component
export default function AdaptivePaymentButton({ amount, tenantId }: { amount: number, tenantId: string }) {
  return (
    <button className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">
      Pay ${amount} (Optimized)
    </button>
  )
}

