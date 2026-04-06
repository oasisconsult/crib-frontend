import { apiGet, apiPost, apiPut, apiDelete } from "./client";
import type { Lease, LeaseAuditEntry, PaginatedResponse, QueryParams } from "@/types";
import type { LeaseState, LeaseType } from "@/types";

/**
 * Transform the flat backend LeaseOut shape into the nested frontend Lease type.
 *
 * The backend returns:
 *   { status, startDate, monthlyRent, rentDayOfMonth, ... }
 *
 * The frontend expects:
 *   { state, terms: { startDate, monthlyRent, paymentDueDay, ... }, ... }
 */
function toLeaseModel(raw: Record<string, unknown>): Lease {
  const isRolling = raw.isRolling as boolean;
  return {
    id: raw.id as string,
    // backend "status" maps to frontend "state"
    state: (raw.status as LeaseState) ?? "draft",
    // derive type from isRolling flag (backend has no "type" field)
    type: (isRolling ? "periodic" : "fixed_term") as LeaseType,
    landlordId: raw.organisationId as string,
    tenantId: (raw.tenantId as string) ?? "",
    propertyId: raw.propertyId as string,
    unitId: (raw.unitId as string) ?? "",
    reference: raw.id as string,
    terms: {
      startDate: raw.startDate as string,
      endDate: (raw.endDate as string) ?? undefined,
      monthlyRent: raw.monthlyRent as number,
      depositAmount: (raw.depositAmount as number) ?? 0,
      currency: raw.currency as string,
      paymentDueDay: raw.rentDayOfMonth as number,
      noticePeriodDays: raw.noticePeriodDays as number,
      gracePeriodDays: raw.gracePeriodDays as number,
      lateFeeType: raw.lateFeeType as "flat" | "percentage",
      lateFeeValue: raw.lateFeeValue as number,
    },
    clauses: [],
    signatures: [],
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
    activatedAt: (raw.signedAt as string) ?? undefined,
    terminatedAt: (raw.terminatedAt as string) ?? undefined,
    terminationReason: (raw.terminationReason as string) ?? undefined,
    renewedFromLeaseId: (raw.renewalOfLeaseId as string) ?? undefined,
    notes: (raw.notes as string) ?? undefined,
  };
}

function toPaginatedLeases(raw: Record<string, unknown>): PaginatedResponse<Lease> {
  const data = (raw.data as Record<string, unknown>[]).map(toLeaseModel);
  const total = raw.total as number;
  const pageSize = (raw.pageSize as number) || 20;
  const page = (raw.page as number) || 1;
  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Flatten the frontend Lease shape into the flat payload the backend expects.
 *
 * The frontend Lease has:
 *   { terms: { startDate, monthlyRent, paymentDueDay, ... }, tenantId, unitId, ... }
 *
 * The backend LeaseCreate expects:
 *   { startDate, monthlyRent, rentDayOfMonth, tenantId, unitId, ... }
 */
function toLeaseCreatePayload(data: Omit<Lease, "id" | "createdAt" | "updatedAt" | "state">) {
  const { terms, unitId, tenantId, notes } = data;
  return {
    unitId,
    tenantId,
    startDate: terms.startDate,
    endDate: terms.endDate ?? null,
    monthlyRent: terms.monthlyRent,
    currency: terms.currency,
    depositAmount: terms.depositAmount ?? null,
    rentDayOfMonth: terms.paymentDueDay,
    noticePeriodDays: terms.noticePeriodDays,
    gracePeriodDays: terms.gracePeriodDays,
    lateFeeType: terms.lateFeeType,
    lateFeeValue: terms.lateFeeValue,
    notes: notes ?? null,
  };
}

export const leasesApi = {
  list: async (params?: QueryParams) => {
    const raw = await apiGet<Record<string, unknown>>("/leases", params);
    return toPaginatedLeases(raw);
  },

  get: async (id: string) => {
    const raw = await apiGet<Record<string, unknown>>(`/leases/${id}`);
    return toLeaseModel(raw);
  },

  create: async (data: Omit<Lease, "id" | "createdAt" | "updatedAt" | "state">) => {
    const raw = await apiPost<Record<string, unknown>>("/leases", toLeaseCreatePayload(data));
    return toLeaseModel(raw);
  },

  update: async (id: string, data: Partial<Lease>) => {
    const raw = await apiPut<Record<string, unknown>>(`/leases/${id}`, data);
    return toLeaseModel(raw);
  },

  delete: (id: string) =>
    apiDelete<void>(`/leases/${id}`),

  // State transitions
  transition: async (id: string, event: string, payload?: object) => {
    const raw = await apiPost<Record<string, unknown>>(`/leases/${id}/transition`, { event, ...payload });
    return toLeaseModel(raw);
  },

  // Signatures
  signLease: async (id: string, data: { party: "tenant" | "landlord"; signatureDataUrl: string }) => {
    const raw = await apiPost<Record<string, unknown>>(`/leases/${id}/sign`, data);
    return toLeaseModel(raw);
  },

  // Generate PDF
  generateDocument: (id: string) =>
    apiPost<{ url: string }>(`/leases/${id}/document`),

  // Audit log
  getAudit: (id: string) =>
    apiGet<LeaseAuditEntry[]>(`/leases/${id}/audit`),

  // Renewal
  renew: async (id: string, data: Partial<Lease>) => {
    const raw = await apiPost<Record<string, unknown>>(`/leases/${id}/renew`, data);
    return toLeaseModel(raw);
  },
};
