export * from "./states";
export * from "./user";
export * from "./property";
export * from "./tenant";
export * from "./lease";
export * from "./payment";
export * from "./inspection";
export * from "./notification";
export * from "./rule";

// ─── Shared pagination / API types ──────────────────────────────────────────
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

export interface SortConfig {
  field: string;
  direction: "asc" | "desc";
}

export interface FilterConfig {
  field: string;
  operator: "eq" | "ne" | "gt" | "lt" | "gte" | "lte" | "contains" | "in";
  value: unknown;
}

export interface QueryParams {
  page?: number;
  pageSize?: number;
  sort?: SortConfig;
  filters?: FilterConfig[];
  search?: string;
}

// ─── Analytics types ──────────────────────────────────────────────────────────
export interface DashboardStats {
  totalProperties: number;
  totalUnits: number;
  occupiedUnits: number;
  occupancyRate: number;
  totalTenants: number;
  activeTenants: number;
  pendingOnboarding: number;
  monthlyRevenue: number;
  expectedMonthlyRent: number;
  pendingPayments: number;
  overduePayments: number;
  overdueAmount: number;
  collectionRate: number;
  openMaintenanceIssues: number;
  scheduledInspections: number;
}

export interface OccupancyDataPoint {
  month: string;
  occupied: number;
  available: number;
  rate: number;
}

export interface RevenueDataPoint {
  month: string;
  collected: number;
  expected: number;
  lateFees: number;
}

export interface CashFlowDataPoint {
  month: string;
  inflow: number;
  outflow: number;
  net: number;
}
