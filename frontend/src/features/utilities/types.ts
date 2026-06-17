export type UtilityType = "water" | "electricity" | "internet" | "garbage" | "other";
export type BillingType = "metered" | "fixed";

export interface UtilityReading {
  id: string;
  organisationId: string;
  leaseId: string;
  unitId: string | null;
  utilityType: UtilityType;
  billingType: BillingType;
  readingDate: string;
  readingValue: number | null;
  previousValue: number | null;
  unitsConsumed: number | null;
  unitPrice: number | null;
  amount: number;
  currency: string;
  notes: string | null;
  paymentId: string | null;
  isBilled: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export const UTILITY_LABELS: Record<UtilityType, string> = {
  water:       "Water",
  electricity: "Electricity",
  internet:    "Internet / WiFi",
  garbage:     "Garbage Collection",
  other:       "Other",
};

export const UTILITY_ICONS: Record<UtilityType, string> = {
  water:       "💧",
  electricity: "⚡",
  internet:    "📶",
  garbage:     "🗑️",
  other:       "🔧",
};
