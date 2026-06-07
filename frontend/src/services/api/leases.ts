import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from "./client";
import type { Lease, LeaseAuditEntry, PaginatedResponse, QueryParams } from "@/types";
import type { LeaseState, LeaseType } from "@/types";
import { toLeaseParams } from "@/utils/backendParams";

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
    // Build a human-readable reference from property/unit names.
    // The backend LeaseOut has no reference field yet, so we construct one.
    reference: (raw.propertyName as string)
      ? `${raw.propertyName}${raw.unitName ? ` — ${raw.unitName}` : ""}`
      : (raw.id as string),
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
    noticeGivenAt: (raw.noticeGivenAt as string) ?? undefined,
    noticeVacateDate: (raw.noticeVacateDate as string) ?? undefined,
    terminatedAt: (raw.terminatedAt as string) ?? undefined,
    terminationReason: (raw.terminationReason as string) ?? undefined,
    renewedFromLeaseId: (raw.renewalOfLeaseId as string) ?? undefined,
    notes: (raw.notes as string) ?? undefined,
    advanceMonths: (raw.advanceMonths as number) ?? undefined,
    tenantName: (raw.tenantName as string) ?? undefined,
    unitName: (raw.unitName as string) ?? undefined,
    propertyName: (raw.propertyName as string) ?? undefined,
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
  const { terms, unitId, tenantId, notes, advanceMonths } = data;
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
    advanceMonths: advanceMonths ?? null,
    notes: notes ?? null,
  };
}

export const leasesApi = {
  list: async (params?: QueryParams) => {
    const raw = await apiGet<Record<string, unknown>>("/leases", toLeaseParams(params));
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

  /** Fix a data-entry mistake in the lease start date — owner/manager/superadmin only. */
  correctStartDate: async (id: string, startDate: string) => {
    const raw = await apiPatch<Record<string, unknown>>(`/leases/${id}/start-date`, { startDate });
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
        raw = await apiPatch<Record<string, unknown>>(`/leases/${id}/activate`, payload ?? {});
        break;
      case "LEASE_TERMINATED":
        raw = await apiPatch<Record<string, unknown>>(`/leases/${id}/terminate`, payload ?? {});
        break;
      case "LEASE_CLOSED":
        // LEASE_CLOSED maps to the expire endpoint (backend: PATCH /leases/{id}/expire)
        raw = await apiPatch<Record<string, unknown>>(`/leases/${id}/expire`, payload ?? {});
        break;
      case "NOTICE_GIVEN":
        // NOTICE_GIVEN must go through submitNotice() — it requires a vacateDate
        // and must NOT call /expire (lease stays active after a notice).
        throw new Error("Use leasesApi.submitNotice() for NOTICE_GIVEN — not transition()");
      case "LEASE_SENT":
        // "Send for Signature" in the manager UI — direct-activate (manager fast-path).
        // Calls the same PATCH /leases/{id}/activate endpoint as LEASE_ACTIVATED.
        // Tenant-facing signing now lives in the onboarding payment flow.
        raw = await apiPatch<Record<string, unknown>>(`/leases/${id}/activate`, payload ?? {});
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

  // Generate lease document (HTML, printable as PDF)
  generateDocument: (id: string) =>
    apiPost<{ url: string }>(`/leases/${id}/document`),

  // Manager retracts a previously submitted notice to vacate
  retractNotice: async (id: string) => {
    const raw = await apiDelete<Record<string, unknown>>(`/leases/${id}/notice`);
    return toLeaseModel(raw);
  },

  // Tenant submits notice to vacate
  submitNotice: async (id: string, vacateDate: string, reason?: string) => {
    const raw = await apiPost<Record<string, unknown>>(`/leases/${id}/notice`, {
      vacateDate,
      reason: reason ?? null,
    });
    return toLeaseModel(raw);
  },

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

  // Manager records that a signed paper agreement is on file (imported leases)
  acknowledge: async (id: string) => {
    const { data: raw } = await apiClient.patch<Record<string, unknown>>(`/leases/${id}/acknowledge`);
    return toLeaseModel(raw);
  },

  // Tenant confirms they have received and agree to their imported lease terms
  confirmTerms: async (id: string) => {
    const { data: raw } = await apiClient.patch<Record<string, unknown>>(`/leases/${id}/confirm-terms`);
    return toLeaseModel(raw);
  },
};
