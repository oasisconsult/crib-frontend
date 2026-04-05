"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryClient";
import { tenantsApi } from "@/services/api/tenants";
import { toast } from "@/store/useUIStore";
import type { Tenant, TenantDocument, QueryParams, OnboardingSubmitPayload } from "@/types";

export function useTenants(params?: QueryParams) {
  return useQuery({
    queryKey: queryKeys.tenants.list(params),
    queryFn: () => tenantsApi.list(params),
  });
}

export function useTenant(id: string) {
  return useQuery({
    queryKey: queryKeys.tenants.detail(id),
    queryFn: () => tenantsApi.get(id),
    enabled: !!id,
  });
}

export function useTenantDocuments(tenantId: string) {
  return useQuery({
    queryKey: queryKeys.tenants.documents(tenantId),
    queryFn: () => tenantsApi.getDocuments(tenantId),
    enabled: !!tenantId,
  });
}

export function useOnboardingByToken(token: string) {
  return useQuery({
    queryKey: queryKeys.tenants.onboarding(token),
    queryFn: () => tenantsApi.getOnboardingByToken(token),
    enabled: !!token,
    retry: false,
  });
}

export function useInviteTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: tenantsApi.invite,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tenants.all() });
      toast.success("Invitation sent");
    },
    onError: () => toast.error("Failed to send invitation"),
  });
}

export function useSubmitOnboarding() {
  return useMutation({
    mutationFn: ({
      token,
      data,
    }: {
      token: string;
      data: OnboardingSubmitPayload;
    }) => tenantsApi.submitOnboarding(token, data),
    onError: () => toast.error("Failed to submit onboarding"),
  });
}

export function useApproveOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tenantId: string) => tenantsApi.approveOnboarding(tenantId),
    onSuccess: (_, tenantId) => {
      qc.invalidateQueries({ queryKey: queryKeys.tenants.detail(tenantId) });
      qc.invalidateQueries({ queryKey: queryKeys.tenants.all() });
      toast.success("Tenant approved and activated");
    },
    onError: () => toast.error("Failed to approve tenant"),
  });
}

export function useRejectOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, reason }: { tenantId: string; reason: string }) =>
      tenantsApi.rejectOnboarding(tenantId, reason),
    onSuccess: (_, { tenantId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.tenants.detail(tenantId) });
      qc.invalidateQueries({ queryKey: queryKeys.tenants.all() });
      toast.success("Application rejected");
    },
    onError: () => toast.error("Failed to reject application"),
  });
}

export function useUploadTenantDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tenantId,
      data,
    }: {
      tenantId: string;
      data: Pick<TenantDocument, "type" | "name" | "url" | "mimeType" | "sizeBytes"> & {
        expiresAt?: string;
      };
    }) => tenantsApi.uploadDocument(tenantId, data),
    onSuccess: (_, { tenantId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.tenants.documents(tenantId) });
      toast.success("Document uploaded");
    },
    onError: () => toast.error("Failed to upload document"),
  });
}

export function useVerifyTenantDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, documentId }: { tenantId: string; documentId: string }) =>
      tenantsApi.verifyDocument(tenantId, documentId),
    onSuccess: (_, { tenantId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.tenants.documents(tenantId) });
    },
    onError: () => toast.error("Failed to update verification"),
  });
}

export function useDeleteTenantDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, documentId }: { tenantId: string; documentId: string }) =>
      tenantsApi.deleteDocument(tenantId, documentId),
    onSuccess: (_, { tenantId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.tenants.documents(tenantId) });
      toast.success("Document deleted");
    },
    onError: () => toast.error("Failed to delete document"),
  });
}

export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Tenant> }) =>
      tenantsApi.update(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.tenants.detail(id) });
      toast.success("Tenant updated");
    },
    onError: () => toast.error("Failed to update tenant"),
  });
}
