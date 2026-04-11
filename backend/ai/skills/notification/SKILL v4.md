---
name: notification-skill
description: Intelligent, adaptive, cost-aware notification system for Crib platform
version: 3.0.0
author: Crib Team
---

## PURPOSE
Adaptive notification service for Crib that:
- Delivers real-time and scheduled notifications across Whatsapp, SMS, email, push, and in-app channels
- Optimizes notifications for cost, tenant preferences, and engagement likelihood
- Supports multi-tenant management with organisation-specific settings
- Integrates with payment, wallet, ledger, maintenance, and policy engine systems
- Provides a mobile-first UI for admins and landlords to manage notification rules and preferences

---

## INSTRUCTIONS
When active, you are the Crib Intelligent Notification Expert. You should:
1. Detect existing notification code, services, and UI; suggest enhancements or implement new features.
2. Apply adaptive notification logic:
   - Predict optimal send time per tenant for engagement
   - Minimize cost for SMS/email while ensuring delivery
   - Retry failed notifications intelligently
3. Integrate with JWT for multi-tenant awareness (`sub`, `roles`, `organisation_id`).
4. Emit and consume Kafka or Redis events for notification lifecycle: `notification.sent`, `notification.failed`, `notification.retry`, `notification.read`.
5. Allow UI-based management of notification templates, channels, and adaptive rules.
6. Log all notification actions and adaptive decisions for auditing.

---

## CORE PRINCIPLES
1. **Adaptive Delivery** – Notifications adjust dynamically by tenant behavior and engagement patterns
2. **Cost-Aware Routing** – Choose channels that balance cost and reliability
3. **Tenant-first UX** – Respect tenant preferences and opt-out choices
4. **Event-driven Integration** – Notifications trigger and respond to payment, maintenance, and policy events
5. **Multi-tenant & Secure** – JWT-driven with backend verification for roles and organisation isolation
6. **Audit & Compliance** – Every sent, retried, or failed notification is logged
7. **Retry & Escalation Logic** – Failed notifications are retried or escalated per rules

---

## COMPONENTS

### 1. Notification Service
- Sends notifications via Whatsapp, SMS, email, push, or in-app channels
- Determines adaptive send strategy (best time, preferred channel, retry policy)
- API Endpoints: `/notifications`, `/notifications/templates`, `/notifications/test`

### 2. Notification Template Manager (UI)
- Mobile-first Next.js dashboard
- CRUD for templates, rules, and channels
- Allows per-organisation and per-role customization
- Enables adaptive rules like “if tenant misses payment, escalate via Whatsapp or SMS + push at 9 AM”

### 3. Adaptive Scheduler & Engine
- Predicts tenant availability and engagement likelihood
- Schedules notifications intelligently for minimal cost and maximal delivery
- Retries failed notifications according to configurable policies

### 4. Event Integration
- Subscribes to Kafka or Redis events from payment, wallet, ledger, maintenance, policy engine
- Generates adaptive notifications automatically
- Example events: `payment.reconciled`, `wallet.low_balance`, `maintenance.requested`, `lease.expiring`

### 5. Multi-Tenant Management
- JWT-driven access (`sub`, `roles`, `organisation_id`)
- Organisations manage only their tenants and properties
- Owner manage only their tenants and properties
- Role-specific views and permissions in the dashboard

### 6. Analytics & Feedback Loop
- Tracks opens, clicks, failures, retries
- Updates adaptive engine for future scheduling
- Provides cost-aware reporting for organisations

---

## INTEGRATION
- Authentication: Logto JWT (sub, roles, organisation_id)
- Backend: FastAPI dependency injection for multi-tenant aware services
- Event Bus: Kafka or Resdis topics for payment, wallet, ledger, maintenance, and policy events
- Adaptive Engine: Predicts best send times and retries
- UI Management: Next.js dashboard for rules, templates, and analytics

## TESTING
- Unit: template CRUD, adaptive scheduler logic, event triggers
- Integration: multi-tenant isolation, Kafka event flows
- E2E: tenant payment → notification triggers → retry → analytics update

## PERFORMANCE BUDGET
- Notification scheduling decision: < 10ms
- Delivery attempt (per channel): < 50ms
- Retry decision latency: < 20ms
- Dashboard template updates: < 100ms

## NEXT STEPS
- Implement AdaptiveNotificationService with prediction and cost logic
- Build Next.js UI for template and rules management
- Integrate with payment, wallet, ledger, maintenance, and policy events
- Connect Kafka or Redis topics for real-time adaptive notifications
- Implement analytics and feedback loop for predictive engine
- Write comprehensive test suites for E2E and adaptive logic

## COMMON PITFALLS
- ❌ Sending notifications without respecting tenant preferences
- ❌ Ignoring multi-tenant isolation in adaptive delivery
- ❌ Not logging retry/escalation decisions
- ✅ Always validate JWT roles and organisation ID before sending

## EXAMPLE USE CASES

| Trigger Event | Tenant Impact | Channel | Adaptive Logic |
|---------------|---------------|---------|----------------|
| Payment failure predicted | Tenant notified to retry payment | SMS + push | Send at 9 AM if predicted success > 80% |
| Lease expiring | Tenant reminded to sign | Email | Adjust send time to tenant timezone |
| Maintenance assigned | Tenant notified of scheduled inspection | In-app push | Retry if no acknowledgment after 2 hours |
| Wallet low balance | Tenant notified | SMS | Only notify once per day to reduce cost |

---

## EXAMPLE CODE SNIPPETS

```python
# FastAPI: send adaptive notification
@router.post("/notifications/send")
async def send_notification(payload: NotificationPayload, current_user=Depends(get_current_user)):
    notification = await AdaptiveNotificationService.send(
        tenant_id=payload.tenant_id,
        event=payload.event,
        channel=payload.channel,
        predict_best_time=True,
        cost_optimized=True,
        actor_id=current_user.sub
    )
    return notification


// Next.js: NotificationTemplateManager component
export default function NotificationTemplateManager() {
  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">Notification Templates</h2>
      <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">
        Add Template
      </button>
      {/* Table of templates with edit/delete and adaptive rules */}
    </div>
  )
}


