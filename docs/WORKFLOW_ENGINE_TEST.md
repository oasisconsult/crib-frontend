# Create the Markdown content for the Claude prompt

content = r"""# Claude Prompt: Workflow Engine Test Harness for Crib

## 🧠 CONTEXT

You are working on a production-grade multi-tenant SaaS application called **Crib** built with:

- FastAPI (Python)
- PostgreSQL
- SQLAlchemy
- Docker Compose
- JWT authentication (role-based: admin, tenant users, contractors)
- Microservices-style modular backend
- Maintenance workflow is a core feature

Crib manages:

- Contractors
- Maintenance jobs
- Job assignment
- Job lifecycle (created → assigned → in_progress → completed)
- Image uploads as proof of work
- Audit logs and notifications

---

## 🎯 OBJECTIVE

Design and implement a **Workflow Engine Test Harness** that allows Crib to run **declarative end-to-end business workflow tests**.

This system must replace brittle E2E tests with a **reusable, extensible workflow execution engine**.

---

# 🚨 CRITICAL TESTING + GITHUB RULES (MUST FOLLOW)

## ✅ Tests MUST be committed to GitHub

All meaningful tests are part of the production system and MUST be version controlled.

Tests are NOT optional or local-only tools.

They are:

> 🧠 Executable specifications of Crib’s behaviour

---

## 📦 MUST COMMIT

You MUST commit:

### 🧪 Unit tests
- service logic
- business rules
- validators

### 🔗 Integration tests
- FastAPI endpoints
- DB interactions
- authentication flows

### 🌍 E2E workflow tests (MOST IMPORTANT)
- maintenance lifecycle
- tenant onboarding
- contractor assignment flow
- job completion with images

### ⚙️ Test infrastructure
- workflow engine test harness
- fixtures
- API test clients
- action registry
- workflow definitions

---

## ❌ MUST NOT COMMIT

You MUST NOT commit:

### 🔐 Secrets
- API keys
- JWT secrets
- production DB credentials

Use `.env.test` and CI secrets instead.

---

### 📦 Generated artifacts
- uploaded images
- logs dumps
- large binary outputs

---

### 🌐 Real external dependencies
Tests MUST NOT depend on:
- production AWS S3
- real WhatsApp API
- real payment systems

Always use:
- mocks
- test environments
- local containers

---

## 🚀 CI/CD EXPECTATION

All tests MUST be runnable in CI:

- GitHub Actions must execute:
  - unit tests
  - integration tests
  - workflow E2E tests

If tests fail → deployment MUST fail.

Tests are a **deployment gate**, not optional validation.

---

## 🧠 DESIGN PRINCIPLES

For Crib:

> If a workflow is critical to real-world operations, it MUST exist as a committed E2E test.

Tests are:

- product safety layer
- regression protection
- documentation of business logic
- compliance and audit tool

---

# 🎯 MAIN OBJECTIVE

Build a **Workflow Engine Test Harness** that enables Crib to define and run workflows like:

- maintenance lifecycle
- tenant onboarding
- rent payment flow
- dispute resolution

WITHOUT writing new Python test logic for each workflow.

---

# 🧱 SYSTEM YOU MUST BUILD

## A. Workflow Definition Format (JSON/YAML)

Define declarative workflows with:

- name
- ordered steps
- action type
- role context ("as": admin/tenant/contractor)
- input payload
- variable capture (save_as)
- variable interpolation (${var.field})

---

## B. Workflow Runner Engine

Build a Python engine that:

- loads workflow definitions
- executes steps sequentially
- resolves variables
- manages execution context
- injects role-based API clients
- stores outputs per step

Must include:
- context store
- step execution loop
- error handling
- debug logging mode

---

## C. Action Registry

Create a pluggable registry system:

Each action maps to a function:

Examples:
- create_contractor
- create_job
- assign_job
- upload_job_images
- complete_job
- assert_job_state

Each action MUST:
- call real FastAPI endpoints via TestClient
- NOT bypass API/business logic
- respect authentication roles

---

## D. API CLIENT FACTORY

Build a factory that returns authenticated API clients:

- admin client
- tenant client
- contractor client

Must inject JWT tokens correctly.

---

## E. ASSERTION SYSTEM

Assertions must be first-class workflow steps:

- job status validation
- assignment validation
- image count validation
- audit log validation (if available)

---

# 🧪 REQUIRED OUTPUT STRUCTURE

You MUST generate:

## 1. Folder structure

tests/
  workflows/
  runners/
  actions/
  utils/
  e2e/

---

## 2. Example workflow JSON

- maintenance lifecycle workflow
- must include at least 5 steps

---

## 3. Workflow Runner implementation

- Python class
- context handling
- execution loop
- variable interpolation

---

## 4. Action Registry implementation

- modular functions
- each calls FastAPI endpoints
- respects auth roles

---

## 5. Example pytest test

def test_maintenance_workflow():
    runner.run("maintenance_workflow.json")

---

# 🔥 ADVANCED FEATURES (HIGHLY DESIRED)

Include:

- retry mechanism
- debug mode
- failure snapshots
- extensibility for new workflows

---

# 🧠 FINAL GOAL

A system where Crib can define workflows as data and run full business simulations safely in CI.

---

# ❌ STRICT RULES

Do NOT:
- bypass API layer
- hardcode workflows in pytest
- mix business logic into tests
- rely on external live services

---

# 🎯 END RESULT

A production-grade workflow testing system that makes Crib’s business logic:
reproducible, testable, and deployment-safe at scale.
"""

file_path = "/mnt/data/crib_workflow_engine_test_harness_prompt.md"
with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

file_path