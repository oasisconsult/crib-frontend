import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from "./client";
import type { Tenant, TenantInvite, TenantDocument, OnboardingDraft, OnboardingSubmitPayload, PaginatedResponse, QueryParams } from "@/types";
import { toTenantParams } from "@/utils/backendParams";

export const tenantsApi = {
  list: (params?: QueryParams) =>
    apiGet<PaginatedResponse<Tenant>>("/tenants", toTenantParams(params)),

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

  submitOnboarding: (token: string, data: OnboardingSubmitPayload) =>
    apiPost<Tenant>(`/tenants/onboarding/${token}/submit`, data),

  /** Save partial wizard progress so the tenant can resume after token refresh. */
  saveDraft: (token: string, draft: OnboardingDraft & { step: string }) =>
    apiPatch<void>(`/tenants/onboarding/${token}/draft`, draft),

  resendInvite: (tenantId: string) =>
    apiPost<TenantInvite>(`/tenants/${tenantId}/resend-invite`, {}),

  cancelInvite: (tenantId: string) =>
    apiDelete<void>(`/tenants/${tenantId}/invite`),

  approveOnboarding: (tenantId: string) =>
    apiPatch<Tenant>(`/tenants/${tenantId}/approve`, {}),

  rejectOnboarding: (tenantId: string, reason: string) =>
    apiPatch<Tenant>(`/tenants/${tenantId}/reject`, { reason }),

  // Documents
  getDocuments: (tenantId: string) =>
    apiGet<TenantDocument[]>(`/tenants/${tenantId}/documents`),

  uploadDocument: (
    tenantId: string,
    data: Pick<TenantDocument, "type" | "name" | "url" | "mimeType" | "sizeBytes"> & {
      expiresAt?: string;
    },
  ) => apiPost<TenantDocument>(`/tenants/${tenantId}/documents`, data),

  verifyDocument: (tenantId: string, documentId: string) =>
    apiPatch<TenantDocument>(`/tenants/${tenantId}/documents/${documentId}/verify`, {}),

  deleteDocument: (tenantId: string, documentId: string) =>
    apiDelete<void>(`/tenants/${tenantId}/documents/${documentId}`),

  // Anonymise (GDPR right to erasure)
  anonymise: (tenantId: string) =>
    apiPost<void>(`/tenants/${tenantId}/anonymise`),
};
