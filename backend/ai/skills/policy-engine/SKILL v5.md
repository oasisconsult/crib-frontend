
---

# **Policy Engine Skill Specification (v5.0)**  
Dynamic, adaptive, multi‑tenant policy engine for the Crib Platform  
(FastAPI + Next.js + Redis/Kafka)

---

## **Metadata**
```
name: policy-engine-skill
description: Dynamic, intelligent, multi-tenant policy engine for Crib platform (FastAPI + Next.js)
version: 5.0.0
author: Crib Team
```

---

# **1. Purpose**

The Policy Engine provides **centralized, dynamic, UI‑managed access control** across the Crib platform.  
It enforces:

- Role‑based access  
- Resource‑based permissions  
- JSONLogic conditional rules  
- Multi‑tenant isolation  
- Auditability & event sourcing  
- Real‑time policy updates without redeploys  

The engine is designed for **high performance**, **explainability**, and **safe delegation** to non‑technical administrators.

---

# **2. Claude Instructions (Skill Behavior)**

When this skill is active, you act as the **Crib Policy Engine Expert**. You must:

1. Evaluate access requests using roles, permissions, resource attributes, and JSONLogic.  
2. Consider JWT claims (`sub`, `roles`, `organisation_id`) for multi‑tenant enforcement.  
3. Provide **FastAPI backend code** using the services pattern (no repositories).  
4. Provide **Next.js TypeScript code** for policy CRUD, testing, conflict detection, and audit viewer.  
5. Support dynamic policies editable via UI without backend redeploys.  
6. Integrate event sourcing (Redis/Kafka) for policy lifecycle events.  
7. Suggest caching, conflict resolution, and performance optimizations.  
8. Always return **concrete, runnable examples**.

---

# **3. Core Principles**

| Principle | Implementation |
|----------|----------------|
| **Deny‑by‑default** | No matching allow → request denied. |
| **Multi‑tenant isolation** | All queries filtered by `organisation_id` with inheritance rules. |
| **Declarative rules** | JSONLogic with `user`, `resource`, `context`. |
| **Explainability** | Engine returns a `PolicyDecision` object, not just boolean. |
| **Event‑driven** | Policy changes emit structured events. |
| **High performance** | Redis caching, batch evaluation, async audit logging. |
| **UI‑managed** | Admins create/update policies without code changes. |
| **Conflict detection** | Prevent overlapping or shadowed rules. |

---

# **4. Policy Model (SQLAlchemy)**

### **4.1 Enhancements Added in v5**
- **Policy inheritance mode**  
- **Policy tags**  
- **Policy expiry**  
- **Field‑level constraints**  
- **Scope semantics** (resource ownership, assignment, hierarchy)  
- **Immutability flag** for compliance policies  

### **4.2 Model Definition**

```python
class Policy(Base):
    __tablename__ = "policies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organisation_id = Column(UUID(as_uuid=True), nullable=True)  # null = global
    name = Column(String, nullable=False)
    description = Column(String)

    resource_type = Column(String, nullable=False)
    action = Column(String, nullable=False)

    effect = Column(String, nullable=False)  # allow | deny
    mode = Column(String, default="conditional")  # static | conditional | delegated | rate_limited

    condition = Column(JSON, nullable=True)  # JSONLogic
    field_constraints = Column(JSON, nullable=True)  # optional field-level rules

    priority = Column(Integer, default=0)
    tags = Column(JSON, default=list)

    inheritance = Column(String, default="global_then_org")  
    immutable = Column(Boolean, default=False)
    expires_at = Column(DateTime, nullable=True)

    version = Column(Integer, default=1)
    created_by = Column(UUID(as_uuid=True))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
```

---

# **5. PolicyService (Backend)**

### **5.1 Responsibilities**
- CRUD operations  
- Policy evaluation  
- Conflict detection  
- Audit logging  
- Event publishing  
- Cache management  
- Policy context building  

### **5.2 Key Methods**
- `get_matching_policies(org_id, resource_type, action)`  
- `check(user, resource, action, context) -> PolicyDecision`  
- `create_policy(data, created_by)`  
- `update_policy(id, data)`  
- `delete_policy(id)`  
- `detect_conflicts(policy)`  
- `_publish_event(event_type, payload)`  
- `_audit(decision)`  

---

# **6. Policy Evaluation**

### **6.1 PolicyDecision Object**
Instead of returning a boolean, return:

```json
{
  "allowed": true,
  "policy_id": "uuid",
  "reason": "Matched allow rule",
  "priority": 10,
  "evaluated": 4,
  "cache_hit": true,
  "explain": "User is owner of property"
}
```

### **6.2 Evaluation Flow**
1. Build evaluation context (`user`, `resource`, `context`).  
2. Fetch policies (cached).  
3. Apply inheritance rules.  
4. Sort by priority.  
5. Evaluate JSONLogic.  
6. Return `PolicyDecision`.  
7. Emit `policy.evaluated` event.  

---

# **7. Caching Strategy**

### **7.1 Cache Keys**
```
policy:{org_id}:{resource_type}:{action}:{cache_version}
```

### **7.2 Cache Versioning**
Increment:

```
policy_cache_version:{org_id}
```

Whenever a policy changes.

### **7.3 Batch Evaluation**
Fetch once → evaluate many resources in memory.

---

# **8. Event System**

### **8.1 Topics**
- `policy.created.v1`
- `policy.updated.v1`
- `policy.deleted.v1`
- `policy.evaluated.v1`
- `policy.conflict_detected.v1`

### **8.2 Consumers**
- Cache invalidator  
- Audit logger  
- Admin notification service  
- Analytics pipeline  

---

# **9. Frontend (Next.js + TypeScript)**

### **9.1 Features**
- Policy list  
- Policy form (JSONLogic builder + visual editor)  
- Conflict detector  
- Policy simulator  
- Audit log viewer  
- Policy snapshots  
- Policy version diff viewer  

### **9.2 API Client**
```typescript
export const policyApi = {
  list: () => api.get('/policies'),
  create: (data) => api.post('/policies', data),
  update: (id, data) => api.put(`/policies/${id}`, data),
  delete: (id) => api.delete(`/policies/${id}`),
  test: (payload) => api.post('/policies/check', payload),
  conflicts: (payload) => api.post('/policies/conflicts', payload),
};
```

---

# **10. Intelligent Features**

### **10.1 Conflict Detection**
Detect:

- Shadowed rules  
- Overlapping allow/deny  
- Unreachable policies  
- Priority inversions  

### **10.2 Natural‑Language Rule Explanation**
Convert JSONLogic → human readable summary.

### **10.3 Policy Insights Dashboard**
- Most triggered policies  
- Most denied actions  
- Unused policies  
- Risky policies  
- Slowest evaluations  

### **10.4 Auto‑Generated Policies**
When new resource types appear.

---

# **11. Testing Strategy**

| Test Type | Scope |
|-----------|--------|
| Unit | JSONLogic, PolicyService, conflict detection |
| Integration | Multi‑tenant isolation, inheritance, caching |
| E2E | Admin updates → evaluation changes → events emitted |
| Property‑based | Randomized user/resource/context fuzzing |
| Snapshot | Policy evaluation matrix snapshots |

---

# **12. Performance Budget**

| Operation | Target p99 |
|-----------|------------|
| Cache hit | < 3ms |
| Cache miss | < 20ms |
| Batch (100 resources) | < 80ms |
| CRUD + event publish | < 50ms |

---

# **13. Implementation Roadmap (v5)**

1. Implement enhanced Policy model  
2. Add PolicyDecision object  
3. Add inheritance modes  
4. Add conflict detection engine  
5. Add cache versioning  
6. Add PolicyContextBuilder  
7. Build Next.js visual rule builder  
8. Add insights dashboard  
9. Add delegated policy mode  
10. Add policy snapshots + version diff  

---

# **14. Common Pitfalls & Safeguards**

### **Avoid**
❌ Overlapping policies without conflict detection  
❌ Storing roles only in JWT  
❌ Blocking audit logging  
❌ Allowing org admins to modify immutable policies  
❌ Not validating JSONLogic  

### **Do**
✅ Always log denied evaluations  
✅ Use async audit logging  
✅ Use cache versioning  
✅ Validate JSONLogic before saving  
✅ Enforce multi‑tenant boundaries  
