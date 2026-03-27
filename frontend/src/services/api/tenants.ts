import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from "./client";
import type { Tenant, TenantInvite, TenantDocument, PaginatedResponse, QueryParams } from "@/types";

export const tenantsApi = {
  list: (params?: QueryParams) =>
    apiGet<PaginatedResponse<Tenant>>("/tenants", params),

  get: (id: string) =>
    apiGet<Tenant>(`/tenants/${id}`),

  update: (id: string, data: Partial<Tenant>) =>
    apiPut<Tenant>(`/tenants/${id}`, data),

  delete: (id: string) =>
    apiDelete<void>(`/tenants/${id}`),

  // Invitations
  invite: (data: {
    email: string;
    name: string;
    propertyId: string;
    unitId?: string;
  }) => apiPost<TenantInvite>("/tenants/invite", data),

  getOnboardingByToken: (token: string) =>
    apiGet<{ tenant: Tenant; invite: TenantInvite }>(`/tenants/onboarding/${token}`),

  submitOnboarding: (token: string, data: Partial<Tenant>) =>
    apiPost<Tenant>(`/tenants/onboarding/${token}/submit`, data),

  approveOnboarding: (tenantId: string) =>
    apiPatch<Tenant>(`/tenants/${tenantId}/approve`, {}),

  rejectOnboarding: (tenantId: string, reason: string) =>
    apiPatch<Tenant>(`/tenants/${tenantId}/reject`, { reason }),

  // Documents
  getDocuments: (tenantId: string) =>
    apiGet<TenantDocument[]>(`/tenants/${tenantId}/documents`),

  deleteDocument: (tenantId: string, documentId: string) =>
    apiDelete<void>(`/tenants/${tenantId}/documents/${documentId}`),

  // Anonymise (GDPR right to erasure)
  anonymise: (tenantId: string) =>
    apiPost<void>(`/tenants/${tenantId}/anonymise`),
};
