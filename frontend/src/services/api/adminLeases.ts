import { apiGet, apiPatch } from "./client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AdminLease {
  id: string;
  organisationId: string;
  propertyId: string;
  unitId: string | null;
  tenantId: string | null;
  status: string;
  startDate: string;
  endDate: string | null;
  monthlyRent: number;
  currency: string;
  rentDayOfMonth: number;
  gracePeriodDays: number;
  lateFeeType: string;
  lateFeeValue: number;
  noticePeriodDays: number;
  tenantName: string | null;
  unitName: string | null;
  propertyName: string | null;
  organisationName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminLeaseListParams {
  orgId?: string;
  status?: string;
  zeroLateFeeOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface AdminLeaseListResponse {
  items: AdminLease[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}

export interface LeaseBillingRulesPatch {
  syncFromProperty?: boolean;
  rentDayOfMonth?: number | null;
  gracePeriodDays?: number | null;
  lateFeeType?: string | null;
  lateFeeValue?: number | null;
  noticePeriodDays?: number | null;
}

// ── API ───────────────────────────────────────────────────────────────────────

export const adminLeasesApi = {
  list: (params?: AdminLeaseListParams) =>
    apiGet<AdminLeaseListResponse>("/admin/leases", params as Record<string, unknown>),

  patchBillingRules: (leaseId: string, body: LeaseBillingRulesPatch) =>
    apiPatch<AdminLease>(`/admin/leases/${leaseId}/billing-rules`, body),
};
