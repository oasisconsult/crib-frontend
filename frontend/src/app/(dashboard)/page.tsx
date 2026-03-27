"use client";

import { StatsGrid } from "@/components/dashboard/StatsGrid";
import { OccupancyChart } from "@/components/dashboard/OccupancyChart";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { ActivityTimeline } from "@/components/dashboard/ActivityTimeline";
import { PendingRentWidget } from "@/components/dashboard/PendingRentWidget";
import { useAppStore } from "@/store/useAppStore";

export default function DashboardPage() {
  const activeProperty = useAppStore((s) => s.activeProperty);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {activeProperty
            ? `Overview for ${activeProperty.name}`
            : "Portfolio overview"}
        </p>
      </div>

      <StatsGrid />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <OccupancyChart />
        <RevenueChart />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <PendingRentWidget />
        </div>
        <ActivityTimeline />
      </div>
    </div>
  );
}
