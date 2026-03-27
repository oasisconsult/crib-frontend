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
  noticeDateGiven?: string;
  noticeEffectiveDate?: string;
  closedAt?: string;
  terminatedAt?: string;
  terminationReason?: string;
  // Documents
  documentUrl?: string;
  // Related
  renewedFromLeaseId?: string;
  notes?: string;
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
