"use client";

import { useState } from "react";
import { OccupancyChart } from "@/components/dashboard/OccupancyChart";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardStats, useCashFlowData } from "@/hooks/usePayments";
import { useProperties } from "@/hooks/useProperties";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrencyCompact } from "@/utils/formatters";
import { cn } from "@/utils/cn";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const MONTH_OPTIONS = [3, 6, 12] as const;

export default function AnalyticsPage() {
  const [propertyId, setPropertyId] = useState<string>("all");
  const [months, setMonths] = useState<3 | 6 | 12>(12);

  const { data: stats } = useDashboardStats();
  const { data: cashFlowRaw } = useCashFlowData(months);
  const { data: propertiesData } = useProperties();

  const properties = propertiesData?.data ?? [];

  // Slice cash flow to selected month window
  const cashFlow = cashFlowRaw?.slice(-months) ?? [];

  const kpis = [
    { label: "Total Revenue (MTD)", value: formatCurrencyCompact(stats?.monthlyRevenue ?? 0, "UGX"), change: "+12%", positive: true },
    { label: "Collection Rate",     value: `${stats?.collectionRate ?? 0}%`,                        change: "+3%",  positive: true },
    { label: "Occupancy Rate",      value: `${stats?.occupancyRate ?? 0}%`,                         change: "+1.5%",positive: true },
    { label: "Overdue Amount",      value: formatCurrencyCompact(stats?.overdueAmount ?? 0, "UGX"), change: "-8%",  positive: false },
    { label: "Active Tenants",      value: stats?.activeTenants ?? 0,                          change: "+2",   positive: true },
    { label: "Open Maintenance",    value: stats?.openMaintenanceIssues ?? 0,                  change: "-1",   positive: true },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Portfolio performance and financial insights
          </p>
        </div>

        {/* Filter controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Property filter */}
          <Select value={propertyId} onValueChange={setPropertyId}>
            <SelectTrigger className="w-[180px]" aria-label="Filter by property">
              <SelectValue placeholder="All Properties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Properties</SelectItem>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date range */}
          <div className="flex rounded-[5px] border border-input overflow-hidden shadow-sm">
            {MONTH_OPTIONS.map((m) => (
              <button
                key={m}
                onClick={() => setMonths(m)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium transition-colors",
                  months === m
                    ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-semibold ring-1 ring-inset ring-emerald-600/50"
                    : "bg-background text-foreground/70 hover:bg-primary/5 hover:text-foreground",
                )}
              >
                {m}M
              </button>
            ))}
          </div>
        </div>
      </div>

      {propertyId !== "all" && (
        <div className="rounded-[6px] border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-muted-foreground">
          Showing data for{" "}
          <span className="font-medium text-foreground">
            {properties.find((p) => p.id === propertyId)?.name ?? propertyId}
          </span>
          {" "}· {months}-month window
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground leading-tight">{kpi.label}</p>
              <p className="text-xl font-bold mt-1">{kpi.value}</p>
              <p className={cn(
                "text-xs mt-0.5 font-medium",
                kpi.positive ? "text-emerald-600" : "text-red-500",
              )}>
                {kpi.change} vs last month
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <OccupancyChart />
        <RevenueChart />
      </div>

      {cashFlow.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cash Flow — Last {months} months</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={cashFlow} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="cashIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="cashOut" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value, "UGX"), ""]}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend />
                <Area type="monotone" dataKey="inflow"  name="Cash In"  stroke="#10b981" fill="url(#cashIn)"  strokeWidth={2} />
                <Area type="monotone" dataKey="outflow" name="Cash Out" stroke="#ef4444" fill="url(#cashOut)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
