---
name: onboarding-skill
description: Intelligent, adaptive, and secure onboarding for Crib platform
version: 3.0.0
author: Crib Team
---

## PURPOSE
End-to-end tenant onboarding for Crib that:
- Enables landlords or agencies to create properties and link tenants
- Sends tenant onboarding links with adaptive scheduling and reminders
- Captures payment before final lease signing
- Provides tenants with a mobile-first onboarding experience, including document preview, payment, and profile setup
- Supports multi-tenant management and role-based access control
- Tracks onboarding progress for audit and operational reporting

---

## INSTRUCTIONS
When active, you are the Crib Onboarding Expert. You should:
1. Detect existing onboarding flows and suggest enhancements or implement new features
2. Guide the tenant through:
   - Receiving an onboarding link
   - Viewing property and lease templates
   - Making first rent/payment securely before signing final lease
   - Completing profile and document submission
3. Integrate with Logto JWT for multi-tenant awareness (`sub`, `roles`, `organisation_id`)
4. Emit and consume Kafka or Redis events for onboarding lifecycle: `onboarding.started`, `onboarding.payment.completed`, `onboarding.completed`
5. Provide mobile-first Next.js components for adaptive UX and progress tracking
6. Allow landlords and agencies to monitor tenant onboarding progress and resend links

---

## CORE PRINCIPLES
1. **Payment-first before lease signing** – Ensure tenant commits financially before final agreement
2. **Adaptive and mobile-first UX** – Flow adapts based on device, engagement, and tenant behavior
3. **Multi-tenant secure design** – JWT-driven access and organisation scoping
4. **Event-driven orchestration** – Onboarding progress triggers notifications, analytics, and payment reconciliation
5. **Audit & compliance** – Track all actions for legal and operational purposes
6. **Retry & reminders** – Automated resend and reminder logic for incomplete onboarding

---

## COMPONENTS

### 1. Onboarding Service (Backend)
- Generates tenant onboarding links
- Tracks onboarding stages: link sent → payment → agreement preview → document submission → completion
- Validates payments before lease signing
- API Endpoints: `/onboarding/start`, `/onboarding/progress`, `/onboarding/complete`

### 2. Onboarding UI (Next.js)
- Mobile-first, adaptive flow
- Stepper showing progress: Property info → Profile → Lease preview → Documentation → Payment → Lease signing → Completion
- Supports preview of lease templates before payment
- Allows secure submission of documents and tenant info
- Shows dynamic reminders for incomplete steps

### 3. Payment Integration
- Integrated with Crib Payment Skill
- Tenant can pay first rent / deposit before signing final lease
- Captures payment confirmation and updates onboarding progress
- Emits `onboarding.payment.completed` event for ledger & notification sync

### 4. Notifications & Reminders
- Integrated with Notification Skill
- Sends reminders for incomplete onboarding steps
- Sends confirmations for payment and completed onboarding
- Adaptive scheduling for best engagement

### 5. Multi-Tenant Management
- JWT-driven access: roles and organisation scoping (`sub`, `roles`, `organisation_id`)
- Landlords manage only their properties and tenants
- Agencies manage properties on behalf of landlords
- Admin dashboards for progress tracking and link management

### 6. Analytics & Feedback
- Tracks completion rates, payment success, document submission
- Provides insights for landlords/agencies
- Adaptive improvements for flow based on tenant behavior

---

## EXAMPLE USE CASES

| Stage | Action | Trigger/Event | Tenant Impact |
|-------|--------|---------------|---------------|
| Link Generation | Landlord creates tenant record | `/onboarding/start` | Tenant receives onboarding link via email/SMS |
| Payment | Tenant pays first rent | `payment.completed` | Unlocks lease signing step |
| Lease Preview | Tenant views template | `onboarding.payment.completed` | Tenant reviews agreement before final signing |
| Profile & Document Submission | Tenant fills profile, uploads documents | `/onboarding/progress` | Moves towards completion |
| Completion | Tenant completes onboarding | `/onboarding/complete` | Triggers welcome notification, system updates ledger & tenant record |

---
## INTEGRATION
- Authentication: Logto JWT (sub, roles, organisation_id)
- Backend: FastAPI dependency injection, multi-tenant aware onboarding service
- Event Bus: Kafka or Redis topics for onboarding, payment, and notifications
- UI: Mobile-first Next.js components for stepper and progress tracking
- Payment: Integrated with Crib Payment Skill for pre-lease rent capture

## TESTING
- Unit: step completion logic, link generation, payment validation
- Integration: multi-tenant access control, event flows, notification triggers
- E2E: landlord creates tenant → tenant receives link → payment → lease preview → profile → completion → notification

## PERFORMANCE BUDGET
- Link generation: < 50ms
- Step progress update: < 30ms
- Payment validation: < 100ms
- Notification trigger: < 50ms

## NEXT STEPS
- Implement OnboardingService with adaptive step logic
- Integrate Payment Skill to capture first rent before lease signing
- Connect Notification Skill for reminders and confirmations
- Build mobile-first Next.js onboarding flow with stepper
- Connect Kafka events for auditing, analytics, and adaptive improvements
- Write comprehensive test suites for E2E, multi-tenant, and payment integration

## COMMON PITFALLS
- ❌ Allowing tenants to access lease signing before payment
- ❌ Ignoring tenant preferences for notifications
- ❌ Not enforcing multi-tenant isolation in agency-managed properties
- ✅ Always validate JWT and actor roles before link generation or step progress


## EXAMPLE CODE SNIPPETS

```python
# FastAPI: start tenant onboarding
@router.post("/onboarding/start")
async def start_onboarding(tenant_id: str, current_user=Depends(get_current_user)):
    link = await OnboardingService.generate_link(
        tenant_id=tenant_id,
        actor_id=current_user.sub,
        organisation_id=current_user.organisation_id
    )
    await NotificationService.send(
        tenant_id=tenant_id,
        event="onboarding.link.sent",
        channel="email"
    )
    return {"link": link}


// Next.js: Tenant Onboarding Stepper
export default function TenantOnboarding({ tenantId }) {
  const [step, setStep] = useState(0);

  return (
    <div className="p-4 max-w-md mx-auto">
      <Stepper currentStep={step} steps={["Payment", "Lease Preview", "Profile", "Completion"]} />
      {step === 0 && <PaymentStep tenantId={tenantId} onNext={() => setStep(1)} />}
      {step === 1 && <LeasePreviewStep tenantId={tenantId} onNext={() => setStep(2)} />}
      {step === 2 && <ProfileStep tenantId={tenantId} onNext={() => setStep(3)} />}
      {step === 3 && <CompletionStep tenantId={tenantId} />}

      Add any missing steps

    </div>
  )
}
