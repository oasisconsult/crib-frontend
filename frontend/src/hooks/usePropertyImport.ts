"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { propertyImportApi } from "@/services/api/propertyImport";

export function usePreviewImport() {
  return useMutation({
    mutationFn: (file: File) => propertyImportApi.preview(file),
  });
}

export function useCommitImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => propertyImportApi.commit(file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["properties"] }),
  });
}
