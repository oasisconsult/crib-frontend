import { apiGet } from "./client";

export interface PortfolioSummary {
  totalProperties: number;
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  occupancyRate: number;
  vacancyRate: number;
  monthlyRevenue: number;
  expectedRent: number;
  outstandingRent: number;
  overdueCount: number;
  overdueAmount: number;
  collectionRate: number;
  openMaintenance: number;
  maintenanceByState: Record<string, number>;
}

export interface RentCollectionRow {
  propertyId: string;
  propertyName: string;
  schedulesCount: number;
  rentDue: number;
  rentCollected: number;
  outstanding: number;
  collectionPct: number;
  paidCount: number;
  overdueCount: number;
}

export interface ArrearsBucket {
  tenantName: string;
  tenantId: string;
  propertyName: string;
  propertyId: string;
  unitName: string | null;
  dueDate: string;
  amountOwed: number;
  daysOverdue: number;
}

export interface ArrearsSummaryItem {
  count: number;
  totalOwed: number;
}

export interface RentArrearsReport {
  buckets: {
    "0_30": ArrearsBucket[];
    "31_60": ArrearsBucket[];
    "61_90": ArrearsBucket[];
    "90_plus": ArrearsBucket[];
  };
  summary: Record<"0_30" | "31_60" | "61_90" | "90_plus", ArrearsSummaryItem>;
  asOf: string;
}

export interface OccupancyPropertyRow {
  propertyId: string;
  propertyName: string;
  totalUnits: number;
  occupied: number;
  vacant: number;
  vacancyPct: number;
  monthlyRentLost: number;
}

export interface OccupancyReport {
  properties: OccupancyPropertyRow[];
  totals: {
    totalUnits: number;
    occupied: number;
    vacant: number;
    vacancyPct: number;
    monthlyRentLostEst: number;
  };
  asOf: string;
}

export interface MaintenanceOverview {
  summary: Record<string, number>;
  byProperty: {
    propertyId: string;
    propertyName: string;
    open: number;
    assigned: number;
    inProgress: number;
    resolved: number;
    total: number;
  }[];
  byPriority: Record<string, number>;
  byCategory: Record<string, number>;
}

export interface MaintenanceCostReport {
  byProperty: { propertyId: string; propertyName: string; jobs: number; totalCost: number }[];
  byCategory: { category: string; jobs: number; totalCost: number }[];
  byContractor: { contractorId: string | null; contractorName: string; jobs: number; totalCost: number }[];
  totalCost: number;
}

export interface ContractorPerformanceRow {
  contractorId: string;
  contractorName: string;
  specialty: string | null;
  totalAssigned: number;
  completed: number;
  cancelled: number;
  avgDaysToResolve: number;
  successRatePct: number;
}

export interface LeaseExpiryReport {
  windows: {
    "30": LeaseExpiryRow[];
    "60": LeaseExpiryRow[];
    "90": LeaseExpiryRow[];
  };
  summary: { "30": number; "60": number; "90": number };
  asOf: string;
}

export interface LeaseExpiryRow {
  leaseId: string;
  leaseRef: string;
  tenantName: string;
  propertyName: string;
  unitName: string | null;
  endDate: string;
  monthlyRent: number;
  currency: string;
  daysUntilExpiry: number;
}

export interface IncomeExpenseRow {
  period: string;
  periodStart: string;
  revenue: number;
  expenses: number;
  netIncome: number;
}

// ── Snake-to-camel mapping ─────────────────────────────────────────────────────

function camel<T>(obj: unknown): T {
  if (Array.isArray(obj)) return obj.map(camel) as unknown as T;
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
        k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
        camel(v),
      ]),
    ) as T;
  }
  return obj as T;
}

function qs(params: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const reportsApi = {
  portfolio: () =>
    apiGet<PortfolioSummary>("/reports/portfolio").then(camel<PortfolioSummary>),

  rentCollection: (params?: { dateFrom?: string; dateTo?: string; propertyId?: string }) =>
    apiGet<RentCollectionRow[]>(`/reports/rent-collection${qs(params ?? {})}`).then(
      camel<RentCollectionRow[]>,
    ),

  rentArrears: (params?: { propertyId?: string }) =>
    apiGet<RentArrearsReport>(`/reports/rent-arrears${qs(params ?? {})}`).then(
      camel<RentArrearsReport>,
    ),

  occupancy: (params?: { propertyId?: string }) =>
    apiGet<OccupancyReport>(`/reports/occupancy${qs(params ?? {})}`).then(
      camel<OccupancyReport>,
    ),

  maintenanceOverview: (params?: {
    propertyId?: string;
    contractorId?: string;
    dateFrom?: string;
    dateTo?: string;
  }) =>
    apiGet<MaintenanceOverview>(`/reports/maintenance/overview${qs(params ?? {})}`).then(
      camel<MaintenanceOverview>,
    ),

  maintenanceCosts: (params?: { propertyId?: string; dateFrom?: string; dateTo?: string }) =>
    apiGet<MaintenanceCostReport>(`/reports/maintenance/costs${qs(params ?? {})}`).then(
      camel<MaintenanceCostReport>,
    ),

  contractors: (params?: { dateFrom?: string; dateTo?: string }) =>
    apiGet<ContractorPerformanceRow[]>(`/reports/contractors${qs(params ?? {})}`).then(
      camel<ContractorPerformanceRow[]>,
    ),

  leaseExpiry: () =>
    apiGet<LeaseExpiryReport>("/reports/lease-expiry").then(camel<LeaseExpiryReport>),

  incomeExpense: (params?: { groupBy?: string; months?: number }) =>
    apiGet<IncomeExpenseRow[]>(`/reports/income-expense${qs(params ?? {})}`).then(
      camel<IncomeExpenseRow[]>,
    ),

  // exportUrl is used in <a href> directly (not via axios), so it needs the full /api/v1/ prefix
  exportUrl: (
    report: "rent-collection" | "rent-arrears" | "lease-expiry" | "income-expense",
    params: Record<string, unknown> = {},
    fmt: "csv" | "xlsx" = "csv",
  ) => `/api/v1/reports/${report}/export${qs({ ...params, fmt })}`,
};
