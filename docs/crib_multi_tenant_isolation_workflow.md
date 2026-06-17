# CRIB MULTI-TENANT ISOLATION & SECURITY VALIDATION — WORKFLOW ENGINE TEST HARNESS

## Objective

Review the existing Crib codebase and Workflow Engine Test Harness.

Execute a complete multi-tenant isolation workflow end-to-end using the existing Workflow Engine.

Do NOT create ad-hoc tests if workflows already exist.

Do NOT bypass the API layer.

Do NOT bypass authorization.

Use existing workflow definitions, fixtures, authentication mechanisms, and test infrastructure wherever possible.

The purpose of this workflow is to verify that data belonging to one tenant, property owner, property manager, contractor, or tenant user cannot be accessed by unauthorized users.

---

# PRE-EXECUTION ANALYSIS

Before executing any workflow:

Review:
- tenant architecture
- authentication system
- authorization system
- RBAC implementation
- database tenant boundaries
- property ownership relationships
- contractor assignment relationships
- document storage permissions
- messaging permissions
- notification permissions

Identify:
- existing isolation workflows
- existing security tests
- existing authorization checks

Document any gaps before execution.

---

# PHASE 1 — TEST DATA VALIDATION

Verify or create:
- Tenant A
- Tenant B
- Property Manager A
- Property Manager B
- Contractor A

Ensure all required relationships exist.

---

# PHASE 2 — POSITIVE ACCESS VALIDATION

Validate tenants can access only:
- own profile
- own lease
- own maintenance requests
- own documents
- own notifications
- own messages
- own payment history
- own statements

Expected Result: Access granted.

---

# PHASE 3 — CROSS-TENANT ACCESS ATTACKS

Tenant A attempts access to Tenant B resources.

Tenant B attempts access to Tenant A resources.

Expected Result:
403 Forbidden or equivalent authorization failure.

---

# PHASE 4 — PROPERTY MANAGER ISOLATION

Validate managers can access only authorized portfolios and properties.

Expected Result:
Access granted for owned resources.
Access denied for unauthorized resources.

---

# PHASE 5 — CONTRACTOR ISOLATION

Validate contractors can access only assigned jobs.

Expected Result:
Access denied for unrelated jobs and tenant information.

---

# PHASE 6 — SEARCH ISOLATION

Validate searches never return unauthorized tenant data.

---

# PHASE 7 — REPORTING ISOLATION

Validate reports are tenant-scoped and role-scoped.

---

# PHASE 8 — DOCUMENT ACCESS VALIDATION

Validate:
- listing
- download
- upload permissions

Attempt unauthorized access.

Expected Result:
Access denied.

---

# PHASE 9 — NOTIFICATION ISOLATION

Validate notifications contain only authorized events.

---

# PHASE 10 — DATABASE VALIDATION

Verify:
- tenant scoping
- ownership constraints
- query filtering

Do not rely solely on API responses.

---

# EXECUTION RULES

If failure occurs:

1. Identify root cause.
2. Classify issue.
3. Explain business impact.
4. Explain security impact.
5. Implement fix if safe.
6. Re-run workflow.

---

# OUTPUT

## Executive Summary

- Workflows Executed
- Tests Executed
- Passed
- Failed

## Isolation Results

- Status
- Validation Details

## Security Findings

- Data Leakage Risks
- Authorization Failures
- Cross-Tenant Access Vulnerabilities
- RBAC Issues

Severity:
- Critical
- High
- Medium
- Low

## Recommendations

Prioritized fixes.

## Success Criteria

The workflow passes only when:
- No tenant can access another tenant's data
- No property manager can access unauthorized portfolios
- No contractor can access unrelated jobs
- No documents leak across tenants
- No notifications leak across tenants
- Search results remain tenant-scoped
- Reports remain tenant-scoped
- Database validations pass

Any data leakage is an automatic workflow failure.
