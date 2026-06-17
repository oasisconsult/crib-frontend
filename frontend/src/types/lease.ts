import type { LeaseState } from "./states";

export type LeaseType = "fixed_term" | "periodic" | "short_let";
export type SignatureStatus = "pending" | "signed" | "declined";

export interface LeaseSignature {
  party: "tenant" | "landlord";
  name: string;
  signedAt?: string;
  ipAddress?: string;
  signatureDataUrl?: string;
  status: SignatureStatus;
}

export interface LeaseTerm {
  startDate: string;
  endDate?: string;
  monthlyRent: number;
  depositAmount: number;
  currency: string;
  paymentDueDay?: number; // day of month rent is due (1–28)
  noticePeriodDays: number;
  gracePeriodDays: number;
  lateFeeType: "flat" | "percentage";
  lateFeeValue: number;
}

export interface LeaseClause {
  id: string;
  title: string;
  content: string;
  required: boolean;
}

export interface Lease {
  id: string;
  state: LeaseState;
  type: LeaseType;
  // Parties
  landlordId: string;
  tenantId: string;
  propertyId: string;
  unitId: string;
  // Details
  reference: string;
  terms: LeaseTerm;
  clauses: LeaseClause[];
  signatures: LeaseSignature[];
  // Dates
  createdAt: string;
  updatedAt: string;
  activatedAt?: string;
  noticeGivenAt?: string;       // when tenant submitted notice
  noticeVacateDate?: string;    // tenant's intended move-out date
  /** @deprecated use noticeGivenAt */
  noticeDateGiven?: string;
  /** @deprecated use noticeVacateDate */
  noticeEffectiveDate?: string;
  closedAt?: string;
  terminatedAt?: string;
  terminationReason?: string;
  // Documents
  documentUrl?: string;
  sealedPdfUrl?: string;      // cryptographically sealed agreement (set after both parties sign)
  // Onboarding / import
  termsAcceptedAt?: string;
  agreementPreviewSnapshot?: Record<string, unknown>;
  finalAgreementSnapshot?: Record<string, unknown>;
  onboardingCompletedAt?: string;
  onboardingPaymentIds?: string[];
  paperAgreementAcknowledged?: boolean;
  // Advance payment
  advanceMonths?: number;
  // Related
  renewedFromLeaseId?: string;
  notes?: string;
  // Denormalised display names from API
  tenantName?: string;
  unitName?: string;
  propertyName?: string;
}

export interface LeaseAuditEntry {
  id: string;
  leaseId: string;
  event: string;
  fromState?: LeaseState;
  toState?: LeaseState;
  performedBy: string;
  performedAt: string;
  notes?: string;
}
