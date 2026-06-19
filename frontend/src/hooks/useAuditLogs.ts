import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryClient";
import { auditLogsApi, type AuditLogParams } from "@/services/api/auditLogs";

export function useAuditLogs(params?: AuditLogParams) {
  return useQuery({
    queryKey: queryKeys.auditLogs.list(params ?? {}),
    queryFn: () => auditLogsApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useAuditLog(id: string) {
  return useQuery({
    queryKey: queryKeys.auditLogs.detail(id),
    queryFn: () => auditLogsApi.get(id),
    enabled: !!id,
  });
}

export function useAdminAuditLogs(params?: AuditLogParams) {
  return useQuery({
    queryKey: queryKeys.auditLogs.adminList(params ?? {}),
    queryFn: () => auditLogsApi.adminList(params),
    placeholderData: keepPreviousData,
  });
}
