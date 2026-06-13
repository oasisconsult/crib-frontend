export type EvictionNoticeType =
  | "non_payment"
  | "breach"
  | "end_of_term"
  | "redevelopment";

export type EvictionNoticeStatus =
  | "issued"
  | "served"
  | "disputed"
  | "withdrawn"
  | "executed";

export interface EvictionNotice {
  id: string;
  organisationId: string;
  leaseId: string;
  propertyId: string | null;
  unitId: string | null;
  tenantId: string | null;
  issuedBy: string;
  noticeType: EvictionNoticeType;
  status: EvictionNoticeStatus;
  reason: string;
  effectiveDate: string;
  courtReference: string | null;
  issuedAt: string;
  servedAt: string | null;
  disputedAt: string | null;
  withdrawnAt: string | null;
  executedAt: string | null;
  noticePdfUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvictionNoticeCreate {
  noticeType: EvictionNoticeType;
  reason: string;
  effectiveDate: string;
  courtReference?: string | null;
  notes?: string | null;
}

export interface EvictionNoticeListOut {
  data: EvictionNotice[];
  total: number;
}

export const NOTICE_TYPE_LABELS: Record<EvictionNoticeType, string> = {
  non_payment:   "Non-Payment of Rent",
  breach:        "Breach of Terms",
  end_of_term:   "End of Tenancy",
  redevelopment: "Redevelopment",
};

/** Minimum days between today and effective_date, per type. */
export const MIN_NOTICE_DAYS: Record<EvictionNoticeType, number> = {
  non_payment:   14,
  breach:        14,
  end_of_term:   30,
  redevelopment: 180,
};

export const STATUS_LABELS: Record<EvictionNoticeStatus, string> = {
  issued:    "Issued",
  served:    "Served",
  disputed:  "Disputed",
  withdrawn: "Withdrawn",
  executed:  "Executed",
};

export const STATUS_COLORS: Record<EvictionNoticeStatus, string> = {
  issued:    "bg-amber-100 text-amber-800",
  served:    "bg-orange-100 text-orange-800",
  disputed:  "bg-purple-100 text-purple-800",
  withdrawn: "bg-gray-100 text-gray-600",
  executed:  "bg-red-100 text-red-800",
};

/** Active statuses — only one may exist per lease at a time. */
export const ACTIVE_STATUSES: EvictionNoticeStatus[] = ["issued", "served"];
