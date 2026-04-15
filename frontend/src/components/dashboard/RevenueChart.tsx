"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/utils/formatters";
import { useRevenueData } from "@/hooks/usePayments";
import { cn } from "@/utils/cn";
import type { RevenueDataPoint } from "@/types";

interface RevenueChartProps {
  data?: RevenueDataPoint[];
  loading?: boolean;
}

const PERIODS = ["6M", "3M", "1M"] as const;

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-white dark:bg-card shadow-lg p-3 text-xs space-y-1.5 min-w-[160px]">
      <p className="font-semibold text-foreground">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-medium text-foreground">{formatCurrency(p.value, "UGX")}</span>
        </div>
      ))}
    </div>
  );
}

export function RevenueChart({ data: dataProp, loading: loadingProp }: RevenueChartProps) {
  const { data: fetchedData, isLoading: fetchLoading } = useRevenueData();
  const [period, setPeriod] = useState<"6M" | "3M" | "1M">("6M");

  const allData = dataProp ?? fetchedData ?? [];
  const sliced = period === "1M" ? allData.slice(-1) : period === "3M" ? allData.slice(-3) : allData;
  const loading = loadingProp ?? fetchLoading;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 sm:pb-3">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <CardTitle className="text-base sm:text-lg">Revenue Analytics</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Collected vs expected rent per month</CardDescription>
          </div>
          <div className="flex items-center gap-1 rounded-lg border p-0.5 shrink-0">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  period === p
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {loading ? (
          <Skeleton className="h-56 w-full" />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={sliced} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="collectedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expectedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 11 }} 
                  tickLine={false} 
                  axisLine={false}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={50}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="expected"
                  name="Expected"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  fill="url(#expectedGrad)"
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="collected"
                  name="Collected"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  fill="url(#collectedGrad)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
            {/* Legend */}
            <div className="flex items-center justify-center sm:justify-start gap-4 sm:gap-5 mt-3 px-1 flex-wrap">
              {[
                { color: "#6366f1", label: "Collected", solid: true },
                { color: "#94a3b8", label: "Expected",  solid: false },
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <svg width="20" height="8">
                    {l.solid
                      ? <line x1="0" y1="4" x2="20" y2="4" stroke={l.color} strokeWidth="2.5" />
                      : <line x1="0" y1="4" x2="20" y2="4" stroke={l.color} strokeWidth="2" strokeDasharray="5 3" />
                    }
                  </svg>
                  <span className="truncate">{l.label}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
