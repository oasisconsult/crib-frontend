import type { Tenant, TenantInvite } from "./tenant";
import type { Lease } from "./lease";

// ── Wizard step keys ──────────────────────────────────────────────────────────

export type OnboardingPhase = "profile" | "payment_flow" | "complete";

export type OnboardingStep =
  | "profile"
  | "documents"
  | "agreement_preview"
  | "terms_acceptance"
  | "payment"
  | "payment_pending"
  | "payment_success"
  | "signature"
  | "done";

// ── Agreement snapshot ────────────────────────────────────────────────────────

export interface AgreementPreview {
  leaseId: string;
  tenantName: string;
  tenantEmail: string;
  propertyName: string;
  unitName: string;
  startDate: string;
  endDate?: string;
  monthlyRent: number;
  currency: string;
  depositAmount: number;
  rentDayOfMonth: number;
  noticePeriodDays: number;
  gracePeriodDays: number;
  lateFeeType: "flat" | "percentage";
  lateFeeValue: number;
  advancePaymentMonths: number;
  totalDeposit: number;
  totalAdvanceRent: number;
  totalDueAtOnboarding: number;
  generatedAt: string;
  snapshotVersion: string;
  renderedHtml: string;
}

// ── Terms acceptance ──────────────────────────────────────────────────────────

export interface TermsAcceptResult {
  leaseId: string;
  status: string;
  termsAcceptedAt: string;
}

// ── Payments ──────────────────────────────────────────────────────────────────

export type OnboardingPaymentMethod =
  | "cash"
  | "bank_transfer"
  | "mobile_money_mtn"
  | "mobile_money_airtel";

export type OnboardingPaymentCategory = "deposit" | "rent";

export interface OnboardingPaymentItem {
  category: OnboardingPaymentCategory;
  amount: number;
  currency: string;
  method: OnboardingPaymentMethod;
  reference?: string;
  idempotencyKey: string;
}

export interface OnboardingPaymentResult {
  leaseId: string;
  leaseStatus: string;
  payments: Array<{
    id: string;
    status: string;
    amount: number;
    currency: string;
    category: string;
    method: string;
    reference?: string;
    paidAt?: string;
  }>;
}

// ── Full flow status ──────────────────────────────────────────────────────────

export interface OnboardingFlowStatus {
  tenant: Tenant;
  invite: TenantInvite;
  lease: Lease | null;
  agreementPreview: AgreementPreview | null;
  onboardingPhase: OnboardingPhase;
  currentStep: OnboardingStep;
  termsAcceptedAt: string | null;
  paymentSecured: boolean;
  agreementSigned: boolean;
  isActive: boolean;
}
