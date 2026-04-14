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
    signatures: ((raw.signatures as Record<string, unknown>[]) ?? []).map((s) => ({
      party: s.party as "tenant" | "landlord",
      name: (s.name as string) ?? "",
      status: (s.status as "pending" | "signed" | "declined") ?? "pending",
      signedAt: (s.signedAt as string) ?? undefined,
      signatureDataUrl: (s.signatureDataUrl as string) ?? undefined,
    })),
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

  // State transitions — maps frontend events to the correct backend endpoints.
  // The backend has no generic /transition endpoint; each lifecycle action has
  // its own route. This mapper keeps the rest of the frontend unchanged.
  transition: async (id: string, event: string, payload?: object) => {
    let raw: Record<string, unknown>;
    switch (event) {
      case "LEASE_ACTIVATED":
        raw = await apiPost<Record<string, unknown>>(`/leases/${id}/activate`, payload ?? {});
        break;
      case "LEASE_TERMINATED":
        raw = await apiPost<Record<string, unknown>>(`/leases/${id}/terminate`, payload ?? {});
        break;
      case "LEASE_CLOSED":
      case "NOTICE_GIVEN":
        // NOTICE_GIVEN / CLOSE are not separate backend states — map to expire
        raw = await apiPost<Record<string, unknown>>(`/leases/${id}/expire`, payload ?? {});
        break;
      case "LEASE_SENT":
        // "Send for Signature" in the manager UI — direct-activate (manager fast-path).
        // Tenant-facing signing now lives in the onboarding payment flow.
        raw = await apiPost<Record<string, unknown>>(`/leases/${id}/activate`, payload ?? {});
        break;
      default:
        throw new Error(`Unknown lease event: ${event}`);
    }
    return toLeaseModel(raw);
  },

  // Signatures
  signLease: async (id: string, data: { party: "tenant" | "landlord"; signatureDataUrl: string }) => {
    const raw = await apiPost<Record<string, unknown>>(`/leases/${id}/sign`, data);
    return toLeaseModel(raw);
  },

  // Pre-sign agreement (manager signs before tenant)
  presignAgreement: (id: string, signatureDataUrl: string) =>
    apiPost<Record<string, unknown>>(`/leases/${id}/agreement/presign`, { signatureDataUrl }),

  // Generate PDF
  generateDocument: (id: string) =>
    apiPost<{ url: string }>(`/leases/${id}/document`),

  // Audit log
  getAudit: (id: string) =>
    apiGet<LeaseAuditEntry[]>(`/leases/${id}/audit`),

  // Send onboarding link — links the lease to the tenant's invite
  sendOnboarding: (id: string) =>
    apiPost<{ id: string; token: string; email: string; leaseId: string | null; expiresAt: string }>(`/leases/${id}/send-onboarding`),

  // Manager confirms all onboarding payments → advances lease to payment_secured
  confirmOnboardingPayments: (id: string) =>
    apiPost<{ leaseId: string; leaseStatus: string; payments: unknown[] }>(`/leases/${id}/confirm-payments`),

  // Renewal
  renew: async (id: string, data: Partial<Lease>) => {
    const raw = await apiPost<Record<string, unknown>>(`/leases/${id}/renew`, data);
    return toLeaseModel(raw);
  },
};
