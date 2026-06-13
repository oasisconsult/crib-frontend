# Crib — Development Phases & Sprint Status

_Last updated: 2026-06-13_

---

## Overview

Crib is a property management platform targeting the Ugandan/East African market.
Development is organised into three phases, each broken into focused sprints.
Each sprint delivers a vertical slice (backend model → service → API → frontend → tests).

Legend: ✅ Done · 🔄 In Progress · 🔜 Next · ⬜ Planned

---

## Phase 1 — Core Loop
_The minimum set of features that makes Crib genuinely useful to a landlord managing 5–50 units, replacing their Excel + MoMo + WhatsApp setup._

| # | Sprint | Status | Notes |
|---|--------|--------|-------|
| 1.1 | Property & Unit management | ✅ Done | Multi-property, multi-unit; Uganda-specific fields (ground floor as 0); single-unit properties |
| 1.2 | Tenant management | ✅ Done | Profile, ID fields, linked to organisation |
| 1.3 | Lease management | ✅ Done | Create, activate, terminate; `is_single_unit` for whole-property leases; currency/rent terms |
| 1.4 | Rent invoicing | ✅ Done | Auto-generation on due date via Celery beat; `ledger` model; invoice PDF |
| 1.5 | Mobile Money collection (MTN/Airtel) | ✅ Done | `mobile_money` model; MoMo push/pull stubs; webhook reconciliation |
| 1.6 | Payment reconciliation | ✅ Done | `payment_allocation` model; auto-match payment to tenant/unit |
| 1.7 | Rent arrears tracking & reminders | ✅ Done | Automated email/SMS reminders via Celery; `notification` model with state machine |
| 1.8 | Landlord financial statements | 🟡 Partial | Basic ledger exists; formatted monthly statement PDF not yet wired to a download endpoint |
| 1.9 | Role-based access (RBAC) | ✅ Done | `rbac` model; superadmin / manager / caretaker / tenant roles; `require_role` guards on all routes |
| 1.10 | Multi-property / multi-landlord | ✅ Done | `organisation` model; agencies can manage on behalf of landlords; ownership model documented |
| 1.11 | Reporting dashboard | 🟡 Partial | Occupancy/collection stats returned by API; frontend dashboard tiles wired; export/download not yet built |

---

## Phase 2 — Compliance & Trust
_Features that protect both landlord and tenant legally, reduce disputes, and make Crib defensible._

| # | Sprint | Status | Notes |
|---|--------|--------|-------|
| 2.1 | **Rent Increase Workflow** | ✅ Done | Uganda LTA 2022: 10% cap, 90-day notice, one active notice per lease, PDF notice, tenant notification, Celery auto-apply on effective date. 18/18 tests green. |
| 2.2 | **Eviction Notice Workflow** | ✅ Done | Uganda LTA 2022 §§ 73-78: 4 notice types, type-specific minimums (14/14/30/180 days), court ref required for redevelopment, status machine (issued→served→executed/disputed/withdrawn), one active notice per lease, PDF, Celery reminders, tenant notification. 24/24 tests green. |
| 2.3 | Move-in inspection | ⬜ Planned | Photo documentation per room/area; tenant sign-off; stored as inspection record |
| 2.4 | Move-out inspection | ⬜ Planned | Damage assessment vs move-in baseline; deposit deduction justification |
| 2.5 | Security deposit management | ⬜ Planned | Hold on lease creation; itemised deductions on move-out; refund workflow; dispute trail |
| 2.6 | Tenancy agreement generation | 🟡 Partial | `tenancy_agreement` model exists; PDF template generation started; e-signature not integrated |
| 2.7 | EFRIS receipt integration | ⬜ Planned | URA EFRIS API mock first (sprint 3.1); live integration after credentials confirmed. Feature flag `features.efris_enabled` already in system settings (default `false`) |
| 2.8 | Document storage & access control | 🟡 Partial | Local upload endpoint `/api/v1/upload/local/...`; S3/MinIO not yet wired; per-tenant access control not enforced on document URLs |
| 2.9 | Superadmin email templates | ✅ Done | Jinja2 templates for demo-booking emails; editable via admin UI; fallback to defaults; shipped 2026-06-11 |

---

## Phase 3 — Growth & Scale
_Features that support multi-property companies, self-service, reporting, and integrations at scale._

| # | Sprint | Status | Notes |
|---|--------|--------|-------|
| 3.1 | EFRIS mock & integration | ⬜ Planned | Build mock server first for dev/test; then wire live URA EFRIS API. Add `efris.*` credential settings to system settings when building |
| 3.2 | Maintenance request logging | ⬜ Planned | Tenant-initiated; category, priority, photo attachments; assigned to caretaker |
| 3.3 | Maintenance workflow | ⬜ Planned | Assign → in-progress → completed; contractor management; status notifications |
| 3.4 | Maintenance photo evidence | ⬜ Planned | Before/after photo upload per job; stored with S3/MinIO |
| 3.5 | Tenant self-service portal | ⬜ Planned | Pay rent, log issues, view statements, download documents; mobile-first |
| 3.6 | Tenant communication / announcements | ⬜ Planned | Bulk SMS/email/WhatsApp to all tenants in a property or organisation |
| 3.7 | Utility billing | ⬜ Planned | Water/electricity/garbage metered per unit; monthly bill generation; added to invoice |
| 3.8 | Vacancy marketing | ⬜ Planned | List vacant units; basic listing page; optional portal listing integration |
| 3.9 | Tenant screening | ⬜ Planned | ID check, employment verification, reference requests |
| 3.10 | WhatsApp Business API | ⬜ Planned | Highest-leverage notification channel for Uganda; replace/augment SMS reminders |
| 3.11 | Mobile app (PWA or native) | ⬜ Planned | Current frontend is responsive; PWA manifest present; native app not started |
| 3.12 | Advanced reporting & exports | ⬜ Planned | CSV/Excel export; occupancy rate, collection rate, arrears aging, revenue by property |
| 3.13 | GeoBox geocode integration | 🟡 Partial | Backend SDK + `geocode` field on properties; frontend "Look up" button wired; address hierarchy auto-fill tested manually |

---

## Sprint Detail — What's Next

### Sprint 2.2 — Eviction Notice Workflow ✅ Complete

Delivered: 4 notice types, type-specific LTA minimums, full status machine, WeasyPrint PDF,
Celery reminders, tenant email notification, `EvictionNoticePanel` in lease detail.
42/42 tests green (24 eviction + 18 rent increase).

### Sprint 3.1 — EFRIS Mock & Integration

**Why now:** URA now mandates EFRIS receipts on every rental payment. Without this,
Crib cannot be fully compliant and enterprise customers won't adopt it.

**Scope:**
- Add `efris.*` credential settings to `SYSTEM_SETTING_DEFAULTS` (tin, device_no, username, password, api_url)
- Build a mock EFRIS server (FastAPI, runs in Docker) returning valid receipt JSON
- Wire `efris_service.issue_receipt(payment_id)` called from `payment_service` after reconciliation
- Feature-gated by `features.efris_enabled` system setting (already present, default `false`)
- Store receipt number + FD date on `Payment` model
- Frontend: show EFRIS receipt badge/number on payment records

**Depends on:** Payment reconciliation (✅), system settings framework (✅), `features.efris_enabled` flag (✅)

---

## Infrastructure & Cross-Cutting

| Item | Status | Notes |
|------|--------|-------|
| Docker / WSL dev environment | ✅ | `docker-compose.local.yml`; backend at `crib-backend-1`; worker at `crib-worker-1` |
| Alembic migrations | ✅ | Sequential numbered `00N_*.py`; next is `050_*` |
| Celery + Redis | ✅ | DB 6 on geobox-redis-prod; `-n 6` when clearing Crib cache keys |
| Email delivery | ✅ | Provider abstraction; Jinja2 templates for transactional email |
| SMS | 🟡 Partial | Africa's Talking stub present; not tested live |
| S3/MinIO document storage | ⬜ Planned | Currently using local disk upload; replace in Phase 3 |
| CI/CD | 🟡 Partial | GitHub repo `oasisconsult/crib-frontend`; no automated test pipeline yet |
| Feature flags (system settings) | ✅ | `features.efris_enabled` seeded; pattern established for future flags |
