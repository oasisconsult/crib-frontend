"use client";

import { useState } from "react";
import {
  BarChart3, TrendingUp, AlertTriangle, Home, Wrench,
  Users, Clock, Download, FileSpreadsheet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatDate } from "@/utils/formatters";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  usePortfolioSummary,
  useRentCollectionReport,
  useRentArrearsReport,
  useOccupancyReport,
  useMaintenanceOverviewReport,
  useMaintenanceCostReport,
  useContractorPerformance,
  useLeaseExpiryReport,
  useIncomeExpenseReport,
} from "@/hooks/useReports";
import { reportsApi } from "@/services/api/reports";
import { useCurrentSubscription } from "@/hooks/useSubscription";
import { FeatureUpgradeCTA } from "@/components/common/FeatureUpgradeCTA";
import { FileBarChart2 } from "lucide-react";

const CURRENCY = "UGX";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? "h-4 w-full"}`} />;
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color, icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className={`inline-flex p-2 rounded-[6px] mb-2 ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold mt-0.5 tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ── Export button ─────────────────────────────────────────────────────────────

function ExportBtn({
  report, params, label,
}: {
  report: "rent-collection" | "rent-arrears" | "lease-expiry" | "income-expense";
  params?: Record<string, unknown>;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <a
        href={reportsApi.exportUrl(report, params, "csv")}
        download
        className="inline-flex items-center gap-1 rounded-[5px] border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <Download className="h-3.5 w-3.5" />
        CSV
      </a>
      <a
        href={reportsApi.exportUrl(report, params, "xlsx")}
        download
        className="inline-flex items-center gap-1 rounded-[5px] border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <FileSpreadsheet className="h-3.5 w-3.5" />
        Excel
      </a>
    </div>
  );
}

// ── Date range inputs ─────────────────────────────────────────────────────────

function DateRange({
  from, to, onFromChange, onToChange,
}: {
  from: string; to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="font-medium">From</span>
      <input
        type="date"
        value={from}
        max={to || undefined}
        onChange={(e) => onFromChange(e.target.value)}
        className="rounded-[6px] border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <span className="font-medium">To</span>
      <input
        type="date"
        value={to}
        min={from || undefined}
        onChange={(e) => onToChange(e.target.value)}
        className="rounded-[6px] border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}

// ── Portfolio tab ─────────────────────────────────────────────────────────────

function PortfolioTab() {
  const { data, isLoading } = usePortfolioSummary();

  if (isLoading) return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Card key={i}><CardContent className="pt-4"><Skeleton className="h-16" /></CardContent></Card>
      ))}
    </div>
  );

  if (!data) return null;

  return (
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard label="Properties"    value={String(data.totalProperties)} icon={Home}          color="bg-teal-50 text-teal-600 dark:bg-teal-500/15" />
        <KpiCard label="Occupancy"     value={`${data.occupancyRate}%`}     icon={Users}         color="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15" sub={`${data.occupiedUnits} / ${data.totalUnits} units`} />
        <KpiCard label="Revenue (MTD)" value={formatCurrency(data.monthlyRevenue, CURRENCY)} icon={TrendingUp} color="bg-violet-50 text-violet-600 dark:bg-violet-500/15" />
        <KpiCard label="Collection"    value={`${data.collectionRate}%`}    icon={BarChart3}     color="bg-blue-50 text-blue-600 dark:bg-blue-500/15" sub={`${formatCurrency(data.expectedRent, CURRENCY)} expected`} />
        <KpiCard label="Overdue"       value={formatCurrency(data.overdueAmount, CURRENCY)} icon={AlertTriangle} color="bg-red-50 text-red-600 dark:bg-red-500/15" sub={`${data.overdueCount} schedules`} />
        <KpiCard label="Vacant Units"  value={String(data.vacantUnits)}      icon={Home}         color="bg-amber-50 text-amber-600 dark:bg-amber-500/15" sub={`${data.vacancyRate}% vacancy`} />
        <KpiCard label="Open Maintenance" value={String(data.openMaintenance)} icon={Wrench}     color="bg-orange-50 text-orange-600 dark:bg-orange-500/15" />
        <KpiCard label="Outstanding"   value={formatCurrency(data.outstandingRent, CURRENCY)} icon={Clock} color="bg-slate-50 text-slate-600 dark:bg-slate-500/15" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Maintenance by State</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(data.maintenanceByState).map(([state, count]) => (
                <div key={state} className="flex items-center justify-between text-sm">
                  <StatusBadge state={state} domain="maintenance" />
                  <span className="font-medium tabular-nums">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Rent Collection tab ───────────────────────────────────────────────────────

function RentCollectionTab() {
  const [from, setFrom] = useState("");
  const [to, setTo]     = useState("");
  const params = { dateFrom: from || undefined, dateTo: to || undefined };
  const { data, isLoading } = useRentCollectionReport(params);

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <DateRange from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
        <ExportBtn report="rent-collection" params={params} label="Collection" />
      </div>
      <div className="overflow-hidden rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-sm)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
                {["Property", "Due", "Collected", "Outstanding", "Rate", "Paid", "Overdue"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-[hsl(var(--border))]">{Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton /></td>
                    ))}</tr>
                  ))
                : (data ?? []).length === 0
                  ? <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">No rent collection data for this period</td></tr>
                  : (data ?? []).map((r) => (
                    <tr key={r.propertyId} className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]/50 transition-colors">
                      <td className="px-4 py-3 font-medium">{r.propertyName}</td>
                      <td className="px-4 py-3 tabular-nums">{formatCurrency(r.rentDue, CURRENCY)}</td>
                      <td className="px-4 py-3 tabular-nums text-emerald-600 font-medium">{formatCurrency(r.rentCollected, CURRENCY)}</td>
                      <td className="px-4 py-3 tabular-nums text-red-600">{formatCurrency(r.outstanding, CURRENCY)}</td>
                      <td className="px-4 py-3">
                        <span className={`font-semibold ${r.collectionPct >= 90 ? "text-emerald-600" : r.collectionPct >= 70 ? "text-amber-600" : "text-red-600"}`}>
                          {r.collectionPct}%
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{r.paidCount}</td>
                      <td className="px-4 py-3 tabular-nums text-red-500">{r.overdueCount}</td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Rent Arrears tab ──────────────────────────────────────────────────────────

const BUCKET_LABELS: Record<string, string> = {
  "0_30": "0–30 days",
  "31_60": "31–60 days",
  "61_90": "61–90 days",
  "90_plus": "90+ days",
};

const BUCKET_COLORS: Record<string, string> = {
  "0_30": "text-amber-600 bg-amber-50 dark:bg-amber-500/15",
  "31_60": "text-orange-600 bg-orange-50 dark:bg-orange-500/15",
  "61_90": "text-red-600 bg-red-50 dark:bg-red-500/15",
  "90_plus": "text-red-800 bg-red-100 dark:bg-red-900/30 font-semibold",
};

function RentArrearsTab() {
  const [bucket, setBucket] = useState<"0_30" | "31_60" | "61_90" | "90_plus">("0_30");
  const { data, isLoading } = useRentArrearsReport();

  const summary = data?.summary ?? {};
  const rows    = data?.buckets?.[bucket] ?? [];

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {(["0_30", "31_60", "61_90", "90_plus"] as const).map((b) => (
            <button
              key={b}
              onClick={() => setBucket(b)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
                bucket === b
                  ? `${BUCKET_COLORS[b]} border-transparent ring-1 ring-current`
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {BUCKET_LABELS[b]}
              <span className="font-bold">{(summary[b as keyof typeof summary] as {count: number})?.count ?? 0}</span>
            </button>
          ))}
        </div>
        <ExportBtn report="rent-arrears" label="Arrears" />
      </div>

      {data && (
        <div className="rounded-[6px] border border-border bg-muted/30 p-3 text-sm">
          Total owed in <strong>{BUCKET_LABELS[bucket]}</strong>:{" "}
          <span className="font-bold text-red-600">
            {formatCurrency((summary[bucket as keyof typeof summary] as {totalOwed: number})?.totalOwed ?? 0, CURRENCY)}
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-sm)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
                {["Tenant", "Property", "Unit", "Due Date", "Amount Owed", "Days Overdue"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-[hsl(var(--border))]">{Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton /></td>
                    ))}</tr>
                  ))
                : rows.length === 0
                  ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">No arrears in this bucket</td></tr>
                  : rows.map((r, i) => (
                    <tr key={`${r.tenantId}-${r.dueDate}-${i}`} className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]/50 transition-colors">
                      <td className="px-4 py-3 font-medium">{r.tenantName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.propertyName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.unitName ?? "—"}</td>
                      <td className="px-4 py-3">{formatDate(r.dueDate)}</td>
                      <td className="px-4 py-3 font-semibold text-red-600 tabular-nums">{formatCurrency(r.amountOwed, CURRENCY)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BUCKET_COLORS[bucket]}`}>
                          {r.daysOverdue}d
                        </span>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Occupancy tab ─────────────────────────────────────────────────────────────

function OccupancyTab() {
  const { data, isLoading } = useOccupancyReport();

  return (
    <div className="space-y-4 mt-4">
      {data?.totals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard label="Total Units"  value={String(data.totals.totalUnits)}   icon={Home}          color="bg-teal-50 text-teal-600 dark:bg-teal-500/15" />
          <KpiCard label="Occupied"     value={String(data.totals.occupied)}      icon={Users}         color="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15" />
          <KpiCard label="Vacant"       value={String(data.totals.vacant)}        icon={Home}          color="bg-amber-50 text-amber-600 dark:bg-amber-500/15" sub={`${data.totals.vacancyPct}% vacancy rate`} />
          <KpiCard label="Lost Revenue" value={formatCurrency(data.totals.monthlyRentLostEst, CURRENCY)} icon={TrendingUp} color="bg-red-50 text-red-600 dark:bg-red-500/15" sub="monthly estimate" />
        </div>
      )}
      <div className="overflow-hidden rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-sm)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
                {["Property", "Total", "Occupied", "Vacant", "Vacancy %", "Lost Rent/mo"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-[hsl(var(--border))]">{Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton /></td>
                    ))}</tr>
                  ))
                : (data?.properties ?? []).length === 0
                  ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">No properties found</td></tr>
                  : (data?.properties ?? []).map((r) => (
                    <tr key={r.propertyId} className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]/50 transition-colors">
                      <td className="px-4 py-3 font-medium">{r.propertyName}</td>
                      <td className="px-4 py-3 tabular-nums">{r.totalUnits}</td>
                      <td className="px-4 py-3 tabular-nums text-emerald-600">{r.occupied}</td>
                      <td className="px-4 py-3 tabular-nums text-amber-600">{r.vacant}</td>
                      <td className="px-4 py-3">
                        <span className={`font-semibold ${r.vacancyPct === 0 ? "text-emerald-600" : r.vacancyPct < 20 ? "text-amber-600" : "text-red-600"}`}>
                          {r.vacancyPct}%
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-red-500">{formatCurrency(r.monthlyRentLost, CURRENCY)}</td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Maintenance tab ───────────────────────────────────────────────────────────

function MaintenanceTab() {
  const [from, setFrom] = useState("");
  const [to, setTo]     = useState("");
  const params = { dateFrom: from || undefined, dateTo: to || undefined };
  const { data: overview, isLoading }  = useMaintenanceOverviewReport(params);
  const { data: costs }               = useMaintenanceCostReport(params);

  return (
    <div className="space-y-6 mt-4">
      <div className="flex items-center gap-3 flex-wrap">
        <DateRange from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">By Status</CardTitle></CardHeader>
          <CardContent>
            {isLoading
              ? <Skeleton className="h-32" />
              : <div className="space-y-2">
                  {Object.entries(overview?.summary ?? {}).map(([state, n]) => (
                    <div key={state} className="flex items-center justify-between text-sm">
                      <StatusBadge state={state} domain="maintenance" />
                      <span className="font-medium tabular-nums">{n as number}</span>
                    </div>
                  ))}
                </div>
            }
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">By Priority</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(overview?.byPriority ?? {}).map(([p, n]) => (
                <div key={p} className="flex items-center justify-between text-sm">
                  <span className="capitalize">{p}</span>
                  <span className="font-medium tabular-nums">{n as number}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Total Cost (resolved)</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive tabular-nums">
              {formatCurrency(costs?.totalCost ?? 0, CURRENCY)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">resolved / closed issues</p>
          </CardContent>
        </Card>
      </div>

      <div className="overflow-hidden rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-sm)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
                {["Property", "Open", "In Progress", "Resolved", "Total"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-[hsl(var(--border))]">{Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton /></td>
                    ))}</tr>
                  ))
                : (overview?.byProperty ?? []).length === 0
                  ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No maintenance data</td></tr>
                  : (overview?.byProperty ?? []).map((r) => (
                    <tr key={r.propertyId} className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]/50 transition-colors">
                      <td className="px-4 py-3 font-medium">{r.propertyName}</td>
                      <td className="px-4 py-3 tabular-nums text-red-500">{r.open}</td>
                      <td className="px-4 py-3 tabular-nums text-amber-500">{r.inProgress}</td>
                      <td className="px-4 py-3 tabular-nums text-emerald-600">{r.resolved}</td>
                      <td className="px-4 py-3 tabular-nums">{r.total}</td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Lease Expiry tab ──────────────────────────────────────────────────────────

function LeaseExpiryTab() {
  const [window, setWindow] = useState<"30" | "60" | "90">("30");
  const { data, isLoading } = useLeaseExpiryReport();

  const rows    = data?.windows?.[window] ?? [];
  const summary = data?.summary ?? {};

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {(["30", "60", "90"] as const).map((w) => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                window === w
                  ? "bg-primary text-primary-foreground border-transparent"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {w} days ({(summary as Record<string, number>)[w] ?? 0})
            </button>
          ))}
        </div>
        <ExportBtn report="lease-expiry" label="Expiry" />
      </div>

      <div className="overflow-hidden rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-sm)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
                {["Reference", "Tenant", "Property", "Unit", "End Date", "Days Left", "Monthly Rent"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-[hsl(var(--border))]">{Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton /></td>
                    ))}</tr>
                  ))
                : rows.length === 0
                  ? <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">No leases expiring in this window</td></tr>
                  : rows.map((r) => (
                    <tr key={r.leaseId} className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">{r.leaseRef}</td>
                      <td className="px-4 py-3 font-medium">{r.tenantName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.propertyName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.unitName ?? "—"}</td>
                      <td className="px-4 py-3">{formatDate(r.endDate)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.daysUntilExpiry <= 30 ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                          r.daysUntilExpiry <= 60 ? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {r.daysUntilExpiry}d
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums font-medium">{formatCurrency(r.monthlyRent, r.currency)}</td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Income & Expense tab ──────────────────────────────────────────────────────

function IncomeExpenseTab() {
  const [groupBy, setGroupBy] = useState<"month" | "quarter" | "year">("month");
  const [months, setMonths]   = useState(12);
  const params = { groupBy, months };
  const { data, isLoading } = useIncomeExpenseReport(params);

  const totals = (data ?? []).reduce(
    (acc, r) => ({ revenue: acc.revenue + r.revenue, expenses: acc.expenses + r.expenses, net: acc.net + r.netIncome }),
    { revenue: 0, expenses: 0, net: 0 },
  );

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {(["month", "quarter", "year"] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors capitalize ${
                  groupBy === g
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="rounded-[6px] border border-border bg-background px-2 py-1.5 text-xs focus:outline-none"
          >
            {[6, 12, 24, 36].map((m) => (
              <option key={m} value={m}>{m} months</option>
            ))}
          </select>
        </div>
        <ExportBtn report="income-expense" params={{ groupBy, months }} label="P&L" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Total Revenue</p>
          <p className="text-xl font-bold text-emerald-600 tabular-nums">{formatCurrency(totals.revenue, CURRENCY)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Total Expenses</p>
          <p className="text-xl font-bold text-red-600 tabular-nums">{formatCurrency(totals.expenses, CURRENCY)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Net Income</p>
          <p className={`text-xl font-bold tabular-nums ${totals.net >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {formatCurrency(totals.net, CURRENCY)}
          </p>
        </CardContent></Card>
      </div>

      <div className="overflow-hidden rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-sm)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
                {["Period", "Revenue", "Expenses", "Net Income"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-[hsl(var(--border))]">{Array.from({ length: 4 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton /></td>
                    ))}</tr>
                  ))
                : (data ?? []).length === 0
                  ? <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">No income/expense data</td></tr>
                  : (data ?? []).map((r) => (
                    <tr key={r.periodStart} className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]/50 transition-colors">
                      <td className="px-4 py-3 font-medium">{r.period}</td>
                      <td className="px-4 py-3 tabular-nums text-emerald-600">{formatCurrency(r.revenue, CURRENCY)}</td>
                      <td className="px-4 py-3 tabular-nums text-red-600">{formatCurrency(r.expenses, CURRENCY)}</td>
                      <td className="px-4 py-3">
                        <span className={`font-semibold tabular-nums ${r.netIncome >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {formatCurrency(r.netIncome, CURRENCY)}
                        </span>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { data: sub } = useCurrentSubscription();
  const features = sub?.plan?.features as Record<string, unknown> | undefined;

  if (sub && features?.analytics_advanced !== true) {
    return (
      <div className="p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Portfolio analytics, rent collection, arrears, maintenance, and P&L
          </p>
        </div>
        <FeatureUpgradeCTA
          feature="Advanced Reports"
          requiredPlan="Professional or above"
          description="Detailed reporting and analytics are available on Professional, Agency, and Enterprise plans."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Portfolio analytics, rent collection, arrears, maintenance, and P&L
        </p>
      </div>

      <Tabs defaultValue="portfolio">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          <TabsTrigger value="collection">Rent Collection</TabsTrigger>
          <TabsTrigger value="arrears">Arrears</TabsTrigger>
          <TabsTrigger value="occupancy">Occupancy</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="expiry">Lease Expiry</TabsTrigger>
          <TabsTrigger value="pnl">Income & Expense</TabsTrigger>
        </TabsList>

        <TabsContent value="portfolio"><PortfolioTab /></TabsContent>
        <TabsContent value="collection"><RentCollectionTab /></TabsContent>
        <TabsContent value="arrears"><RentArrearsTab /></TabsContent>
        <TabsContent value="occupancy"><OccupancyTab /></TabsContent>
        <TabsContent value="maintenance"><MaintenanceTab /></TabsContent>
        <TabsContent value="expiry"><LeaseExpiryTab /></TabsContent>
        <TabsContent value="pnl"><IncomeExpenseTab /></TabsContent>
      </Tabs>
    </div>
  );
}
