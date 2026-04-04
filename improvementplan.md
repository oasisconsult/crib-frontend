Good. I now have everything I need. Here is the comprehensive plan.

Crib Platform Upgrade Plan — Fintech-Grade
What I found in the code
Critical bug confirmed in payment_service.py:447:


schedule.amount_paid = float(schedule.amount_paid) + float(p.amount)
This is the exact 1-payment = 1-schedule assumption the PDF flags. One payment cannot span multiple schedules.

Other confirmed gaps:

_calculate_late_fee_amount at line 246 uses amount_due (original rent), not outstanding balance
Deposit.amount_held is pre-set at lease activation, not driven by actual payments — no link to Payment
get_ledger() is aggregated SQL, not an immutable audit trail
No PaymentAllocation, LedgerEntry, MobileMoneyTransaction, or TenantWallet tables
Implementation Phases
Phase 1 — Core Financial Engine (Backend, Non-negotiable)
1A. New Models (backend/app/models/)

File	Model	Purpose
payment_allocation.py	PaymentAllocation	Maps one Payment → many RentSchedules with amount_applied
ledger.py	LedgerEntry	Immutable per-lease audit trail with running balance_after
mobile_money.py	MobileMoneyTransaction	Stores raw MTN/Airtel webhook payloads before matching
wallet.py	TenantWallet + WalletTransaction	Tenant credit balance for overpayments / advance payments
1B. New Services (backend/app/services/)

File	Functions
ledger_service.py	get_last_balance(), create_ledger_entry()
payment_allocation_service.py	allocate_payment(db, lease_id, payment) → remaining
wallet_service.py	credit_wallet(), debit_wallet(), get_balance()
1C. Refactor payment_service.py

confirm_payment() — replace line 447 with allocate_payment() + create_ledger_entry() + deposit linking
refund_payment() — reverse PaymentAllocation rows, write debit ledger entry, revert schedule statuses
_calculate_late_fee_amount() — change arg from amount_due to outstanding = amount_due + late_fee_applied - amount_paid
create_payment() — remove hard rent_schedule_id requirement (payment can be lease-level, allocation decides)
get_ledger() — rewrite to return real LedgerEntry rows, not aggregated SQL
1D. Alembic Migration

One migration file adding:

payment_allocations table
ledger_entries table
mobile_money_transactions table
tenant_wallets table
wallet_transactions table
Remove NOT NULL constraint on payments.rent_schedule_id (already nullable ✓)
1E. New API Endpoints

Method	Path	Purpose
GET	/leases/{id}/ledger	Real immutable ledger with pagination
GET	/leases/{id}/payments/{pid}/allocations	Allocation breakdown for a payment
GET	/tenants/{id}/wallet	Tenant wallet balance
POST	/leases/{id}/payments/{pid}/allocations	Manual re-allocation (admin)
1F. Tests (backend/tests/)

File	Coverage
test_payment_allocation.py	Partial payment, multi-month span, overpayment → wallet, refund reversal
test_ledger.py	Credit/debit entries, running balance, dispute trace
test_wallet.py	Overpayment credited, wallet auto-applied to next schedule
Phase 2 — Unified Payments Gateway (Backend, Advanced)
2A. Gateway Architecture


backend/app/payments/
  gateway/
    base.py       # PaymentProvider ABC: initiate_payment, check_status, handle_webhook
    factory.py    # get_provider("mobile_money_mtn") → MTNProvider
    service.py    # unified initiate_payment() entry point
  providers/
    mtn.py        # Full MTN MoMo implementation
    airtel.py     # Stub (ready for Airtel API)
    bank.py       # Manual confirm flow
    cash.py       # Manual confirm flow
  webhooks/
    mtn.py        # POST /webhooks/mtn
    airtel.py     # POST /webhooks/airtel (stub)
2B. MTN MoMo Integration


backend/app/integrations/mtn/
  client.py     # get_token(), request_to_pay(), get_status()
  service.py    # initiate_mtn_payment()
  webhook.py    # mtn_webhook() handler
Flow: POST /payments/momo → MTN API → prompt on phone → webhook → match_payment() → allocate_payment() → ledger + wallet

2C. Matching Engine (backend/app/services/matching_service.py)

Priority 1: Exact match — phone == tenant.phone AND amount == outstanding due
Priority 2: Fuzzy match — phone matches, amount within 5% tolerance
Priority 3: unmatched — stored, triggers admin notification for manual matching
2D. Celery Polling Worker

New task reconcile_pending_mtn_transactions — runs every 5 minutes, polls MTN for all MobileMoneyTransaction rows with status=pending older than 2 minutes (webhook fallback)

2E. Security Hardening for Webhooks

Configurable MTN_ALLOWED_IPS env var — reject requests from unknown IPs
Always re-verify status with MTN after webhook (never trust payload blindly)
raw_payload stored as JSONB for full audit
Idempotency via external_id unique constraint
2F. Config additions to core/config.py


MTN_BASE_URL, MTN_SUBSCRIPTION_KEY, MTN_API_USER, MTN_API_KEY
MTN_ENV (sandbox | production), MTN_CALLBACK_URL, MTN_ALLOWED_IPS
2G. Tests

File	Coverage
test_payment_gateway.py	Provider dispatch, MTN mock, cash/bank manual flows
test_matching_engine.py	Exact match, fuzzy match, unmatched, duplicate idempotency
test_mtn_webhook.py	Successful webhook, failed webhook, replay attack prevention
Phase 3 — Frontend
3A. Reconciliation Dashboard (frontend/src/app/(dashboard)/reconciliation/)

Summary cards: Matched / Unmatched / Pending / Total collected
Transactions table: Phone, Amount, Provider, Time, Status, Action
Manual match modal: select tenant from dropdown → confirm
Filter bar: Date range, Provider, Status
React Query hook: useReconciliationSummary(), useMobileMoneyTransactions()
3B. Tenant Payment Portal (frontend/src/app/(portal)/payments/)

Balance card: Outstanding balance + Wallet credit
Pay Now → method selector (MTN MoMo / Airtel / Bank Transfer)
MTN flow: phone input → "Check your phone" message → 3s polling until confirmed/failed
Bank flow: upload screenshot → status = pending → landlord confirms
Payment instructions component (MTN USSD steps)
Full payment history list
3C. Payment Timeline Component (frontend/src/components/payments/PaymentTimeline.tsx)

Vertical timeline, color-coded left border (green=confirmed, yellow=pending, red=failed)
Expandable cards showing allocation breakdown per schedule
Filter by month / status
useInfiniteQuery for long histories
Auto-refresh every 3s when any payment is pending
3D. New API Services

File	Functions
reconciliationService.ts	getTransactions(), manualMatch(), getSummary()
walletService.ts	getWalletBalance(), getWalletTransactions()
momoService.ts	initiatePayment(), getPaymentStatus()
Phase 4 — GDPR & Security
anonymise endpoint (already exists) extended to scrub phone_number in MobileMoneyTransaction and PII in raw_payload
Data retention Celery task: strip PII from raw_payload older than 90 days (keep financial amounts for audit)
Rate limiting on POST /webhooks/* (already have nginx rate limiting — ensure it applies)
Ensure all new endpoints are org-scoped with require_org_access()
Questions Before I Write Code
I need answers on a few real decisions that affect the implementation:

1. Deposit model behaviour change — Currently deposit.amount_held is set to lease.deposit_amount at lease activation (not from an actual payment). The PDF says deposits should only be credited when a Payment with category=deposit is confirmed. This is a breaking change — existing records already have amount_held pre-populated. Do you want to:

(a) Keep existing behaviour and only link new deposit payments going forward, or
(b) Zero amount_held at creation and require a confirmed payment to build it up?
2. Kafka vs Redis Streams — You already have Redis + Celery. Kafka adds significant ops overhead (new container, ZooKeeper/KRaft). For Uganda-market scale, Redis Streams is equivalent and simpler. Should we use Redis Streams (simpler, already running) or Kafka (as the PDF suggests)?

3. Airtel Money — Full Airtel API integration now, or a proper stub provider (same interface, status=pending, manual confirm)? Airtel's API differs significantly from MTN MoMo.

4. Payment.rent_schedule_id — Once PaymentAllocation handles many-to-many, this FK becomes redundant but exists in the API response schema. Should we keep it nullable for backward compatibility (recommended) or remove it entirely?

5. Existing payment data migration — For any existing confirmed payments in the DB, should we backfill PaymentAllocation rows (one allocation per payment, matching its rent_schedule_id), or treat pre-migration payments as legacy with no allocations?

Once you answer these 5 questions, I'll start writing code immediately — Phase 1 first, fully tested, then Phase 2, then Phase 3.

1- b, 2- use redis streams, 3- full airtel money integration, 4- keep it nullable for backward compatibility, 5- backfill PaymentAllocation rows (one allocation per payment, matching its rent_schedule_id)
Let me read a few more files to understand the existing patterns before writing code.

Read c:\Projects\Platforms\DEV\ClaudeClones\crib\backend\app\models\base.py
Read c:\Projects\Platforms\DEV\ClaudeClones\crib\backend\app\models\__init__.py
Read c:\Projects\Platforms\DEV\ClaudeClones\crib\backend\app\models\__init__.py
Read c:\Projects\Platforms\DEV\ClaudeClones\crib\backend\app\core\config.py
Read c:\Projects\Platforms\DEV\ClaudeClones\crib\backend\app\schemas\payment.py
Globpattern: "backend/alembic/versions/*.py"
Found 8 files
Read c:\Projects\Platforms\DEV\ClaudeClones\crib\backend\alembic\versions\005_payments.py
Read c:\Projects\Platforms\DEV\ClaudeClones\crib\backend\app\schemas\payment.py (from line 101)
Read c:\Projects\Platforms\DEV\ClaudeClones\crib\backend\app\services\payment_service.py (lines 459-558)
Read c:\Projects\Platforms\DEV\ClaudeClones\crib\backend\app\worker\celery_app.py
Now I have everything I need. Setting up tasks and starting to code.

Update Todos

Phase 1A: New models (PaymentAllocation, LedgerEntry, MobileMoneyTransaction, TenantWallet, WalletTransaction)

Phase 1B: New services (ledger_service, payment_allocation_service, wallet_service)

Phase 1C: Refactor payment_service (confirm, refund, late fee, create_deposit_record)

Phase 1D: Alembic migration 009 (all new tables + backfill)

Phase 1E: New schemas (PaymentAllocationOut, LedgerEntryOut, WalletOut, MobileMoneyTransactionOut)

Phase 1F: New API endpoints (ledger entries, allocations, wallet)

Phase 1G: Tests (allocation, ledger, wallet)

Phase 2A: Unified payments gateway (base, factory, service, providers)

Phase 2B: MTN MoMo + Airtel Money integrations + webhooks

Phase 2C: Matching engine + Celery polling worker

Phase 2D: Config additions + Redis Streams event publisher

Phase 2E: Tests for gateway, matching, webhooks

Phase 3A: Reconciliation dashboard (Next.js)

Phase 3B: Tenant payment portal + payment timeline component
Write c:\Projects\Platforms\DEV\ClaudeClones\crib\backend\app\models\payme