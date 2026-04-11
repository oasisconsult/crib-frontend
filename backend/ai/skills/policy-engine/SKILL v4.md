---

# **Policy Engine Skill Specification**

---
name: policy-engine-skill  
description: Dynamic, adaptive, and intelligent policy engine for Crib platform (FastAPI + Next.js)  
version: 4.2.0  
author: Crib Team  
---

## **1. Purpose**

Centralized policy engine that enforces **access controls, workflows, and business rules** across tenants, landlords, agencies, and staff in the Crib platform.

Centralized policy engine for enforcing dynamic access controls, workflows, and business rules across Crib platform.  
Enables tenants, landlords, agencies, and system admins to have flexible access based on roles, resources, and organisation scoping without code changes.  
Supports event-driven updates, multi-tenant awareness, and auditability.

Supports:

- Dynamic, UI‑managed policies without code changes  
- Multi‑tenant isolation  
- Full auditability  
- Declarative JSONLogic rules  
- Event‑driven updates  
- FastAPI + Next.js integration  

**Authentication**: Logto issues JWTs containing `sub`, `roles`, `organisation_id`  
**Backend**: FastAPI (Python) using **services pattern**  
**Frontend**: Next.js + TypeScript for policy management UI

---

## **2. Claude Instructions**

When this skill is active, you are the **Crib Policy Engine Expert**. You should:

1. Evaluate access requests against roles, permissions, resources, and JSONLogic conditions.  
2. Consider JWT claims (`sub`, `roles`, `organisation_id`) for multi‑tenant enforcement.  
3. Provide **FastAPI backend code** using `PolicyService` (no repositories) with async SQLAlchemy.  
4. Provide **Next.js TypeScript frontend** code for policy CRUD, testing panel, and audit viewer.  
5. Support dynamic policies editable via UI without backend redeploys.  
6. Integrate event sourcing (Kafka or Redis) for policy changes and audit logs.  
7. Suggest caching strategies, conflict resolution, and performance optimizations.  

Always respond with **concrete, runnable examples**.

---

## **3. Core Principles (Services Pattern)**

| Principle | Implementation |
|----------|----------------|
| JWT‑driven backend evaluation | FastAPI dependency extracts claims → fetch full user via `UserService`. |
| Dynamic, UI‑managed policies | Policies stored in PostgreSQL. CRUD via `PolicyService`. |
| Declarative, context‑aware rules | JSONLogic evaluated in Python using `user`, `resource`, `context`. |
| Tenant / Organisation awareness | Policies filtered by `organisation_id` (nullable = global). |
| Deny‑by‑default | No matching allow → request denied. |
| Audit & compliance | Every evaluation logged asynchronously. |
| Event‑driven | Policy changes emit Redis/Kafka events. |

---

## **4. Components**

### **4.1 Backend: Policy Model (SQLAlchemy)**

**File:** `app/models/policy.py`

```python
from sqlalchemy import Column, String, Integer, JSON, DateTime
from sqlalchemy.dialects.postgresql import UUID
from app.db import Base
import uuid
from datetime import datetime

class Policy(Base):
    __tablename__ = "policies"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organisation_id = Column(UUID(as_uuid=True), nullable=True)  # null = global template
    name = Column(String, nullable=False)
    description = Column(String)
    resource_type = Column(String, nullable=False)
    action = Column(String, nullable=False)
    effect = Column(String, nullable=False)  # "allow" or "deny"
    condition = Column(JSON, nullable=True)   # JSONLogic expression
    priority = Column(Integer, default=0)
    version = Column(Integer, default=1)
    created_by = Column(UUID(as_uuid=True))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
```

---

### **4.2 Backend: PolicyService (no repository)**

Core methods:

- `get_matching_policies(organisation_id, resource_type, action)`
- `check(user, resource, action, context) -> bool`
- `create_policy(policy_data, created_by)`
- `update_policy(policy_id, update_data)`
- `delete_policy(policy_id)`
- `_audit(...)` (async)
- `_publish_event(event_type, data)` (Redis/Kafka)

---

### **4.3 Policy Evaluator**

- JSONLogic evaluation  
- First matching policy by priority wins  
- Optional Redis caching (TTL 300s)  

---

### **4.4 Management UI (Next.js + TypeScript)**

**API Client** (`lib/api/policies.ts`):

```typescript
export const policyApi = {
  list: () => api.get<Policy[]>('/policies'),
  create: (data) => api.post<Policy>('/policies', data),
  update: (id, data) => api.put(`/policies/${id}`, data),
  delete: (id) => api.delete(`/policies/${id}`),
  test: (payload) => api.post<{ allowed: boolean }>('/policies/check', payload),
};
```

**UI Components**

- **PolicyList** – table view  
- **PolicyForm** – JSONLogic builder  
- **PolicyTester** – simulation panel  

---

### **4.5 Event System**

**Topics**

- `policy.created`
- `policy.updated`
- `policy.deleted`
- `policy.evaluated`

**Broker**: Redis pub/sub or Kafka  
**Subscribers**: Cache invalidator, audit logger, admin webhooks  

---

### **4.6 Caching & Optimisation**

- Redis key: `policy:{org_id}:{resource_type}:{action}`  
- TTL: 300 seconds  
- Batch evaluation for lists  
- Async audit logging  

---

## **5. Example Policies (JSONLogic)**

| Role | Resource | Action | Condition |
|------|----------|--------|-----------|
| superadmin | any | any | `true` |
| owner | property | update | `{"==":[{"var":"user.id"},{"var":"resource.owner_id"}]}` |
| manager | property | update | `{"in":[{"var":"user.id"},{"var":"resource.manager_ids"}]}` |
| tenant | lease | read | `{"==":[{"var":"user.id"},{"var":"resource.tenant_id"}]}` |
| tenant | payment | create | `{"and":[{"==":[{"var":"user.id"},{"var":"resource.tenant_id"}]},{"exists":"resource.signed_lease"}]}` |
| maintenance | inspection | create | `{"in":[{"var":"user.id"},{"var":"resource.assigned_staff_ids"}]}` |

---

## **6. Integration**

### **6.1 Authentication**
Logto JWT → FastAPI dependency → full user via `UserService`.

### **6.2 Backend Enforcement Example**

```python
async def enforce_policy(resource_type: str, action: str, resource_id: str, 
                         current_user: User = Depends(get_current_user),
                         policy_service: PolicyService = Depends(get_policy_service)):
    resource = await fetch_resource_brief(resource_type, resource_id)
    if not await policy_service.check(current_user, resource, action):
        raise HTTPException(status_code=403, detail="Policy denied")
```

### **6.3 Frontend**
Next.js app consumes:

- `/policies`
- `/policies/check`

### **6.4 Event Bus**
Redis or Kafka for policy change events.

---

## **7. Intelligent Features**

- Cost‑aware evaluation (cache + batching)  
- Adaptive suggestions from audit logs  
- Simulation mode (`dry_run=True`)  
- Auto‑generation of default policies  
- Event‑driven cache invalidation  

---

## **8. Testing**

| Test Type | Scope |
|-----------|--------|
| Unit | Policy evaluation, JSONLogic, PolicyService |
| Integration | Multi‑tenant isolation, cache invalidation |
| E2E | Admin updates policy → evaluation updates → events emitted |

---

## **9. Performance Budget**

| Operation | Target p99 |
|-----------|------------|
| Cache hit | < 3ms |
| Cache miss | < 20ms |
| Batch (100 resources) | < 80ms |
| CRUD + event publish | < 50ms |

---

## **10. Implementation Roadmap**

1. Define Policy model + PolicyService  
2. Implement JSONLogic evaluation  
3. Add Redis caching + event bus  
4. Build FastAPI CRUD endpoints  
5. Build Next.js admin UI  
6. Add auto‑generation + suggestions  
7. Load test + document API  

---

## **11. Common Pitfalls (Avoid These)**

❌ Storing roles only in JWT → stale permissions  
❌ Overlapping/conflicting policies without priority  
❌ Ignoring multi‑tenant boundaries  
❌ Blocking audit logging  
❌ Not validating JSONLogic before saving  

✅ Always log denied evaluations  
✅ Use `asyncio.create_task` for audit writes  
✅ Cache `get_matching_policies` results  

---