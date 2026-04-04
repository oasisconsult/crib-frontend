import type { PaymentState, RentState, LateFeeState } from "./states";

export type PaymentCategory = "rent" | "deposit" | "late_fee" | "maintenance" | "utility" | "other";
export type PaymentMethod = "bank_transfer" | "card" | "cash" | "direct_debit" | "cheque";

export interface Payment {
  id: string;
  state: PaymentState;
  leaseId: string;
  rentScheduleId?: string | null;
  organisationId?: string;
  category: PaymentCategory;
  method?: PaymentMethod;
  // Amounts
  amount: number;
  currency: string;
  paidAt?: string;
  // References
  reference?: string | null;
  idempotencyKey?: string | null;
  // Meta
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RentSchedule {
  id: string;
  state: RentState;
  leaseId: string;
  tenantId: string;
  unitId: string;
  // Period
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amount: number;
  currency: string;
  // Linked
  paymentId?: string;
  lateFeeId?: string;
  // Audit
  generatedAt: string;
  dueReminderSentAt?: string;
  overdueReminderSentAt?: string;
}

export interface LateFee {
  id: string;
  state: LateFeeState;
  rentScheduleId: string;
  tenantId: string;
  leaseId: string;
  // Amounts
  baseAmount: number;
  feeType: "flat" | "percentage";
  feeValue: number;
  calculatedAmount: number;
  currency: string;
  // Dates
  triggeredAt: string;
  appliedAt?: string;
  paidAt?: string;
  waivedAt?: string;
  waivedBy?: string;
  waiveReason?: string;
  // Linked
  paymentId?: string;
}

export interface Deposit {
  id: string;
  leaseId: string;
  tenantId: string;
  amount: number;
  currency: string;
  receivedAt?: string;
  heldAt?: string; // Deposit protection scheme reference date
  protectionScheme?: string;
  protectionReference?: string;
  returnedAt?: string;
  returnedAmount?: number;
  deductions: DepositDeduction[];
  status: "pending" | "received" | "protected" | "partially_returned" | "returned" | "disputed";
}

export interface DepositDeduction {
  id: string;
  description: string;
  amount: number;
  evidenceUrls: string[];
  approvedAt?: string;
}

export interface LedgerEntry {
  id: string;
  date: string;
  description: string;
  category: PaymentCategory;
  debit: number;
  credit: number;
  balance: number;
  currency: string;
  paymentId?: string;
  reference?: string;
}

// New allocation-layer types

export interface LedgerEntryV2 {
  id: string;
  organisationId: string;
  leaseId: string;
  entryType: "credit" | "debit";
  amount: number;
  referenceType: string;
  referenceId: string;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerPage {
  data: LedgerEntryV2[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  currentBalance: number;
}

export interface PaymentAllocation {
  id: string;
  paymentId: string;
  rentScheduleId: string;
  amountApplied: number;
  createdAt: string;
  updatedAt: string;
}

export interface TenantWallet {
  id: string;
  tenantId: string;
  organisationId: string;
  balance: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  tenantId: string;
  organisationId: string;
  transactionType: "credit" | "debit";
  amount: number;
  referenceType: string;
  referenceId: string | null;
  description: string | null;
  balanceAfter: number;
  createdAt: string;
  updatedAt: string;
}

export interface WalletTransactionPage {
  data: WalletTransaction[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}

export type MobileMoneyStatus =
  | "pending"
  | "received"
  | "matched"
  | "unmatched"
  | "failed"
  | "expired";

export interface MobileMoneyTransaction {
  id: string;
  organisationId: string;
  provider: "MTN" | "AIRTEL";
  externalId: string;
  phoneNumber: string;
  amount: number;
  currency: string;
  status: MobileMoneyStatus;
  receivedAt: string | null;
  matchedPaymentId: string | null;
  referenceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MobileMoneyPage {
  data: MobileMoneyTransaction[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}
