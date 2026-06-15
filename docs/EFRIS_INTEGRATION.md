# CRIB EFRIS INTEGRATION IMPLEMENTATION TASK

You are a Senior Software Architect and Principal Engineer working on the Crib platform.

You are already familiar with Crib's architecture, coding standards, tenancy model, RBAC implementation, subscription management, payment systems, lease management, tenant management, maintenance workflows, notification framework, audit logging, FastAPI backend, PostgreSQL databases, React/Next.js frontend, and Docker-based deployment strategy.

Your task is to design and implement Uganda Revenue Authority (URA) EFRIS integration into Crib.

## CRITICAL INSTRUCTIONS

DO NOT immediately start coding.

You MUST follow the process below.

### Phase 1: Comprehensive Codebase Review

Before writing a single line of code:

1. Review the entire codebase.
2. Identify existing modules, services, APIs, models, workflows and infrastructure that can be reused.
3. Understand current:

   * Rent collection flows
   * Payment processing flows
   * Invoice generation
   * Receipt generation
   * Notification system
   * Audit logging
   * Background job processing
   * RBAC implementation
   * Subscription feature management
   * Tenant isolation strategy
   * API architecture
   * Database architecture
   * Service layer patterns
   * External integration patterns

You must NOT create duplicate functionality if suitable functionality already exists.

You must maximize reuse of existing code and architecture.

Produce a detailed review report showing:

* Existing components discovered
* Reusable components
* Components requiring extension
* Components requiring modification
* New components that must be created

No coding before this review is completed.

---

## Phase 2: Architecture Assessment

Review the current Crib architecture and determine:

### Integration Approach

Should EFRIS be:

A. Embedded inside existing billing/payment services

OR

B. Implemented as a dedicated EFRIS service

Justify your recommendation.

The recommendation must consider:

* Scalability
* Maintainability
* Security
* Compliance
* Future ERP integrations
* Future tax integrations
* Tenant isolation
* Audit requirements

---

## Phase 3: Produce Detailed Implementation Plan

Create a complete implementation plan before touching code.

The plan must include:

### Backend Changes

Models

Schemas

Services

Repositories

API Endpoints

Workers

Tasks

Audit Logging

Feature Flags

Permissions

Subscription Controls

Notifications

Configuration

Secrets Management

Database Migrations

---

### Frontend Changes

Settings Screens

EFRIS Configuration Screens

Invoice Screens

Receipt Screens

Status Indicators

Administration Screens

Subscription Management

Permission-Based Visibility

Error Handling

---

### Infrastructure Changes

Environment Variables

Docker

CI/CD

Monitoring

Logging

Background Workers

Secrets Storage

Certificate Storage

Backups

---

## CRIB BUSINESS CONTEXT

Crib is NOT an accounting application.

Crib is a property management platform.

Its primary functions include:

* Lease management
* Tenant management
* Rent collection
* Maintenance management
* Property management
* Property agency operations
* Landlord management
* Communication management

EFRIS should enhance these workflows.

EFRIS must never dominate the user experience.

The primary user action remains:

Tenant pays rent.

Crib automates compliance in the background.

---

## EFRIS BUSINESS REQUIREMENTS

### Rent Invoices

When rent becomes due:

Generate rent invoice.

Optional EFRIS fiscalization based on organization settings.

---

### Rent Payments

When rent is received:

Generate receipt.

Submit required data to EFRIS.

Store returned fiscal information.

Attach fiscal reference to transaction.

---

### Fiscalized Receipts

Allow download of:

* PDF Receipt
* Fiscal Receipt
* EFRIS Reference

---

### Property Manager Dashboard

Provide:

* Fiscalized transactions
* Pending submissions
* Failed submissions
* Compliance status
* Submission history

---

### Audit Requirements

Every EFRIS interaction must be logged.

Store:

* Request payload
* Response payload
* Status
* Timestamps
* User
* Organization
* Property
* Lease
* Payment

Maintain full traceability.

---

## MULTI-TENANT REQUIREMENTS

Crib is a multi-tenant SaaS platform.

Each organization must have:

* Its own TIN
* Its own EFRIS credentials
* Its own certificates
* Its own EFRIS settings

No organization can access another organization's EFRIS data.

All queries must be organization scoped.

Follow existing tenancy enforcement patterns already implemented in Crib.

Do not invent a new tenancy model.

Reuse existing tenancy architecture.

---

## SUBSCRIPTION MANAGEMENT

Review the existing subscription and feature entitlement system.

Determine how EFRIS should be enabled.

Possible example:

* Starter → No EFRIS
* Professional → Optional EFRIS
* Enterprise → Full EFRIS

Use existing feature flag architecture if available.

Do not create a parallel entitlement system.

---

## SECURITY REQUIREMENTS

Review existing security implementation.

Reuse existing:

* Encryption utilities
* Secret management
* Authentication
* Authorization
* Audit logging
* API security patterns

Ensure:

* Certificates encrypted at rest
* Credentials encrypted at rest
* Secrets never logged
* Least privilege access
* Tenant isolation

Follow OWASP ASVS principles.

Follow secure coding practices.

---

## BACKGROUND PROCESSING

Review current background processing architecture.

If Celery, Redis, RabbitMQ or similar already exists:

Reuse it.

Do not introduce a new queueing technology unless justified.

EFRIS submission must be asynchronous.

User-facing actions must not wait for EFRIS responses.

Implement:

* Retry policies
* Dead-letter handling
* Failure tracking
* Monitoring

---

## NOTIFICATIONS

Review existing notification framework.

Reuse existing notification channels.

Support:

* Email receipts
* WhatsApp notifications
* In-app notifications

Do not create separate notification infrastructure.

---

## DATABASE DESIGN

Before creating new tables:

Review existing models.

Determine whether current models can be extended.

Avoid creating unnecessary tables.

Any new tables must include:

* UUID primary keys
* Audit fields
* Organization isolation
* Soft delete support where applicable

Follow existing database conventions.

---

## API DESIGN

Follow existing API architecture.

Review:

* Existing router patterns
* Dependency injection
* Service layer design
* Repository patterns
* Error handling standards

New APIs must match current platform conventions.

Do not introduce a different architectural style.

---

## FRONTEND DESIGN

Review current UI components.

Reuse:

* Existing forms
* Existing tables
* Existing modals
* Existing notification components
* Existing settings pages

Maintain consistent UX.

EFRIS should feel native to Crib.

---

## DELIVERABLES

You must produce deliverables in the following order:

### Deliverable 1

Codebase Review Report

### Deliverable 2

Architecture Assessment

### Deliverable 3

Gap Analysis

### Deliverable 4

Implementation Plan

### Deliverable 5

Database Changes

### Deliverable 6

API Design

### Deliverable 7

Frontend Design

### Deliverable 8

Security Review

### Deliverable 9

Migration Strategy

### Deliverable 10

Implementation

Implementation must occur incrementally.

After each phase:

* Explain changes
* Explain rationale
* Identify risks
* Identify testing requirements

Do not make large uncontrolled changes.

---

## QUALITY STANDARDS

Follow:

* SOLID principles
* Clean Architecture
* Domain Driven Design where already applicable
* Existing Crib architecture patterns
* Twelve-Factor App principles
* OWASP recommendations
* FastAPI best practices
* PostgreSQL best practices
* Multi-tenant SaaS best practices

Priority order:

1. Reuse existing code
2. Extend existing code
3. Refactor existing code
4. Create new code only when necessary

Before every implementation step ask:

"Can this be achieved by reusing existing Crib functionality?"

If yes, reuse it.

If no, document why and proceed.

Do not begin implementation until the review, architecture assessment, and implementation plan have been completed and approved.
