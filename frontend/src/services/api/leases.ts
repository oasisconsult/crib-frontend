import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from "./client";
import type { Lease, LeaseAuditEntry, PaginatedResponse, QueryParams } from "@/types";
import type { LeaseEvent } from "@/types/states";

export const leasesApi = {
  list: (params?: QueryParams) =>
    apiGet<PaginatedResponse<Lease>>("/leases", params),

  get: (id: string) =>
    apiGet<Lease>(`/leases/${id}`),

  create: (data: Omit<Lease, "id" | "createdAt" | "updatedAt" | "state">) =>
    apiPost<Lease>("/leases", data),

  update: (id: string, data: Partial<Lease>) =>
    apiPut<Lease>(`/leases/${id}`, data),

  delete: (id: string) =>
    apiDelete<void>(`/leases/${id}`),

  // State transitions
  transition: (id: string, event: LeaseEvent, payload?: object) =>
    apiPost<Lease>(`/leases/${id}/transition`, { event, ...payload }),

  // Signatures
  signLease: (id: string, data: { party: "tenant" | "landlord"; signatureDataUrl: string }) =>
    apiPost<Lease>(`/leases/${id}/sign`, data),

  // Generate PDF
  generateDocument: (id: string) =>
    apiPost<{ url: string }>(`/leases/${id}/document`),

  // Audit log
  getAudit: (id: string) =>
    apiGet<LeaseAuditEntry[]>(`/leases/${id}/audit`),

  // Renewal
  renew: (id: string, data: Partial<Lease>) =>
    apiPost<Lease>(`/leases/${id}/renew`, data),
};
