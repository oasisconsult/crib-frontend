import type { QueryParams, FilterConfig } from "@/types";

/**
 * Translates a generic FilterConfig[] into flat backend query params.
 * Supports eq (single value) and in (comma-separated `states` param).
 */
function resolveFilters(
  filters: FilterConfig[],
  fieldMap: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of filters) {
    const backendKey = fieldMap[f.field] ?? f.field;
    if (f.operator === "eq" && typeof f.value === "string") {
      out[backendKey] = f.value;
    } else if (f.operator === "in" && Array.isArray(f.value)) {
      out.states = (f.value as string[]).join(",");
    }
  }
  return out;
}

export function toTenantParams(params?: QueryParams): Record<string, unknown> | undefined {
  if (!params) return undefined;
  const out: Record<string, unknown> = {};
  if (params.page != null) out.page = params.page;
  if (params.pageSize != null) out.pageSize = params.pageSize;
  if (params.search) out.search = params.search;
  Object.assign(out, resolveFilters(params.filters ?? [], {
    onboardingState: "onboardingState",
    status: "status",
  }));
  return out;
}

export function toLeaseParams(params?: QueryParams): Record<string, unknown> | undefined {
  if (!params) return undefined;
  const out: Record<string, unknown> = {};
  if (params.page != null) out.page = params.page;
  if (params.pageSize != null) out.pageSize = params.pageSize;
  if (params.search) out.search = params.search;
  Object.assign(out, resolveFilters(params.filters ?? [], { state: "status" }));
  return out;
}

export function toPaymentParams(params?: QueryParams): Record<string, unknown> | undefined {
  if (!params) return undefined;
  const out: Record<string, unknown> = {};
  if (params.page != null) out.page = params.page;
  if (params.pageSize != null) out.pageSize = params.pageSize;
  if (params.search) out.search = params.search;
  if (params.filters) {
    for (const f of params.filters) {
      if (f.field === "state") {
        if (f.operator === "in" && Array.isArray(f.value)) {
          out.states = (f.value as string[]).join(",");
        } else if (f.operator === "eq" && typeof f.value === "string") {
          out.status = f.value;
        }
      }
      if (f.field === "category" && f.operator === "eq") out.category = f.value;
      if (f.field === "leaseId" && f.operator === "eq") out.leaseId = f.value;
    }
  }
  return out;
}

export function toInspectionParams(params?: QueryParams & { unitId?: string; leaseId?: string }): Record<string, unknown> | undefined {
  if (!params) return undefined;
  const out: Record<string, unknown> = {};
  if (params.page != null) out.page = params.page;
  if (params.pageSize != null) out.pageSize = params.pageSize;
  if (params.search) out.search = params.search;
  if ((params as any).unitId) out.unit_id = (params as any).unitId;
  if ((params as any).leaseId) out.leaseId = (params as any).leaseId;
  Object.assign(out, resolveFilters(params.filters ?? [], {
    state: "state",
    type: "type",
    propertyId: "property_id",
  }));
  return out;
}

export function toMaintenanceParams(params?: QueryParams): Record<string, unknown> | undefined {
  if (!params) return undefined;
  const out: Record<string, unknown> = {};
  if (params.page != null) out.page = params.page;
  if (params.pageSize != null) out.pageSize = params.pageSize;
  if (params.search) out.search = params.search;
  Object.assign(out, resolveFilters(params.filters ?? [], {
    state: "state",
    priority: "priority",
    category: "category",
    propertyId: "property_id",
  }));
  return out;
}

export function toScheduleParams(params?: QueryParams): Record<string, unknown> | undefined {
  if (!params) return undefined;
  const out: Record<string, unknown> = {};
  if (params.page != null) out.page = params.page;
  if (params.pageSize != null) out.pageSize = params.pageSize;
  for (const f of params.filters ?? []) {
    if ((f.field === "status" || f.field === "state") && f.operator === "eq") out.status = f.value;
    if (f.field === "leaseId" && f.operator === "eq") out.leaseId = f.value;
  }
  return out;
}

export function toNotificationParams(params?: QueryParams): Record<string, unknown> | undefined {
  if (!params) return undefined;
  const out: Record<string, unknown> = {};
  if (params.page != null) out.page = params.page;
  if (params.pageSize != null) out.pageSize = params.pageSize;
  if (params.search) out.search = params.search;
  Object.assign(out, resolveFilters(params.filters ?? [], {
    state: "state",
    channel: "channel",
  }));
  return out;
}
