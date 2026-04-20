"use client";

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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useOccupancyData } from "@/hooks/usePayments";
import type { OccupancyDataPoint } from "@/types";

interface OccupancyChartProps {
  data?: OccupancyDataPoint[];
  loading?: boolean;
}

export function OccupancyChart({ data: dataProp, loading: loadingProp }: OccupancyChartProps) {
  const { data: fetchedData, isLoading: fetchLoading } = useOccupancyData();
  const data = dataProp ?? fetchedData;
  const loading = loadingProp ?? fetchLoading;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Occupancy Trend</CardTitle>
        <CardDescription>Units occupied vs available over time</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-52 w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="occupiedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="availableGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#e2e8f0" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#e2e8f0" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
              <Tooltip
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--card))",
                  color: "hsl(var(--foreground))",
                  fontSize: 13,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="occupied"
                name="Occupied"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#occupiedGrad)"
              />
              <Area
                type="monotone"
                dataKey="available"
                name="Available"
                stroke="#94a3b8"
                strokeWidth={2}
                fill="url(#availableGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
