import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryClient";
import { inspectionsApi } from "@/services/api/inspections";
import { toast } from "@/store/useUIStore";
import type { Contractor, QueryParams, MaintenanceIssue, Inspection } from "@/types";
import type { InspectorSubmitBody } from "@/types/inspection";
import type { MaintenanceEvent, InspectionEvent } from "@/types/states";

export function useInspections(params?: QueryParams & { unitId?: string; leaseId?: string }) {
  return useQuery({
    queryKey: queryKeys.inspections.list(params ?? {}),
    queryFn: () => inspectionsApi.list(params),
    placeholderData: keepPreviousData,
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

export function useUpdateInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Inspection> }) =>
      inspectionsApi.update(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.inspections.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.inspections.all() });
      toast.success("Inspection updated");
    },
    onError: () => toast.error("Failed to update inspection"),
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
      event: InspectionEvent;
      payload?: Record<string, unknown>;
    }) => inspectionsApi.transition(id, event, payload),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.inspections.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.inspections.all() });
    },
  });
}

export function useMaintenanceIssues(params?: QueryParams) {
  return useQuery({
    queryKey: queryKeys.maintenance.list(params),
    queryFn: () => inspectionsApi.listMaintenance(params),
    placeholderData: keepPreviousData,
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
    mutationFn: ({
      id,
      event,
      payload,
    }: {
      id: string;
      event: MaintenanceEvent;
      payload?: { contractorId?: string; assignedTo?: string };
    }) => inspectionsApi.transitionMaintenance(id, event, payload),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.maintenance.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.maintenance.all() });
      toast.success("Status updated");
    },
    onError: () => toast.error("Failed to update status"),
  });
}

// ── Inspector portal hooks ────────────────────────────────────────────────────

export function useAssignInspector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, contractorId, expiresInDays }: { id: string; contractorId: string; expiresInDays?: number }) =>
      inspectionsApi.assignInspector(id, contractorId, expiresInDays),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.inspections.detail(id) });
      toast.success("Inspector assigned — invite email sent");
    },
    onError: () => toast.error("Failed to assign inspector"),
  });
}

export function useResendInspectorInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => inspectionsApi.resendInspectorInvite(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.inspections.detail(id) });
      toast.success("Invite resent — inspector will receive a new link");
    },
    onError: () => toast.error("Failed to resend invite"),
  });
}

export function useInspectorPortal(token: string) {
  return useQuery({
    queryKey: ["inspector-portal", token],
    queryFn: () => inspectionsApi.getInspectorPortal(token),
    enabled: !!token,
    retry: false,
  });
}

export function useInspectorSubmit(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: InspectorSubmitBody) => inspectionsApi.inspectorSubmit(token, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inspector-portal", token] });
      toast.success("Inspection submitted — the property manager has been notified");
    },
    onError: () => toast.error("Failed to submit inspection"),
  });
}

// ── Contractor hooks ───────────────────────────────────────────────────────────

export function useContractors(params?: { specialty?: string; isActive?: boolean; search?: string }) {
  return useQuery({
    queryKey: ["contractors", params ?? {}],
    queryFn: () => inspectionsApi.listContractors(params),
    placeholderData: keepPreviousData,
  });
}

export function useContractor(id: string) {
  return useQuery({
    queryKey: ["contractors", id],
    queryFn: () => inspectionsApi.getContractor(id),
    enabled: !!id,
  });
}

export function useCreateContractor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: inspectionsApi.createContractor,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contractors"] });
      toast.success("Contractor added");
    },
    onError: () => toast.error("Failed to add contractor"),
  });
}

export function useUpdateContractor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<Omit<Contractor, "id" | "organisationId" | "createdAt" | "updatedAt">>;
    }) => inspectionsApi.updateContractor(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contractors"] });
      toast.success("Contractor updated");
    },
    onError: () => toast.error("Failed to update contractor"),
  });
}

export function useDeactivateContractor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => inspectionsApi.deactivateContractor(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contractors"] });
      toast.success("Contractor deactivated");
    },
    onError: () => toast.error("Failed to deactivate contractor"),
  });
}
