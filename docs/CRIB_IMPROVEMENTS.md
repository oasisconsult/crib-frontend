# Crib Codebase Audit & Gap Analysis

## Context
Crib is a property management platform being built for the Ugandan/East African market. Before reviewing the code, here is research-backed intelligence on what actually matters to users in this market:

---

## Market Research Summary

### What Takes Most Time for Property Managers & Landlords (Monthly)
1. **Rent collection & chasing late payments** — Most landlords go door-to-door or manually match MTN/Airtel MoMo messages to tenant names. No automation.
2. **Maintenance coordination** — No ticketing system. Tenants call/WhatsApp a caretaker. Nothing is tracked.
3. **Tenant screening & vacancy filling** — Entirely manual. No standardised process.
4. **Lease & legal compliance** — The Landlord & Tenant Act 2022 requires written agreements for tenancies above UGX 500,000/month, 90-day notice for rent increases (capped at 10% annually), and EFRIS receipts for every payment.
5. **Financial reporting** — Most use Excel or paper ledgers. URA now mandates EFRIS receipts on every rental transaction.

### Top Tenant Complaints
1. **Illegal rent increases** — Landlords routinely exceed the 10% annual cap without 90-day notice. Tenants have no visibility or paper trail.
2. **Slow/ignored maintenance** — No formal channel to log or track repair requests. Tenants call, nothing gets recorded, nothing gets followed up.
3. **Security deposit disputes** — Landlords withhold deposits without justification. Tenants have no move-in/move-out documentation.
4. **Arbitrary/illegal eviction** — No formal notice trail. Landlords change locks without court orders.
5. **No communication channel** — Tenants have no formal way to contact management. Everything is informal WhatsApp.
6. **Utility billing disputes** — No metered tracking or itemised billing for water, electricity, garbage.

### What They Currently Use (Competitive Landscape)
- **Most small landlords (1–10 units):** Cash + exercise book ledger
- **Mid-tier landlords (5–30 units):** MTN/Airtel MoMo + WhatsApp + Excel spreadsheets
- **Professional property managers:** EazzyRent, Bomahut, RobiPMS, Evolution PMS — all primarily collections-focused, weak on maintenance tracking and tenant communication
- **Large firms:** QuickBooks/Sage + Excel — not property-specific

### Key Gaps in Current Market Solutions
- No mobile-money-native rent collection with auto-reconciliation
- No maintenance ticketing with photo evidence and status tracking
- No tenant portal / self-service for payments, complaints, documents
- No move-in/move-out inspection workflow (photos + sign-off) to protect both parties on deposits
- No EFRIS receipt generation integrated into the payment flow
- No rent increase audit trail (to enforce the 10% cap / 90-day notice requirement)
- No lease document generation and e-signature
- No utility billing module (water, electricity, garbage per unit)

---

## Your Task

You are auditing the Crib codebase. Please do the following:

### 1. Codebase Discovery
- Map the full project structure: list all top-level directories, key config files, and give a one-line description of what each part does
- Identify the tech stack (frontend framework, backend framework, database, auth, storage, queue/job system, payment integrations, third-party APIs)
- List every data model / database table you can find and briefly describe its purpose
- List every API route or endpoint you can find
- List every frontend page or screen you can find

### 2. Feature Inventory
Based on the codebase, identify which of the following features are:
- ✅ Fully implemented
- 🟡 Partially implemented or stubbed
- ❌ Missing entirely

Feature checklist:
- [ ] Tenant management (add, edit, profile, ID verification)
- [ ] Unit/property management (multi-property, multi-unit)
- [ ] Lease management (create, store, renewal, termination)
- [ ] Rent invoicing (auto-generation on due date)
- [ ] Rent collection (MTN MoMo / Airtel Money integration)
- [ ] Payment reconciliation (auto-match payment to tenant/unit)
- [ ] EFRIS receipt generation (URA tax compliance)
- [ ] Rent arrears tracking and automated reminders (SMS/WhatsApp/email)
- [ ] Landlord financial statements (monthly summary, income/expense)
- [ ] Maintenance request logging (tenant-initiated)
- [ ] Maintenance workflow (assign to contractor, status updates, completion)
- [ ] Maintenance photo evidence (before/after)
- [ ] Move-in inspection (photo documentation, tenant sign-off)
- [ ] Move-out inspection (photo documentation, damage assessment)
- [ ] Security deposit management (hold, deduction justification, refund)
- [ ] Tenant communication / announcements (bulk SMS or in-app)
- [ ] Tenant self-service portal (pay rent, log issues, view statements)
- [ ] Utility billing (water, electricity, garbage per unit)
- [ ] Rent increase workflow (90-day notice, 10% cap enforcement, audit trail)
- [ ] Eviction notice workflow (legal notice generation, audit trail)
- [ ] Vacancy marketing (listing vacant units)
- [ ] Tenant screening (ID check, references)
- [ ] Document storage (leases, receipts, notices per tenant)
- [ ] Role-based access (landlord, property manager, tenant, caretaker)
- [ ] Multi-property / multi-landlord support (for property management companies)
- [ ] Reporting dashboard (occupancy rate, collection rate, arrears, revenue)
- [ ] Mobile responsiveness / PWA or native mobile app

### 3. Gap Analysis
For each missing or partial feature, provide:
- **Why it matters** (link it back to the market research above — which complaint or pain point does it address?)
- **Estimated complexity** (Low / Medium / High)
- **Dependencies** (what needs to exist first before this can be built?)

### 4. Code Quality Observations
As you review, flag:
- Any areas with no error handling that could cause silent failures (especially in payment flows)
- Any missing database indexes on high-query fields (tenant_id, unit_id, payment dates)
- Any N+1 query patterns on listing views
- Any hardcoded values that should be configuration (e.g. currency, country code, payment provider keys)
- Any auth/permission gaps (routes accessible without the right role)
- Any missing audit logs on sensitive operations (rent changes, deposit deductions, evictions)
- Any places where files/documents are stored without access control

### 5. Prioritised Implementation Roadmap
Based on the gap analysis, produce a prioritised roadmap with three phases:

**Phase 1 — Core Loop (must-have for any paying customer)**
The minimum set of features that makes Crib genuinely useful to a landlord managing 5–50 units, replacing their Excel + MoMo + WhatsApp setup.

**Phase 2 — Compliance & Trust (what separates Crib from basic tools)**
Features that protect both landlord and tenant legally, reduce disputes, and make Crib defensible against competitors.

**Phase 3 — Growth & Scale (what makes Crib the platform for professional property managers)**
Features that support multi-property companies, reporting, integrations, and tenant self-service at scale.

For each phase, list:
- Features to build
- Suggested order of implementation within the phase
- Any external integrations needed (payment APIs, SMS gateways, URA EFRIS API, etc.)

### 6. Integration Priorities
Identify and recommend the following integrations where not yet in place:
- **MTN MoMo API** (Uganda) — for rent collection and automated reconciliation
- **Airtel Money API** (Uganda) — secondary mobile money rail
- **URA EFRIS API** — for generating compliant receipts on every rent transaction
- **Africa's Talking or Twilio** — for SMS reminders and notifications
- **WhatsApp Business API** — tenants in Uganda live in WhatsApp; this is the highest-leverage communication channel
- **Cloudinary or S3/MinIO** — for maintenance photos, inspection images, lease document storage

---

## Output Format
Please structure your response as:

1. **Project Overview** — tech stack, architecture summary
2. **Data Model Map** — all models/tables found
3. **API & Route Map** — all endpoints found
4. **Feature Inventory Table** — ✅ / 🟡 / ❌ for every feature above
5. **Gap Analysis** — prioritised by market impact
6. **Code Quality Flags** — specific file/line references where possible
7. **Phased Roadmap** — Phase 1 / 2 / 3 with rationale
8. **Integration Checklist** — status of each key integration

Be specific. Reference actual file paths, model names, and function names wherever you find them. Do not guess — if something is not in the codebase, mark it as missing rather than assuming it exists elsewhere.