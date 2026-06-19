import { QueryClient } from "@tanstack/react-query";

const isMock = process.env.NEXT_PUBLIC_MOCK_API === "true";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes
      // In mock mode requests are instant — no point retrying.
      // In production, retry once on transient errors but never on 4xx.
      retry: isMock ? false : (failureCount, error: unknown) => {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 401 || status === 403 || status === 404) return false;
        return failureCount < 1;
      },
      retryDelay: 0,
      refetchOnWindowFocus: process.env.NODE_ENV === "production",
    },
    mutations: {
      retry: 0,
    },
  },
});

// Query key factories for consistent cache invalidation
export const queryKeys = {
  // Dashboard
  dashboard: {
    stats: () => ["dashboard", "stats"] as const,
    occupancy: (months: number) => ["dashboard", "occupancy", months] as const,
    revenue: (months: number) => ["dashboard", "revenue", months] as const,
    cashFlow: (months: number) => ["dashboard", "cashflow", months] as const,
  },
  // Properties
  properties: {
    all: () => ["properties"] as const,
    list: (params?: object) => ["properties", "list", params] as const,
    detail: (id: string) => ["properties", id] as const,
    units: (propertyId: string, params?: object) =>
      ["properties", propertyId, "units", params] as const,
    rules: (propertyId: string) =>
      ["properties", propertyId, "rules"] as const,
  },
  // Tenants
  tenants: {
    all: () => ["tenants"] as const,
    list: (params?: object) => ["tenants", "list", params] as const,
    detail: (id: string) => ["tenants", id] as const,
    documents: (tenantId: string) =>
      ["tenants", tenantId, "documents"] as const,
    onboarding: (token: string) =>
      ["tenants", "onboarding", token] as const,
  },
  // Leases
  leases: {
    all: () => ["leases"] as const,
    list: (params?: object) => ["leases", "list", params] as const,
    detail: (id: string) => ["leases", id] as const,
    audit: (id: string) => ["leases", id, "audit"] as const,
  },
  // Payments
  payments: {
    all: () => ["payments"] as const,
    list: (params?: object) => ["payments", "list", params] as const,
    detail: (id: string) => ["payments", id] as const,
    ledger: (tenantId: string) => ["payments", "ledger", tenantId] as const,
    rentSchedule: (leaseId: string) =>
      ["payments", "rent-schedule", leaseId] as const,
    overdueSchedules: (params?: object) =>
      ["payments", "overdue-schedules", params] as const,
    lateFees: (params?: object) =>
      ["payments", "late-fees", params] as const,
    deposits: (leaseId: string) =>
      ["payments", "deposits", leaseId] as const,
  },
  // Inspections
  inspections: {
    all: () => ["inspections"] as const,
    list: (params?: object) => ["inspections", "list", params] as const,
    detail: (id: string) => ["inspections", id] as const,
  },
  // Maintenance
  maintenance: {
    all: () => ["maintenance"] as const,
    list: (params?: object) => ["maintenance", "list", params] as const,
    detail: (id: string) => ["maintenance", id] as const,
  },
  // Messages
  messages: {
    all: () => ["messages"] as const,
    list: (leaseId: string, page?: number) => ["messages", "list", leaseId, page] as const,
    unreadCount: () => ["messages", "unread-count"] as const,
    listAll: (page?: number, unreadOnly?: boolean) => ["messages", "all", page, unreadOnly] as const,
  },
  // Notifications
  notifications: {
    all: () => ["notifications"] as const,
    list: (params?: object) =>
      ["notifications", "list", params] as const,
    templates: () => ["notifications", "templates"] as const,
    template: (id: string) => ["notifications", "templates", id] as const,
    stats: () => ["notifications", "stats"] as const,
  },
  // Audit Logs
  auditLogs: {
    all: () => ["audit-logs"] as const,
    list: (params?: object) => ["audit-logs", "list", params] as const,
    detail: (id: string) => ["audit-logs", id] as const,
    adminList: (params?: object) => ["audit-logs", "admin", params] as const,
  },
  // Reports
  reports: {
    portfolio:            ()             => ["reports", "portfolio"] as const,
    rentCollection:       (p?: object)  => ["reports", "rent-collection", p] as const,
    rentArrears:          (p?: object)  => ["reports", "rent-arrears", p] as const,
    occupancy:            (p?: object)  => ["reports", "occupancy", p] as const,
    maintenanceOverview:  (p?: object)  => ["reports", "maintenance-overview", p] as const,
    maintenanceCosts:     (p?: object)  => ["reports", "maintenance-costs", p] as const,
    contractors:          (p?: object)  => ["reports", "contractors", p] as const,
    leaseExpiry:          ()            => ["reports", "lease-expiry"] as const,
    incomeExpense:        (p?: object)  => ["reports", "income-expense", p] as const,
  },
} as const;
