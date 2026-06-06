"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FilterBar } from "@/components/common/FilterBar";
import { FilterPanel, type ActiveFilters, type FilterField } from "@/components/common/FilterPanel";
import { formatCurrency, formatDate } from "@/utils/formatters";
import { usePayments, useDashboardStats, useOverdueSchedules } from "@/hooks/usePayments";
import type { Payment, RentSchedule, FilterConfig } from "@/types";

const PAGE_SIZE = 20;

const COLUMNS: Column<Payment>[] = [
  {
    key: "reference",
    header: "Reference",
    render: (p) => (
      <span className="font-mono text-xs font-medium">{p.reference ?? "—"}</span>
    ),
  },
  {
    key: "tenantName",
    header: "Tenant",
    render: (p) => (
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{p.tenantName ?? "—"}</p>
        {(p.unitName ?? p.propertyName) && (
          <p className="text-xs text-muted-foreground truncate">
            {p.unitName ?? p.propertyName}
          </p>
        )}
      </div>
    ),
  },
  {
    key: "state",
    header: "Status",
    render: (p) => <StatusBadge state={p.state} domain="payment" />,
  },
  {
    key: "category",
    header: "Type",
    render: (p) => (
      <span className="text-sm capitalize">
        {(p.category ?? "").replace(/_/g, " ")}
      </span>
    ),
  },
  {
    key: "amount",
    header: "Amount",
    sortable: true,
    render: (p) => (
      <span className="font-medium">{formatCurrency(p.amount, p.currency)}</span>
    ),
  },
  {
    key: "paidAt",
    header: "Paid On",
    render: (p) => (
      <span className="text-muted-foreground">{p.paidAt ? formatDate(p.paidAt) : "—"}</span>
    ),
  },
];

const IN_PROGRESS = ["initiated", "predicted", "routed", "pending", "reconciled", "allocated", "retry_scheduled"];
const SUCCESS     = ["confirmed", "completed"];
const FAILED      = ["failed", "permanently_failed", "predicted_failure"];

const TAB_FILTERS: Record<string, FilterConfig[]> = {
  all:       [],
  pending:   [{ field: "state", operator: "in", value: IN_PROGRESS }],
  confirmed: [{ field: "state", operator: "in", value: SUCCESS }],
  failed:    [{ field: "state", operator: "in", value: FAILED }],
  refunded:  [{ field: "state", operator: "eq", value: "refunded" }],
};

const TABS = ["all", "pending", "confirmed", "failed", "refunded", "overdue"] as const;

const OVERDUE_COLUMNS: Column<RentSchedule>[] = [
  {
    key: "tenantName",
    header: "Tenant",
    render: (s) => (
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{s.tenantName ?? "—"}</p>
        {(s.unitName ?? s.propertyName) && (
          <p className="text-xs text-muted-foreground truncate">
            {s.unitName ?? s.propertyName}
          </p>
        )}
      </div>
    ),
  },
  {
    key: "dueDate",
    header: "Due Date",
    render: (s) => (
      <span className="text-sm text-destructive font-medium">{formatDate(s.dueDate)}</span>
    ),
  },
  {
    key: "balance",
    header: "Outstanding",
    sortable: true,
    render: (s) => (
      <span className="font-semibold text-destructive">{formatCurrency(s.balance, "UGX")}</span>
    ),
  },
  {
    key: "amountDue",
    header: "Rent Due",
    render: (s) => (
      <span className="text-sm">{formatCurrency(s.amountDue, "UGX")}</span>
    ),
  },
  {
    key: "lateFeeApplied",
    header: "Late Fee",
    render: (s) => (
      <span className="text-sm text-amber-600">
        {s.lateFeeApplied > 0 ? formatCurrency(s.lateFeeApplied, "UGX") : "—"}
      </span>
    ),
  },
  {
    key: "periodStart",
    header: "Period",
    render: (s) => (
      <span className="text-xs text-muted-foreground">
        {formatDate(s.periodStart)} – {formatDate(s.periodEnd)}
      </span>
    ),
  },
];

const FILTER_FIELDS: FilterField[] = [
  {
    key: "category",
    label: "Category",
    options: [
      { label: "Rent", value: "rent" },
      { label: "Deposit", value: "deposit" },
      { label: "Utility", value: "utility" },
      { label: "Late Fee", value: "late_fee" },
      { label: "Other", value: "other" },
    ],
  },
];

function panelFiltersToConfig(active: ActiveFilters): FilterConfig[] {
  return Object.entries(active)
    .filter(([, v]) => v)
    .map(([field, value]) => ({ field, operator: "eq" as const, value }));
}

export default function PaymentsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<typeof TABS[number]>("all");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({});

  const { data, isLoading } = usePayments({
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    filters: [...(TAB_FILTERS[tab as keyof typeof TAB_FILTERS] ?? []), ...panelFiltersToConfig(activeFilters)],
  });

  const { data: overdueData, isLoading: overdueLoading } = useOverdueSchedules({ page, pageSize: PAGE_SIZE });
  const { data: stats } = useDashboardStats();

  const handleTabChange = (t: string) => {
    setTab(t as typeof TABS[number]);
    setPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleFilterChange = (filters: ActiveFilters) => {
    setActiveFilters(filters);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Rent collection, deposits, and payment tracking
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/payments/reconciliation")}
        >
          Mobile Money Reconciliation
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: "Expected",
            value: formatCurrency(
              stats ? stats.monthlyRevenue / (stats.collectionRate / 100) : 0,
              "UGX",
            ),
            icon: TrendingUp,
            color: "text-teal-600",
            bg: "bg-teal-50 dark:bg-teal-500/15",
          },
          {
            label: "Collected",
            value: formatCurrency(stats?.monthlyRevenue ?? 0, "UGX"),
            icon: CheckCircle2,
            color: "text-emerald-600",
            bg: "bg-emerald-50 dark:bg-emerald-500/15",
          },
          {
            label: "Overdue",
            value: formatCurrency(stats?.overdueAmount ?? 0, "UGX"),
            icon: AlertTriangle,
            color: "text-red-600",
            bg: "bg-red-50 dark:bg-red-500/15",
          },
          {
            label: "Collection Rate",
            value: `${stats?.collectionRate?.toFixed(0) ?? 0}%`,
            icon: CreditCard,
            color: "text-violet-600",
            bg: "bg-violet-50 dark:bg-violet-500/15",
          },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4">
              <div className={`inline-flex p-2 rounded-[6px] mb-2 ${s.bg}`}>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-lg font-bold mt-0.5 ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <div className="space-y-2">
        <FilterBar
          search={search}
          onSearchChange={handleSearchChange}
          placeholder="Search by reference or tenant..."
          className="max-w-sm"
        />
        <FilterPanel
          fields={FILTER_FIELDS}
          value={activeFilters}
          onChange={handleFilterChange}
        />
      </div>

      {/* Tabs + Table */}
      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="confirmed">Confirmed</TabsTrigger>
          <TabsTrigger value="failed">Failed</TabsTrigger>
          <TabsTrigger value="refunded">Refunded</TabsTrigger>
          <TabsTrigger value="overdue" className="text-destructive data-[state=active]:text-destructive">
            Overdue Rent
            {(stats?.overduePayments ?? 0) > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold h-4 min-w-[1rem] px-1">
                {stats!.overduePayments}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {(["all", "pending", "confirmed", "failed", "refunded"] as const).map((t) => (
          <TabsContent key={t} value={t} className="mt-3">
            <DataTable
              data={data?.data ?? []}
              columns={COLUMNS}
              loading={isLoading}
              rowKey={(p) => p.id}
              onRowClick={(p) => router.push(`/payments/${p.id}`)}
              emptyTitle="No payments found"
              emptyDescription={
                t === "all"
                  ? "Payments will appear once leases are active"
                  : "No payments match this filter"
              }
              pageSize={PAGE_SIZE}
              totalItems={data?.total}
              currentPage={page}
              onPageChange={setPage}
            />
          </TabsContent>
        ))}

        <TabsContent value="overdue" className="mt-3">
          <DataTable
            data={overdueData?.data ?? []}
            columns={OVERDUE_COLUMNS}
            loading={overdueLoading}
            rowKey={(s) => s.id}
            onRowClick={(s) => router.push(`/leases/${s.leaseId}`)}
            emptyTitle="No overdue rent"
            emptyDescription="All tenants are up to date with their rent payments"
            pageSize={PAGE_SIZE}
            totalItems={overdueData?.total}
            currentPage={page}
            onPageChange={setPage}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
