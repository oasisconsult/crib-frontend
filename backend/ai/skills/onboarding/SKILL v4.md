
---

# **Onboarding Engine Skill Specification (v4.0)**  
Intelligent, adaptive, multi‑tenant onboarding system for the Crib Platform  
(FastAPI + Next.js + Payment Skill + Notification Skill + Kafka)

---

## **Metadata**
```
name: onboarding-skill
description: Intelligent, adaptive, and secure onboarding for Crib platform
version: 4.0.0
author: Crib Team
```

---

# **1. Purpose**

The Onboarding Engine provides a **secure, adaptive, mobile‑first onboarding experience** for tenants, landlords, and agencies on the Crib platform.

It handles:

- Tenant onboarding link generation  
- Adaptive reminders and engagement optimization  
- Payment‑first onboarding (first rent before lease signing)  
- Lease preview and document submission  
- Multi‑tenant role‑based access  
- Real‑time onboarding progress tracking  
- Event‑driven orchestration across services  

The system is designed for **high conversion**, **security**, and **operational visibility**.

---

# **2. Claude Instructions (Skill Behavior)**

When this skill is active, you act as the **Crib Onboarding Expert**. You must:

1. Detect existing onboarding flows and suggest improvements.  
2. Guide tenants through:
   - Receiving onboarding link  
   - Viewing property + lease templates  
   - Making first rent payment  
   - Completing profile + document submission  
   - Signing final lease  
3. Enforce JWT‑driven multi‑tenant security (`sub`, `roles`, `organisation_id`).  
4. Emit and consume Kafka/Redis events for onboarding lifecycle.  
5. Provide mobile‑first Next.js components for onboarding UI.  
6. Provide FastAPI endpoints for onboarding orchestration.  
7. Log all onboarding decisions for audit and analytics.  
8. Always return **concrete, runnable examples**.

---

# **3. Core Principles**

| Principle | Implementation |
|----------|----------------|
| **Payment‑first onboarding** | Tenant must pay first rent before lease signing. |
| **Adaptive UX** | Flow adapts based on device, engagement, and tenant behavior. |
| **Multi‑tenant isolation** | JWT‑driven scoping for landlords, agencies, and tenants. |
| **Event‑driven orchestration** | Onboarding events trigger notifications, analytics, and payment workflows. |
| **Auditability** | Every step logged with timestamps and actor IDs. |
| **Reminder intelligence** | Automated reminders based on engagement patterns. |
| **Mobile‑first design** | Optimized for tenants onboarding via phone. |

---

# **4. Domain Models**

## **4.1 OnboardingSession**
Represents a tenant’s onboarding lifecycle.

```
id
tenant_id
organisation_id
property_id
unit_id
status (started, payment_pending, payment_completed, profile_pending, docs_pending, lease_pending, completed)
current_step
progress (0–100)
link_token (secure, expiring)
expires_at
created_at, updated_at
```

---

## **4.2 OnboardingStep**
Tracks granular step completion.

```
session_id
step (payment, lease_preview, profile, documents, signing)
status (pending, in_progress, completed)
completed_at
metadata
```

---

## **4.3 OnboardingDecision**
Returned by the engine to explain adaptive behavior.

```json
{
  "next_step": "payment",
  "requires_payment": true,
  "reminder_recommended": false,
  "explain": "Tenant has not completed payment; lease signing locked"
}
```

---

# **5. Onboarding State Machine**

```
started
  → payment_pending
  → payment_completed
  → profile_pending
  → docs_pending
  → lease_pending
  → completed

Failure paths:
  → expired
  → abandoned
  → payment_failed
```

This ensures deterministic, auditable onboarding flows.

---

# **6. OnboardingService (Backend)**

### **Responsibilities**
- Generate onboarding links  
- Validate link tokens  
- Track onboarding progress  
- Lock/unlock steps based on payment status  
- Integrate with Payment Skill  
- Integrate with Notification Skill  
- Emit onboarding lifecycle events  
- Enforce multi‑tenant access  

### **Key Methods**
- `start_onboarding(tenant_id, property_id, org_id)`  
- `get_progress(session_id)`  
- `advance_step(session_id, step)`  
- `mark_payment_completed(session_id)`  
- `complete_onboarding(session_id)`  
- `_publish_event(event_type, payload)`  

---

# **7. Adaptive Reminder Engine**

### **Inputs**
- tenant engagement history  
- time since last activity  
- device type  
- payment status  
- org preferences  

### **Outputs**
- reminder schedule  
- recommended channel (SMS/email/push)  
- urgency level  

### **Reminder Types**
- onboarding link not opened  
- payment not completed  
- documents not uploaded  
- lease not signed  

---

# **8. Payment Integration**

The onboarding engine integrates tightly with the **Payment Skill**:

### **Rules**
- Tenant **must** complete first rent payment before lease signing.  
- Payment completion triggers:
  - unlocking lease preview  
  - updating onboarding progress  
  - emitting `onboarding.payment.completed`  

### **Events Consumed**
- `payment.completed.v1`  
- `payment.failed.v1`  

### **Events Emitted**
- `onboarding.payment.completed.v1`  

---

# **9. Notifications & Engagement**

### **Notification Types**
- onboarding link sent  
- payment reminder  
- document reminder  
- lease signing reminder  
- onboarding completed  

### **Adaptive Scheduling**
- send reminders at optimal times based on tenant behavior  
- escalate if tenant is inactive  
- reduce reminders if tenant is progressing quickly  

---

# **10. Frontend (Next.js + Tailwind)**

### **Components**
- **OnboardingStepper**  
- **PaymentStep**  
- **LeasePreviewStep**  
- **ProfileStep**  
- **DocumentUploadStep**  
- **LeaseSigningStep**  
- **CompletionScreen**  

### **Features**
- mobile‑first  
- adaptive step unlocking  
- progress tracking  
- secure link validation  
- payment integration  

### **API Client**
```typescript
export const onboardingApi = {
  start: (data) => api.post('/onboarding/start', data),
  progress: (id) => api.get(`/onboarding/${id}/progress`),
  completeStep: (id, step) => api.post(`/onboarding/${id}/steps/${step}/complete`),
  complete: (id) => api.post(`/onboarding/${id}/complete`)
}
```

---

# **11. Event System**

### **Topics**
- `onboarding.started.v1`
- `onboarding.link.sent.v1`
- `onboarding.payment.completed.v1`
- `onboarding.step.completed.v1`
- `onboarding.completed.v1`
- `onboarding.reminder.sent.v1`

### **Event Metadata**
- session_id  
- tenant_id  
- organisation_id  
- step  
- actor_id  
- timestamp  

---

# **12. Analytics & Insights**

### **Metrics**
- onboarding completion rate  
- payment‑first conversion rate  
- average onboarding duration  
- drop‑off points  
- reminder effectiveness  
- document submission delays  

### **Insights**
- identify friction points  
- recommend UX improvements  
- detect tenants needing manual intervention  

---

# **13. Testing Strategy**

| Test Type | Scope |
|-----------|--------|
| Unit | step logic, link generation, token validation |
| Integration | payment integration, notifications, multi‑tenant access |
| E2E | landlord creates tenant → tenant completes onboarding |
| Property‑based | random onboarding flows |
| Chaos testing | expired links, partial progress |
| Replay testing | historical onboarding sessions |

---

# **14. Performance Budget**

| Operation | Target p99 |
|-----------|------------|
| Link generation | < 50ms |
| Progress update | < 30ms |
| Payment validation | < 100ms |
| Reminder scheduling | < 50ms |

---

# **15. Implementation Roadmap (v4)**

1. Implement OnboardingSession + OnboardingStep models  
2. Build OnboardingService with state machine  
3. Integrate Payment Skill for payment‑first flow  
4. Build adaptive reminder engine  
5. Build mobile‑first Next.js onboarding UI  
6. Add Kafka event schemas  
7. Add analytics dashboard  
8. Add abandoned onboarding detection  

---

# **16. Common Pitfalls & Safeguards**

### **Avoid**
❌ Allowing lease signing before payment  
❌ Not enforcing multi‑tenant boundaries  
❌ Not validating link tokens  
❌ Missing onboarding events  
❌ Over‑notifying tenants  

### **Do**
✅ Validate JWT roles + org_id  
✅ Lock/unlock steps based on payment status  
✅ Emit events for every step  
✅ Log all onboarding decisions  
✅ Use secure, expiring onboarding links  

---

# **17. Example Code Snippets**

### **FastAPI: Start Onboarding**
```python
@router.post("/onboarding/start")
async def start_onboarding(tenant_id: str, current_user=Depends(get_current_user)):
    session = await OnboardingService.start_onboarding(
        tenant_id=tenant_id,
        actor_id=current_user.sub,
        organisation_id=current_user.organisation_id
    )
    await NotificationService.send(
        tenant_id=tenant_id,
        event="onboarding.link.sent",
        channel="email"
    )
    return {"session_id": session.id, "link": session.link_token}
```

---

### **Next.js: Onboarding Stepper**
```tsx
export default function TenantOnboarding({ sessionId }) {
  const [step, setStep] = useState(0);

  return (
    <div className="p-4 max-w-md mx-auto">
      <Stepper
        currentStep={step}
        steps={["Payment", "Lease Preview", "Profile", "Documents", "Signing", "Done"]}
      />

      {step === 0 && <PaymentStep sessionId={sessionId} onNext={() => setStep(1)} />}
      {step === 1 && <LeasePreviewStep sessionId={sessionId} onNext={() => setStep(2)} />}
      {step === 2 && <ProfileStep sessionId={sessionId} onNext={() => setStep(3)} />}
      {step === 3 && <DocumentUploadStep sessionId={sessionId} onNext={() => setStep(4)} />}
      {step === 4 && <LeaseSigningStep sessionId={sessionId} onNext={() => setStep(5)} />}
      {step === 5 && <CompletionStep />}
    </div>
  )
}
```

---

If you want, I can also:

- Generate a **diagram pack** (state machine, architecture, event flow)  
- Produce a **starter repo** for FastAPI + Next.js onboarding  
- Create a **v5 roadmap** with AI‑assisted onboarding personalization  

Just tell me what direction you want to take next.