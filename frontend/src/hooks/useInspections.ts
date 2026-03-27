import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryClient";
import { inspectionsApi } from "@/services/api/inspections";
import type { QueryParams } from "@/types";

export function useInspections(params?: QueryParams) {
  return useQuery({
    queryKey: queryKeys.inspections.list(params ?? {}),
    queryFn: () => inspectionsApi.list(params),
  });
}

export function useInspection(id: string) {
  return useQuery({
    queryKey: queryKeys.inspections.detail(id),
    queryFn: () => inspectionsApi.get(id),
    enabled: !!id,
  });
}

export function useCreateInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: inspectionsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.inspections.all() });
    },
  });
}

export function useTransitionInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      event,
      payload,
    }: {
      id: string;
      event: string;
      payload?: Record<string, unknown>;
    }) => inspectionsApi.transition(id, event, payload),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.inspections.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.inspections.all() });
    },
  });
}

export function useMaintenanceIssues(inspectionId?: string) {
  const params = inspectionId ? { inspectionId } : undefined;
  return useQuery({
    queryKey: queryKeys.maintenance.list(params),
    queryFn: () => inspectionsApi.listMaintenance(params),
    enabled: true,
  });
}

export function useCreateMaintenanceIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: inspectionsApi.createMaintenance,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.maintenance.all() });
    },
  });
}
