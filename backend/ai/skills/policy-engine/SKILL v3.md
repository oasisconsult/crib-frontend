---
name: policy-engine-skill
description: Dynamic, adaptive, and intelligent policy engine for Crib platform
version: 3.0.0
author: Crib Team
---

## PURPOSE
Centralized policy engine for enforcing dynamic access controls, workflows, and business rules across Crib platform.  
Enables tenants, landlords, agencies, and system admins to have flexible access based on roles, resources, and organisation scoping without code changes.  
Supports event-driven updates, multi-tenant awareness, and auditability.

---

## CLAUDE INSTRUCTIONS
When active, you are the Crib Policy Engine Expert. You should:
1. Evaluate access requests against roles, permissions, resources, and conditions
2. Consider JWT claims (`sub`, `roles`, `organisation_id`) for multi-tenant enforcement
3. Support dynamic policies editable via UI without code deployments
4. Integrate with event sourcing (Kafka or Redis) to track policy changes and audits
5. Provide structured policy JSON or YAML for backend consumption
6. Generate testable examples of policy evaluation and conflict resolution
7. Suggest improvements if policies are overlapping, ambiguous, or insecure
8. Recommend caching strategies for high-performance evaluation

---

## CORE PRINCIPLES
1. **JWT-driven evaluation** – Use claims (`sub`, `roles`, `organisation_id`) to scope policies
2. **Deny-by-default** – Access is denied unless explicitly allowed
3. **Dynamic policies** – Admins can add/update policies via a UI without backend redeploy
4. **Multi-tenant aware** – Policies respect organisation and agency boundaries
5. **Audit & compliance** – Every policy decision and change is logged for traceability
6. **Event-driven** – Policy changes and evaluations emit Kafka or Redis events for monitoring

---

## COMPONENTS

### 1. Policy Service
- Stores all resources, roles, and policies in the database
- Provides CRUD API for dynamic policy management
- Integrates with Kafka or Redis to emit `policy.updated` and `policy.evaluated` events

### 2. Policy Evaluator
- Evaluates access requests in real time
- Input: JWT claims + resource + action + context
- Output: allow/deny + reason
- Supports conditions like ownership (`property.owner_id == sub`), organisation scoping, or time-bound rules

### 3. Management UI (Next.js + Tailwind)
- Allows admin, superadmin, or landlord to add/update policies
- Visual editor for conditions and access rules
- Audit log view for policy changes and evaluations
- Mobile-first interface

### 4. Event Integration
- Kafka or Redis topics:
  - `policy.updated` – Triggered on policy creation/update
  - `policy.evaluated` – Triggered on every evaluation
- Enables analytics, audit reporting, and downstream notifications

### 5. Caching & Optimization
- Cache frequent policy evaluations
- TTL-based invalidation when policies change
- Fast access for high-traffic resources (e.g., tenant dashboards)

---

## EXAMPLE POLICIES

| Role          | Resource          | Action       | Condition                                           |
|---------------|-----------------|-------------|---------------------------------------------------|
| superadmin    | settings         | update      | Always                                           |
| owner         | property         | create      | org_id == JWT.organisation_id                    |
| manager       | property         | update      | org_id == JWT.organisation_id                    |
| tenant        | lease            | view        | tenant_id == JWT.sub                             |
| maintenance   | inspection       | read        | property_id in assigned_properties(JWT.sub)      |
| owner         | payment          | approve     | org_id == JWT.organisation_id                    |
| agency        | property         | update      | org_id == JWT.organisation_id or landlord_id != null |

---

## INTEGRATION

- **Authentication**: Logto JWT (`sub`, `roles`, `organisation_id`)  
- **Backend**: FastAPI dependency injection, multi-tenant aware PolicyService  
- **UI**: Next.js + Tailwind for policy management and audit logs  
- **Event Bus**: Kafka or Redis for policy updates and evaluations  
- **Other Services**: Works with onboarding, payment, notification skills

---

## TESTING

- **Unit**: Evaluate access requests against mock JWTs and policies  
- **Integration**: Multi-tenant and cross-role access scenarios  
- **E2E**: Admin updates policy → evaluation reflects changes → events emitted to Kafka or Redis

---

## PERFORMANCE BUDGET

- Policy evaluation (cache hit): < 3ms  
- Policy evaluation (cache miss): < 20ms  
- Policy update propagation via Kafka or Redis: < 50ms

---

## NEXT STEPS

1. Build PolicyService backend (FastAPI + PostgreSQL)  
2. Implement PolicyEvaluator with condition parser  
3. Build Next.js UI for dynamic policy management  
4. Integrate Kafka or Redis events for policy audit and analytics  
5. Implement caching and TTL invalidation  
6. Write unit, integration, and E2E tests

---

## COMMON PITFALLS

- ❌ Storing roles only in JWT without backend refresh – risk of stale permissions  
- ❌ Allowing overlapping or conflicting policies without resolution  
- ❌ Ignoring multi-tenant boundaries (org_id, agency scopes)  
- ✅ Always log denied evaluations and emit events for audit  
- ✅ Validate condition expressions to prevent unsafe logic

---

## EXAMPLE INTERACTION

**User**: "Can tenant `sub: t123` view lease `lease_001`?"  
**Claude**:
```json
{
  "tenant_id": "t123",
  "resource": "lease_001",
  "action": "view",
  "decision": "allow",
  "reason": "tenant_id matches JWT.sub"
}
