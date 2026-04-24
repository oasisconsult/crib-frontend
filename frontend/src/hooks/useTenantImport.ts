"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { tenantImportApi } from "@/services/api/tenantImport";

export function usePreviewTenantImport() {
  return useMutation({
    mutationFn: (file: File) => tenantImportApi.preview(file),
  });
}

export function useCommitTenantImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => tenantImportApi.commit(file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenants"] }),
  });
}
