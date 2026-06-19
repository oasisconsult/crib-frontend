import { apiGet } from "./client";

export interface AuditLogEntry {
  id: string;
  organisationId: string | null;
  actorId: string | null;
  actorRole: string | null;
  actorName: string | null;
  resourceType: string;
  resourceId: string | null;
  resourceLabel: string | null;
  action: string;
  changes: Record<string, { before: unknown; after: unknown }>;
  eventData: Record<string, unknown>;
  ipAddress: string | null;
  requestId: string | null;
  createdAt: string;
}

export interface AuditLogListResponse {
  data: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditLogParams {
  resourceType?: string;
  action?: string;
  actorId?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  orgId?: string; // admin only
}

export const auditLogsApi = {
  list: (params?: AuditLogParams) =>
    apiGet<AuditLogListResponse>("/audit-logs", { params }),
  get: (id: string) =>
    apiGet<AuditLogEntry>(`/audit-logs/${id}`),
  adminList: (params?: AuditLogParams) =>
    apiGet<AuditLogListResponse>("/admin/audit-logs", { params }),
};
