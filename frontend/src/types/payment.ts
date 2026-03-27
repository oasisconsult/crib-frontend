import type { PaymentState, RentState, LateFeeState } from "./states";

export type PaymentCategory = "rent" | "deposit" | "late_fee" | "maintenance" | "utility" | "other";
export type PaymentMethod = "bank_transfer" | "card" | "cash" | "direct_debit" | "cheque";

export interface Payment {
  id: string;
  state: PaymentState;
  category: PaymentCategory;
  method?: PaymentMethod;
  // Parties
  tenantId: string;
  landlordId: string;
  leaseId: string;
  propertyId: string;
  unitId: string;
  // Amounts
  amount: number;
  currency: string;
  // Dates
  dueDate: string;
  paidAt?: string;
  reconciledAt?: string;
  // References
  reference: string;
  externalReference?: string;
  // Linked
  rentPeriodId?: string;
  lateFeeId?: string;
  // Meta
  notes?: string;
  receiptUrl?: string;
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
