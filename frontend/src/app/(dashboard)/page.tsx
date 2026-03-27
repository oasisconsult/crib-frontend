"use client";

import { StatsGrid } from "@/components/dashboard/StatsGrid";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { PendingRentWidget } from "@/components/dashboard/PendingRentWidget";
import { ActivityTimeline } from "@/components/dashboard/ActivityTimeline";
import { TopProperties } from "@/components/dashboard/TopProperties";
import { useAppStore } from "@/store/useAppStore";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const user = useAppStore((s) => s.user);
  const firstName = user?.name?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-6">
      {/* ── Welcome ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-0.5">
        <h1 className="text-2xl font-bold tracking-tight">
          {getGreeting()}, {firstName}!
        </h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s what&apos;s happening with your portfolio today.
        </p>
      </div>

      {/* ── 4 key stat cards ─────────────────────────────────── */}
      <StatsGrid />

      {/* ── Revenue chart + Top properties ───────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RevenueChart />
        </div>
        <TopProperties />
      </div>

      {/* ── Recent payments + Activity ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <PendingRentWidget />
        </div>
        <ActivityTimeline />
      </div>
    </div>
  );
}
