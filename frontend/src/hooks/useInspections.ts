import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryClient";
import { inspectionsApi } from "@/services/api/inspections";
import { toast } from "@/store/useUIStore";
import type { QueryParams, MaintenanceIssue } from "@/types";
import type { MaintenanceEvent } from "@/types/states";

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

export function useMaintenanceIssue(id: string) {
  return useQuery({
    queryKey: queryKeys.maintenance.detail(id),
    queryFn: () => inspectionsApi.getMaintenance(id),
    enabled: !!id,
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

export function useUpdateMaintenanceIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<MaintenanceIssue> }) =>
      inspectionsApi.updateMaintenance(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.maintenance.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.maintenance.all() });
      toast.success("Issue updated");
    },
    onError: () => toast.error("Failed to update issue"),
  });
}

export function useTransitionMaintenanceIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, event }: { id: string; event: MaintenanceEvent }) =>
      inspectionsApi.transitionMaintenance(id, event),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.maintenance.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.maintenance.all() });
      toast.success("Status updated");
    },
    onError: () => toast.error("Failed to update status"),
  });
}
