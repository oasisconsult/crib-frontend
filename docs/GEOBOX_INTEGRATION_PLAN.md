# GeoBox × Crib Integration Plan

**Document status:** Architecture plan — ready for team review
**Author:** GeoBox Digital Services — Engineering
**Date:** 9 June 2026
**Codebase refs:** `crib/backend`, `crib/frontend`, `geobox-backend/sdk/typescript`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Capabilities Being Integrated](#2-capabilities-being-integrated)
3. [Current State](#3-current-state-already-live)
4. [Guiding Principles](#4-guiding-principles)
5. [App Registration Lifecycle](#5-app-registration-lifecycle)
6. [Subscription and Billing Model](#6-subscription-and-billing-model)
7. [Credential Management Standard](#7-credential-management-standard)
8. [Phase 0a — Settings Foundation](#8-phase-0a--settings-foundation)
9. [Phase 0b — Internal Billing Tier](#9-phase-0b--internal-billing-tier)
10. [Phase 1 — Geocode Field on Property and Unit](#10-phase-1--geocode-field-on-property-and-unit)
11. [Phase 2 — Tenant Directions](#11-phase-2--tenant-directions)
12. [Phase 3 — Address Autocomplete on Forms](#12-phase-3--address-autocomplete-on-forms)
13. [Phase 0c — Production Submission](#13-phase-0c--production-submission)
14. [Phase 4 — WhatsApp Address Onboarding](#14-phase-4--whatsapp-address-onboarding-later-sprint)
15. [Testing Strategy](#15-testing-strategy)
16. [Go-Live Checklist](#16-go-live-checklist)
17. [What NOT to Do](#17-what-not-to-do)
18. [Summary Table](#18-summary-table)

---

## 1. Executive Summary

Crib is a property management SaaS for Uganda. Uganda's address infrastructure is informal — streets are unnamed, postcodes don't exist, and the current `address` field in Crib is free text that no system can interpret. GeoBox solves this: it encodes a physical location, administrative hierarchy, landmark description, access instructions, and delivery notes into a permanent short code (e.g. `UGKAN-JF5`) that any carrier, tenant, or visitor can resolve to a precise GPS-anchored location.

Integrating GeoBox gives Crib three concrete improvements:

1. Landlords can attach a machine-readable geocode to every property and unit instead of approximate free text.
2. Tenants can open navigation to their rented unit with a single tap via the GeoBox `nav_url`.
3. Address autocomplete during property creation replaces a hardcoded city dropdown with a live village/landmark search backed by GeoBox's full Uganda administrative hierarchy.

Because **GeoBox Digital Services (U) Ltd** owns both platforms, Crib is a first-party internal consumer. This changes the billing dynamics — an `internal` subscription tier removes cost while preserving usage telemetry for capacity planning. Credential registration still follows the full developer portal lifecycle so the security posture is identical to any third-party integrator.

---

## 2. Capabilities Being Integrated

Only capabilities relevant to Crib are in scope. Deferred items are noted for future consideration.

| GeoBox Capability | SDK Method | Crib Use Case | Phase |
|---|---|---|---|
| Geocode lookup | `geocoding.lookup(geocode)` | Resolve stored code → `full_address`, `nav_url`, `landmark_description` | 1, 2 |
| Village search | `geocoding.searchVillages(query)` | Address autocomplete when creating a property | 3 |
| Nearby areas | `geocoding.findNearby(lat, lng)` | GPS-based village pre-fill on mobile | 3 |
| Create address | `addresses.create(req)` | Mint a geocode for a property from Crib | 3 |
| DPPA consent | `addresses.recordConsent(phone, ...)` | Required before address creation with a phone number | 3 |
| Batch lookup | `geocoding.batchLookup(geocodes[])` | Property list enrichment | Deferred |
| Address verify | `addresses.verify(geocode, lat, lng)` | Rider/caretaker proximity check | Deferred |
| WhatsApp flow | `WhatsAppSessionManager` | Onboarding for non-smartphone tenants | Phase 4 |

> **What Crib cannot build internally:** the geocode namespace, Uganda administrative hierarchy, GPS-to-village resolution, and the permanent short-code lookup infrastructure are proprietary GeoBox data. Building equivalent coverage would require years of field data collection. The integration is purely additive.

---

## 3. Current State (Already Live)

The following integration touchpoints are already live and require no work.

| Layer | Status |
|---|---|
| Shared Logto identity (`geobox-logto-prod`, same RBAC DB) | ✅ Live |
| "Secured by GeoBox OAuth" on Crib login page | ✅ Live |
| "A product of GeoBox Digital Services (U) Ltd" — footer, Terms, Privacy Policy | ✅ Live |
| Data Protection page references Uganda DPPA 2019, names GeoBox as operating entity | ✅ Live |

**Not yet present:** GeoBox credentials in `system_settings`, a GeoBox card on `/admin/integrations`, any `geocode` column on `properties`/`units`, any GeoBox service module in the Crib backend.

---

## 4. Guiding Principles

These rules govern every implementation decision across all phases.

**P1 — Additive, never blocking.**
All geocode fields are nullable. No Crib workflow (create property, onboard tenant, record payment) ever fails because GeoBox is unreachable or unconfigured. If `geobox.client_id` is empty, GeoBox features are silently skipped.

**P2 — Credentials in `system_settings`, never in `.env`.**
The existing encryption, masking, and audit trail are battle-tested. No `.env` variable is introduced for GeoBox credentials. The admin UI is the only interface for managing them.

**P3 — All GeoBox calls proxied through the Crib backend.**
Credentials never reach browser contexts. The BFF pattern already established for the `/public/contact-info` endpoint applies here. The Next.js frontend calls Crib's FastAPI, which calls GeoBox.

**P4 — Sandbox before production.**
`geobox.environment` controls the active credential pair. Production credentials are only entered after end-to-end testing on sandbox passes QA sign-off.

**P5 — Test connection is mandatory.**
Every integration in Crib has a `POST /admin/settings/test/{integration}` endpoint. GeoBox must have one. Misconfiguration must surface immediately in the admin UI, not silently at runtime.

**P6 — No schema breakage.**
`geocode` columns are nullable with no default. All existing `PropertyCreate`, `PropertyOut`, `UnitCreate`, and `UnitOut` schemas remain backward-compatible. Frontend forms that do not know about geocodes continue to work unchanged.

**P7 — DPPA compliance.**
Any call to `addresses.create()` that includes a tenant phone number must be preceded by `addresses.recordConsent()`. This is required by Uganda's Data Protection and Privacy Act 2019, which Crib's own Data Protection page already references.

---

## 5. App Registration Lifecycle

GeoBox has a formal developer lifecycle. Crib follows it as any consumer would — same security posture, same audit trail, with a same-owner fast-track at the approval step.

### The five stages

#### Stage 1 — Developer account

A GeoBox Digital Services engineer logs into the GeoBox developer portal using their Logto credentials. A `DeveloperProfile` is auto-created on first call to `GET /developer/me`.

#### Stage 2 — Sandbox app

Create the Crib app via the portal UI or `POST /developer/apps`:

```json
{
  "name": "Crib Platform",
  "description": "Internal GeoBox Digital Services property management platform",
  "app_type": "backend",
  "scopes": [
    "geocode:lookup",
    "geocode:batch",
    "geo:search",
    "geo:nearby",
    "address:create",
    "address:read",
    "address:consent"
  ]
}
```

The response contains a one-time `client_id` + `client_secret`. **Copy them immediately — the secret is never shown again.**

#### Stage 3 — Build and test on sandbox

All of Phases 1–3 are developed and verified against sandbox credentials stored in Crib's `system_settings`. Sandbox is real API — just rate-limited. All integration bugs are caught here before production credentials exist.

#### Stage 4 — Submit for production

When Phase 3 passes QA, submit via `POST /developer/apps/{appId}/submit`. Because GeoBox Digital Services already has a verified `BusinessUser`, the payload uses the **existing-business path** — not the `company_details` document-upload path that external applicants use:

```json
{
  "requested_scopes": [
    "geocode:lookup",
    "geocode:batch",
    "geo:search",
    "geo:nearby",
    "address:create",
    "address:read",
    "address:consent"
  ],
  "notes": "Internal first-party consumer. Crib is owned and operated by GeoBox Digital Services (U) Ltd. Same-company integration.",
  "business_client_id": "<geobox_digital_services_m2m_client_id>",
  "business_client_secret": "<geobox_digital_services_m2m_client_secret>"
}
```

> `company_details` is omitted entirely. `business_client_id` + `business_client_secret` authenticates the existing verified `BusinessUser` for GeoBox Digital Services, bypassing the full document review flow.

#### Stage 5 — Same-owner fast-track approval

A GeoBox Digital Services developer-admin reviews and approves via `DeveloperAdminService.approveSubmission()`. Reviewer and applicant are the same legal entity — this is a governance formality, not an external due-diligence review. Production `client_id` + `client_secret` are issued as a one-time display. **Save them immediately.**

#### Stage 6 — Enter production credentials

Store in Crib `system_settings` via `/admin/integrations`. Flip `geobox.environment` to `production`. Run Test Connection. **No code change, no redeploy required.**

---

## 6. Subscription and Billing Model

### The problem

GeoBox Digital Services owns both platforms. No money should move internally. But usage must still be tracked for infrastructure capacity planning.

### The solution — Internal subscription tier

Create a dedicated `internal` subscription tier in GeoBox with the following properties:

```json
{
  "name": "internal",
  "display_name": "Internal (GeoBox First-Party)",
  "description": "Reserved for GeoBox-owned products. Zero cost. Usage tracked for capacity planning.",
  "price_per_month": 0.0,
  "price_per_request": 0.0,
  "included_requests": 9999999,
  "rate_limit_per_minute": 600,
  "rate_limit_per_hour": 10000,
  "rate_limit_per_day": 100000,
  "max_webhooks": 10,
  "support_level": "internal",
  "is_active": true
}
```

Assign the Crib `BusinessUser` to this tier. `UsageData` still flows through GeoBox's billing middleware — usage accumulates for capacity planning even though the price is zero. No invoice is generated.

The `subscription_tier` pattern validator in `geobox-backend/core/services/billing.py` needs `"internal"` added to the allowed values.

### Why not the `free` tier?

The `free` tier is designed for external developers evaluating the API. Its rate limits would throttle Crib during peak onboarding (e.g. a landlord adding 50 tenants). The `internal` tier has rate limits sized for production internal use, not evaluation.

> **This is a GeoBox data/admin action — zero Crib code changes.**

---

## 7. Credential Management Standard

### Why the existing infrastructure is correct

Crib already manages Email, SMS, and Storage credentials via `system_settings` on the `/admin/integrations` page. This infrastructure implements every relevant industry standard:

| Industry Standard | Crib Implementation | Status |
|---|---|---|
| Encrypted at rest | `is_secret=True` → Fernet AES encryption in `settings_service` | ✅ Already done |
| Masked in UI — never re-displayed | `"••••••"` returned for all `is_secret` values via the `_out()` serialiser | ✅ Already done |
| One-time secret display | Eye-toggle shows what the admin typed before saving, never the stored ciphertext | ✅ Already done |
| Test connection button | `TestButton` component → `settingsApi.testEmail/testSms/testStorage` | ✅ Done for 3 integrations |
| Audit trail | `updated_by` (Logto `sub`) + `updated_at` stamped on every settings row | ✅ Already done |
| Superadmin-only access | `require_superadmin()` dependency on the settings router | ✅ Already done |
| Separation of concerns | Integrations in `/admin/integrations`, platform config in `/admin/platform` | ✅ Already correct |

GeoBox belongs in `/admin/integrations` alongside Email, SMS, and Storage — not in `/admin/platform` (which is for business configuration like currency and timezone).

### GeoBox-specific addition: environment badge

Unlike Email/SMS/Storage which have one environment, GeoBox has **sandbox** and **production** with different credential pairs. An environment badge in the card header makes it impossible to accidentally run production traffic against test credentials — the same concept as Stripe's Test/Live mode toggle.

```
┌──────────────────────────────────────────────────────────────────┐
│  🌐 GeoBox Smart Addressing    [SANDBOX]    [Test Connection]    │
│  Geocodes, village search, and tenant navigation for Uganda.     │
│  ──────────────────────────────────────────────────────────────  │
│  Environment          sandbox                           [Edit]   │
│  API Base URL         https://api.sandbox.geobox…      [Edit]   │
│  App Client ID        app_01HXY…                        [Edit]  │
│  App Client Secret    ••••••                       👁   [Edit]  │
│  Geocoding Enabled    [Enabled]                         [Edit]  │
└──────────────────────────────────────────────────────────────────┘
```

- `sandbox` → amber outline badge
- `production` → emerald success badge
- Badge is read-only display; environment is changed by editing the `geobox.environment` setting row

### The four new `system_settings` entries

Added by migration 039 (`backend/alembic/versions/039_geobox_settings.py`):

| Key | Label | Secret | Required | Default |
|---|---|---|---|---|
| `geobox.environment` | GeoBox Environment | No | Yes | `sandbox` |
| `geobox.client_id` | GeoBox App Client ID | No | No | `` |
| `geobox.client_secret` | GeoBox App Client Secret | **Yes** | No | `` |
| `geobox.geocoding_enabled` | GeoBox Geocoding Enabled | No | Yes | `true` |

`geobox.client_secret` is Fernet-encrypted at rest. The API response for this key returns `"••••••"` — the plaintext is never exposed after save.

### New backend test endpoint

`POST /admin/settings/test/geobox` — follows the exact pattern of `test_email`, `test_sms`, and `test_storage` already in `system_settings.py`. Attempts an OAuth 2.0 client credentials token exchange using the stored `client_id`/`client_secret`. Returns:

```json
{ "success": true,  "message": "Connected — App: Crib Platform, Environment: sandbox" }
{ "success": false, "message": "GeoBox credentials not configured" }
{ "success": false, "message": "Unauthorized — check client_id and client_secret" }
```

---

## 8. Phase 0a — Settings Foundation

**Effort:** Half a day | **Blocks:** All subsequent phases | **Risk:** None (additive INSERT only)

### Files changed

| File | Change |
|---|---|
| `backend/alembic/versions/039_geobox_settings.py` | New migration: `op.bulk_insert` of 4 `geobox.*` rows into `system_settings` |
| `backend/app/models/system_setting.py` | Add 4 tuples to `SYSTEM_SETTING_DEFAULTS` under `geobox` category |
| `backend/app/schemas/system_setting.py` | Add `geobox: list[SettingOut]` to `SettingsByCategoryOut` |
| `backend/app/services/settings_service.py` | Add `"geobox"` to `_CATEGORIES`; add `get_geobox_config(db)` and `test_geobox(db)` |
| `backend/app/api/v1/system_settings.py` | Add `POST /admin/settings/test/geobox` endpoint |
| `backend/app/integrations/geobox/client.py` | **New file:** thin async HTTP client factory with OAuth token caching |
| `frontend/src/services/api/settings.ts` | Add `geobox: SystemSetting[]` to `SettingsByCategory`; add `testGeobox()` method |
| `frontend/src/app/(admin)/admin/integrations/page.tsx` | Add GeoBox card with environment badge, 5 `SettingRow` items, `TestButton` |

### Backend HTTP client

GeoBox does not publish a Python SDK. `backend/app/integrations/geobox/client.py` calls GeoBox over HTTP directly using `httpx.AsyncClient`, mirroring the TypeScript SDK. It handles:

- OAuth 2.0 client credentials token acquisition
- Redis token caching (TTL matching token expiry — avoids a token exchange on every request)
- Returns `None` if `geobox.client_id` is empty or `geobox.geocoding_enabled` is `false` (Principle P1)

---

## 9. Phase 0b — Internal Billing Tier

**Effort:** 30 minutes | **Who:** GeoBox platform admin | **Crib code changes:** None

1. Create the `internal` subscription tier in GeoBox billing (properties specified in [section 6](#6-subscription-and-billing-model)).
2. Update the `subscription_tier` pattern validator in `geobox-backend/core/services/billing.py` to accept `"internal"`.
3. Assign the Crib `BusinessUser` to the `internal` tier.
4. Verify: `BillingStatsResponse.subscription_tier == "internal"` via the GeoBox admin API.

---

## 10. Phase 1 — Geocode Field on Property and Unit

**Effort:** 1–2 days | **Depends on:** Phase 0a complete, sandbox credentials entered | **Risk:** Low

### Backend

**Migration 040:**

```sql
ALTER TABLE properties ADD COLUMN geocode VARCHAR(20) NULL;
ALTER TABLE units      ADD COLUMN geocode VARCHAR(20) NULL;

CREATE INDEX ix_properties_geocode ON properties(geocode) WHERE geocode IS NOT NULL;
CREATE INDEX ix_units_geocode      ON units(geocode)      WHERE geocode IS NOT NULL;
```

Partial indexes avoid indexing the large number of rows that will remain `NULL`. The 20-character ceiling covers all current GeoBox code formats.

**Schema updates:**

Add `geocode: str | None = None` to `PropertyCreate`, `PropertyUpdate`, `PropertyOut`, `UnitCreate`, `UnitUpdate`, `UnitOut`. No required fields are added. All existing API consumers are unaffected.

**New service — `backend/app/integrations/geobox/geocode_service.py`:**

`async def resolve(geocode: str, db) -> dict | None`

Calls `GeoBoxClient.geocoding.lookup(geocode)`. Returns:

```python
{
  "full_address":          str | None,
  "landmark_description":  str | None,
  "access_instructions":   str | None,
  "delivery_notes":        str | None,
  "nav_url":               str | None,
  "coordinates":           {"latitude": float, "longitude": float} | None,
}
```

Returns `None` if credentials are absent, feature is disabled, or GeoBox returns a non-2xx response. Logs a warning — **never raises** (Principle P1).

**New API endpoints:**

- `GET /properties/{id}/geocode` — org-member access guard. Returns resolved dict or `{ "geocode": null }` when not set. Never 404.
- `GET /properties/{id}/units/{unit_id}/geocode` — same pattern for unit-level geocodes.

### Frontend

**Property/unit detail pages:**
When `geocode` is set, show it as a `<code>` badge with a "Verify" button that opens a popover showing `full_address`, `landmark_description`, and a "Navigate" link targeting `nav_url`. When null, show a greyed "No geocode" indicator.

**Property/unit create and edit forms:**
Optional "GeoBox Geocode" field with "Verify" button. On verify, calls the geocode endpoint and shows the resolved `full_address` inline for confirmation before save. **Never required.**

---

## 11. Phase 2 — Tenant Directions

**Effort:** Half a day | **Depends on:** Phase 1 endpoint live | **Risk:** None (read-only, frontend only)

The tenant portal's unit/property detail view gains a **"How to find us"** section that is visible only when a geocode is set:

- `landmark_description` as a readable human note — *"Near Shell Ntinda, behind blue gate"*
- `access_instructions` and `delivery_notes` when present
- **"Open Navigation"** button linking to `nav_url` — large and tap-friendly on mobile
- Geocode badge (`UGKAN-JF5`) with a **"Copy"** action — tenants share this with delivery riders or visitors

If the geocode endpoint returns nothing the entire section is hidden. No empty states, no error banners are shown to the tenant.

**No new backend work required.** This phase reuses the `GET /properties/{id}/geocode` endpoint from Phase 1.

---

## 12. Phase 3 — Address Autocomplete on Forms

**Effort:** 2–3 days | **Depends on:** Phase 0a and Phase 1 live and tested | **Risk:** Medium — must degrade cleanly

### The problem

The property creation form has a hardcoded `UG_CITIES` array. This produces imprecise, unstandardised location data. Phase 3 replaces it with a live search backed by GeoBox's full Uganda administrative hierarchy index.

### New backend proxy endpoints

**`GET /geobox/villages/search?q={query}&limit={n}`**
Proxies to `geocoding.searchVillages(query)`. Requires authenticated user (any org role — landlords use this during property creation, no superadmin needed). Returns `{ areas: AdminArea[], total: number }` or `{ areas: [], total: 0 }` when GeoBox is unconfigured (Principle P1).

**`GET /geobox/areas/nearby?lat={lat}&lng={lng}&limit={n}`**
Proxies to `geocoding.findNearby(lat, lng, { level: 5 })`. Used when the browser provides a GPS position to pre-fill the village selection. Returns `NearbyAreasResponse`.

Both sit on a new `/geobox` router prefix in `backend/app/api/v1/`.

### Frontend — property creation form

The `city` selector becomes a **searchable combobox**:

- Debounced 300ms, minimum 3 characters before search fires
- Results show village name + `parent_name` (district) as secondary text
- On selection: populates `address.city`, stores `AdminArea.hierarchy` for future use by `addresses.create()`
- **"Use my location"** button (shown only when `navigator.geolocation` is available): calls nearby-areas endpoint, pre-selects closest village

**Degradation:** if the endpoint is unreachable or empty, the combobox falls back to the existing `UG_CITIES` list. No error banner. No disruption to the save operation.

### DPPA consent for `addresses.create()`

When a phone number is included and a new GeoBox address is being minted, `addresses.recordConsent(phone, shareDelivery, shareContact)` must be called first. The consent record ID should be stored alongside the geocode for audit purposes.

> **Recommendation:** ship village search autocomplete in Phase 3. Defer `addresses.create()` to a Phase 3b sprint after basic autocomplete is validated.

---

## 13. Phase 0c — Production Submission

**Timing:** After Phase 3 QA sign-off | **Effort:** 1 hour | **Risk:** Low

This is an operational step — no code changes, no deployment.

1. Submit sandbox app via `POST /developer/apps/{appId}/submit` using the `business_client_id` path (see [section 5, Stage 4](#stage-4--submit-for-production)).
2. GeoBox Digital Services developer-admin approves. Production `client_id` + `client_secret` displayed once — **save immediately**.
3. In Crib `/admin/integrations`: enter production `client_id` in `geobox.client_id` (not secret). Enter production `client_secret` in `geobox.client_secret` (Fernet-encrypted on save, never re-displayed).
4. Change `geobox.environment` from `sandbox` to `production`.
5. Click **Test Connection** — verify emerald success badge appears.
6. Smoke test: enter a known Uganda geocode, confirm `full_address` and `nav_url` resolve from the live GeoBox production API.

The sandbox credentials are replaced. If rollback is ever needed, re-enter sandbox values and flip the environment flag.

---

## 14. Phase 4 — WhatsApp Address Onboarding (Later Sprint)

**Effort:** 5–8 days | **Depends on:** Phase 3 complete; cross-team design with GeoBox | **Risk:** Medium-high

### Value proposition

A significant portion of Crib's target tenant market — students, informal sector workers — does not use smartphones capable of running a web app. WhatsApp is near-universal. GeoBox already operates a production-grade multi-step WhatsApp address registration flow (`WhatsAppSessionManager`). Phase 4 allows Crib to surface this during tenant onboarding.

### What is required from GeoBox

GeoBox must expose a **webhook relay**: Crib sends a tenant phone number → GeoBox initiates the WhatsApp session → GeoBox calls back a Crib webhook endpoint with the completed geocode. This keeps the WhatsApp flow self-contained in GeoBox and avoids Crib holding Meta API credentials for a second WhatsApp number. Inter-service calls use the existing M2M OAuth client credentials.

### High-level Crib flow

1. During tenant onboarding, if the unit has no geocode and a phone number is confirmed, show **"Register Address via WhatsApp"**.
2. Crib calls a GeoBox endpoint, initiating a WhatsApp session for the tenant's phone number.
3. Tenant completes the WhatsApp conversation.
4. GeoBox calls `POST /webhooks/geobox/address_registered` on Crib with the new geocode.
5. Crib stores the geocode on the tenant's `Unit`.

> **This phase requires a design session with GeoBox engineers before specification is final.**

---

## 15. Testing Strategy

### Per-phase verification gates

#### Phase 0a — Settings migration

- Migration applies cleanly on dev DB; 4 `geobox.*` rows present in `system_settings`.
- `GET /admin/settings` returns a `geobox` key in the response object.
- `PUT /admin/settings/geobox.client_secret` with a test value returns `"••••••"` — secret is never echoed back.
- GeoBox card renders in `/admin/integrations` with correct environment badge colour.

#### Phase 0a — Test connection

| Scenario | Expected result |
|---|---|
| Valid sandbox credentials | ✅ `CheckCircle2` — "Connection successful" |
| Missing `client_id` | ❌ `XCircle` — "GeoBox credentials not configured" |
| Wrong `client_secret` | ❌ `XCircle` — "Unauthorized — check client_id and client_secret" |
| `geocoding_enabled = false` | ❌ `XCircle` — "GeoBox geocoding is disabled" |

#### Phase 1 — Geocode field

| Scenario | Expected result |
|---|---|
| Create property without geocode | `geocode: null` in response, no error |
| Create property with `geocode: "UGKAN-JF5"` | Stored and returned correctly |
| `GET /properties/{id}/geocode` — geocode set | `full_address`, `nav_url`, `landmark_description` populated from sandbox |
| `GET /properties/{id}/geocode` — no geocode | `{ "geocode": null }` — no 404, no 500 |
| Credentials blanked — same endpoint | Returns `{ "geocode": null }`, no exception (Principle P1) |

#### Phase 2 — Tenant directions (Playwright)

- Tenant with current lease and geocoded unit → "How to find us" section visible, nav_url opens correctly.
- Tenant with no geocoded unit → Directions section hidden entirely, no error banner.

#### Phase 3 — Address autocomplete

| Scenario | Expected result |
|---|---|
| Type "Ntinda" in village field | GeoBox-sourced dropdown appears |
| Select a village | `address.city` populated with village name |
| GeoBox credentials blanked | `UG_CITIES` fallback list shows — no error banner |
| Full property form submit | Saves successfully, no regression on other fields |

### Sandbox vs production rule

All automated tests and CI/CD pipelines use sandbox credentials. `geobox.environment = sandbox` is enforced in the test environment database. Production credentials exist only in staging and production databases.

A Playwright smoke test runs against staging after Phase 0c to verify a known production geocode resolves correctly before the production environment is considered live.

---

## 16. Go-Live Checklist

| # | Action | Who | Verified when |
|---|---|---|---|
| 1 | Deploy migration 039 — 4 `geobox.*` rows in `system_settings` | Backend engineer | `alembic current` at head; rows present in DB |
| 2 | Create `internal` subscription tier in GeoBox | GeoBox admin | `SubscriptionTierResponse.name == "internal"` |
| 3 | Create Crib sandbox app in developer portal; save `client_secret` | GeoBox engineer | `CreateAppResult.credentials` received and saved |
| 4 | Enter sandbox credentials in Crib `/admin/integrations` | Crib superadmin | Test Connection returns ✅ (amber SANDBOX badge) |
| 5 | Deploy Phases 1 + 2 | Backend + frontend | Property geocode endpoint live; tenant directions render correctly |
| 6 | Deploy Phase 3 | Backend + frontend | Village search combobox live; `UG_CITIES` fallback verified |
| 7 | QA sign-off: all phase test gates passed on sandbox | QA | Sign-off recorded |
| 8 | Submit sandbox app for production (Phase 0c step 1) | GeoBox engineer | `AppSubmissionResponse.status == "pending"` |
| 9 | Developer-admin approves production submission | GeoBox admin | `AppSubmissionResponse.status == "approved"` |
| 10 | Enter production credentials in Crib admin | Crib superadmin | Test Connection returns ✅ |
| 11 | Flip `geobox.environment` to `production` | Crib superadmin | Emerald PRODUCTION badge visible |
| 12 | Smoke test: known geocode lookup against production | Crib superadmin | `UGKAN-JF5` resolves to correct `full_address` and `nav_url` |
| 13 | Smoke test: village search returns live results | Crib superadmin | Typing "Ntinda" returns production villages |
| 14 | Monitor 24 hours for GeoBox errors in backend logs | Backend engineer | No `geobox.resolve_failed` or `geobox.search_failed` events |

---

## 17. What NOT to Do

| Practice | Why not |
|---|---|
| Store credentials in `.env` / Docker secrets | Bypasses encryption, audit trail, and admin UI rotation. Requires a full redeploy to change. |
| Call GeoBox directly from the Next.js frontend | Exposes the client secret in browser contexts. All calls go through the FastAPI backend. |
| Put GeoBox settings in `/admin/platform` | Platform is for business configuration (currency, timezone, branding). API credentials belong in `/admin/integrations`. |
| Store sandbox and production credentials simultaneously | Creates a more complex UI and audit trail. Switch environments by overwriting the active credential pair. |
| Skip the Test Connection endpoint | Misconfiguration is invisible until a geocode lookup fails silently at runtime when a landlord is mid-onboarding. |
| Make `geocode` required on property create | Breaks all existing properties and current landlord workflows. Must remain nullable. |
| Submit for production before Phase 3 QA | Production credentials are issued once. Submitting while the feature is still changing is premature. |
| Use `company_details` in `AppSubmissionCreate` | Creates a duplicate `BusinessUser` record in GeoBox. GeoBox Digital Services already has a verified one — always use the `business_client_id` path. |
| Apply the `free` tier to the Crib business user | Free has rate limits designed for API evaluation. It would throttle production Crib during peak onboarding. Use the `internal` tier. |

---

## 18. Summary Table

| Phase | What it delivers | Effort | Timing | Credential needed |
|---|---|---|---|---|
| **0a** | 4 `geobox.*` settings, GeoBox card in admin integrations, test connection, backend HTTP client factory | 0.5 day | Sprint 1, Day 1 | Sandbox (just entered) |
| **0b** | Internal billing tier in GeoBox — zero cost, usage tracked for capacity | 30 min | Parallel with 0a | N/A — GeoBox admin action |
| **1** | Nullable `geocode` on `Property` + `Unit`; `GET /geocode` endpoint; optional verify field on forms | 1–2 days | Sprint 1 | Sandbox |
| **2** | Tenant portal: landmark description, nav_url "Open Navigation" button, geocode copy badge | 0.5 day | Sprint 1 | Sandbox (reuses Phase 1 endpoint) |
| **3** | Village search autocomplete replacing city dropdown; 2 proxy endpoints; GPS pre-fill; DPPA consent | 2–3 days | Sprint 2 | Sandbox |
| **0c** | Production submission, same-owner approval, credential rotation in admin UI | 1 hour | After Phase 3 QA sign-off | Production issued at this step |
| **4** | WhatsApp address onboarding for non-smartphone tenants (via GeoBox webhook relay) | 5–8 days | Later sprint | Production + WhatsApp relay |

---

> **Key principle throughout:** this integration is additive-only at every phase. Phases 0a, 1, and 2 form the minimum viable integration and can ship as a single sprint. Phase 3 is a standalone sprint. Phase 4 requires a cross-team design session with GeoBox engineers and is a separate project commitment. At no point does any phase require removing or altering existing Crib functionality.

---

*Document maintained by GeoBox Digital Services — Engineering. Update this file when phase scope, timing, or technical decisions change.*
