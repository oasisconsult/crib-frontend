"use client";

import { OccupancyChart } from "@/components/dashboard/OccupancyChart";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardStats, useOccupancyData, useRevenueData, useCashFlowData } from "@/hooks/usePayments";
import { formatCurrency } from "@/utils/formatters";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export default function AnalyticsPage() {
  const { data: stats } = useDashboardStats();
  const { data: cashFlow } = useCashFlowData();

  const kpis = [
    { label: "Total Revenue (MTD)", value: formatCurrency(stats?.monthlyRevenue ?? 0, "KES"), change: "+12%" },
    { label: "Collection Rate", value: `${stats?.collectionRate ?? 0}%`, change: "+3%" },
    { label: "Occupancy Rate", value: `${stats?.occupancyRate ?? 0}%`, change: "+1.5%" },
    { label: "Overdue Amount", value: formatCurrency(stats?.overdueAmount ?? 0, "KES"), change: "-8%", negative: true },
    { label: "Active Tenants", value: stats?.activeTenants ?? 0, change: "+2" },
    { label: "Open Maintenance", value: stats?.openMaintenanceIssues ?? 0, change: "-1" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Portfolio performance and financial insights
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground leading-tight">{kpi.label}</p>
              <p className="text-xl font-bold mt-1">{kpi.value}</p>
              <p
                className={`text-xs mt-0.5 font-medium ${
                  kpi.negative
                    ? "text-emerald-600"
                    : "text-emerald-600"
                }`}
              >
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

      {cashFlow && cashFlow.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cash Flow</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={cashFlow} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="cashIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="cashOut" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value, "KES"), ""]}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="inflow"
                  name="Cash In"
                  stroke="#22c55e"
                  fill="url(#cashIn)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="outflow"
                  name="Cash Out"
                  stroke="#ef4444"
                  fill="url(#cashOut)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
