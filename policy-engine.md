You are a senior backend engineer tasked with designing and implementing a **dynamic, extensible Policy Engine module** for a multi-tenant SaaS property management platform called **Crib**. This implementation should plugin directly with the current authentication and authorisation implementation. Think about, adding models like roles, permissions, etc

The platform uses:

* Backend: FastAPI (Python, async)
* Database: PostgreSQL (SQLAlchemy ORM)
* Auth: Logto (JWT-based authentication)
* Architecture: multi-tenant (organisation-based isolation)

---

# 🎯 OBJECTIVE

Build a **dynamic policy engine** that determines whether a user can perform a specific action on a resource, using rules stored in the database (NOT hardcoded).

The system must support:

* Multi-tenant organisations
* Role-based access (owner, manager, tenant, maintenance)
* Resource-level access (property, lease, payment, etc.)
* Dynamic rules configurable via UI (stored as JSON)

---

# 🧠 CORE CONCEPT

The engine must answer:

Can user X perform action Y on resource Z in organisation O?

---

# 🧱 REQUIRED MODULE STRUCTURE

Create a new module:

app/
modules/
policy/
models.py
schemas.py
service.py
engine.py
evaluator.py
dependencies.py
constants.py

---

# 🗄️ DATABASE DESIGN

Create SQLAlchemy models for:

## policies

* id (UUID)
* name (string) → e.g. "property:update"
* resource (string) → e.g. "property"
* action (string) → e.g. "update"
* organisation_id (nullable UUID) → NULL = global policy
* is_active (bool)
* created_at, updated_at

## policy_rules

* id (UUID)
* policy_id (FK → policies.id)
* effect (string: "allow" | "deny")
* condition_json (JSONB) → dynamic rule definition
* priority (int) → lower number = higher priority
* description (optional string)

---

# 🔥 CONDITION JSON SPEC (VERY IMPORTANT)

Support the following operators:

Logical:

* "all": [ ...conditions ] → AND
* "any": [ ...conditions ] → OR

Comparison:

* "eq": [left, right]
* "neq": [left, right]
* "in": [item, list]
* "gt": [left, right]
* "lt": [left, right]

Example:

{
"any": [
{ "eq": ["ctx.role", "owner"] },
{
"all": [
{ "eq": ["ctx.role", "manager"] },
{ "in": ["resource.id", "ctx.assigned_property_ids"] }
]
}
]
}

---

# ⚙️ IMPLEMENTATION REQUIREMENTS

## 1. Context Object

Create a context class:

class PolicyContext:
user_id: UUID
organisation_id: UUID
role: str
assigned_property_ids: list[UUID]
tenant_id: UUID | None

---

## 2. Resource Handling

The engine must accept a resource object dynamically (property, lease, payment, etc.)

---

## 3. Evaluator (Core Logic)

Implement a recursive evaluator:

def evaluate(condition_json, ctx, resource) -> bool

Must support:

* Nested conditions (any/all)
* Path resolution (ctx.role, resource.id, etc.)
* Safe evaluation (no arbitrary code execution)

---

## 4. Resolver

Implement a function:

def resolve(path: str, ctx, resource):

Rules:

* "ctx.xxx" → attribute from context
* "resource.xxx" → attribute from resource
* otherwise return literal value

---

## 5. Policy Engine

Create class:

class PolicyEngine:

```
async def check(
    self,
    ctx: PolicyContext,
    action: str,
    resource: Any
) -> bool:

    - Load policies by action + organisation_id (fallback to global)
    - Sort rules by priority
    - Evaluate each rule:
        if condition matches:
            return True if effect == "allow"
            return False if effect == "deny"

    - Default deny if no match
```

---

## 6. Policy Loading

Implement efficient DB loading:

* Cache policies per organisation (in-memory or Redis-ready structure)
* Minimise DB queries

---

## 7. FastAPI Dependency

Create reusable dependency:

def authorize(action: str, resource_loader):

Usage:

@router.put("/properties/{id}")
async def update_property(
property = Depends(authorize("property:update", load_property))
):

---

## 8. Resource Loader Pattern

Define pattern for loading resources before evaluation:

async def load_property(ctx, db, property_id) -> Property

---

# 📦 SUPPORTED RESOURCES

The engine must work with these resources:

* property
* lease
* payment
* payment_allocation
* ledger
* inspection
* maintenance_request
* tenant
* wallet
* organisation
* document
* notification
* analytics

---

# 🔐 SECURITY REQUIREMENTS

* No eval() or unsafe execution
* Validate JSON structure before evaluation
* Prevent attribute access outside allowed fields
* Default deny if anything is invalid

---

# ⚡ PERFORMANCE REQUIREMENTS

* Avoid N+1 queries
* Cache policies (design for Redis)
* Pre-parse condition JSON if possible

---

# 🧪 TESTING

Write unit tests for:

* Simple rule evaluation
* Nested conditions
* Deny overrides
* Missing attributes
* Invalid JSON handling

---

# 🧠 EXTENSIBILITY

Design system so we can later:

* Add UI policy builder
* Add audit logs (why access was denied)
* Add simulation mode ("what would happen if...")
* Support time-based rules (e.g. late fees)

---

# 🚀 OUTPUT EXPECTATION

Produce:

1. Complete module code (all files)
2. SQLAlchemy models
3. Example seed policies:

   * property:update
   * lease:read
   * payment:create
4. Example usage in FastAPI route
5. Clear inline comments

---

# 💡 FINAL NOTE

This is a core infrastructure module. Prioritise:

* clarity
* security
* extensibility
* performance

Avoid overengineering, but design for scale.

The code must be production-ready.

You are to write a detailed execution plan, write a roles and permissions matrix, ask questions you have before touching code, implementation must be able to fit in the current implementation, should be testable and pass 100%, implementation must follow industry standards, secure, scalable and follow and meet GDPR guidelines and well as WCAG and accessibility requiments