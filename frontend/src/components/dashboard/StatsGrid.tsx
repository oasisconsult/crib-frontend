"use client";

import { Building2, Users, Banknote, AlertCircle, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StatsGridSkeleton } from "./DashboardSkeleton";
import { formatCurrency, formatPercentage } from "@/utils/formatters";
import { cn } from "@/utils/cn";
import { useDashboardStats } from "@/hooks/usePayments";
import type { DashboardStats } from "@/types";

interface StatCardProps {
  title: string;
  value: string;
  trend?: { label: string; positive: boolean };
  progress?: number; // 0-100
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
}

function StatCard({ title, value, trend, progress, icon: Icon, iconBg, iconColor }: StatCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow overflow-hidden">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">{title}</p>
            <p className="mt-2 text-xl sm:text-2xl font-bold tracking-tight leading-none break-words">{value}</p>
            {trend && (
              <div className={cn("flex items-center gap-1 mt-2 text-xs font-medium",
                trend.positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
              )}>
                {trend.positive
                  ? <TrendingUp className="h-3 w-3 shrink-0" />
                  : <TrendingDown className="h-3 w-3 shrink-0" />}
                <span className="truncate">{trend.label}</span>
              </div>
            )}
          </div>
          <div className={cn("flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl", iconBg)}>
            <Icon className={cn("h-4 w-4 sm:h-5 sm:w-5", iconColor)} />
          </div>
        </div>
        {progress !== undefined && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span className="truncate">Progress</span>
              <span className="shrink-0">{progress}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", progress >= 80 ? "bg-emerald-500" : progress >= 60 ? "bg-amber-500" : "bg-red-500")}
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function StatsGrid({ stats: statsProp, loading: loadingProp }: { stats?: DashboardStats; loading?: boolean }) {
  const { data: fetchedStats, isLoading: fetchLoading } = useDashboardStats();
  const stats = statsProp ?? fetchedStats;
  const loading = loadingProp ?? fetchLoading;

  if (loading) {
    return <StatsGridSkeleton />;
  }

  if (!stats) return null;

  const occupancy = Math.round(stats.occupancyRate);
  const collection = Math.round(stats.collectionRate);

  const cards: StatCardProps[] = [
    {
      title: "Monthly Revenue",
      value: formatCurrency(stats.monthlyRevenue),
      trend: { label: "+6.2% vs last month", positive: true },
      icon: Banknote,
      iconBg: "bg-emerald-100 dark:bg-emerald-900/30",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      title: "Occupancy Rate",
      value: formatPercentage(stats.occupancyRate),
      trend: { label: "+2.3% vs last month", positive: true },
      progress: occupancy,
      icon: Building2,
      iconBg: "bg-indigo-100 dark:bg-indigo-900/30",
      iconColor: "text-indigo-600 dark:text-indigo-400",
    },
    {
      title: "Active Tenants",
      value: `${stats.activeTenants} / ${stats.totalTenants}`,
      trend: { label: `${stats.totalTenants - stats.activeTenants} pending`, positive: stats.activeTenants >= stats.totalTenants * 0.9 },
      icon: Users,
      iconBg: "bg-sky-100 dark:bg-sky-900/30",
      iconColor: "text-sky-600 dark:text-sky-400",
    },
    {
      title: "Overdue Payments",
      value: formatCurrency(stats.overdueAmount),
      trend: { label: `${stats.overduePayments} overdue`, positive: false },
      icon: AlertCircle,
      iconBg: "bg-red-100 dark:bg-red-900/30",
      iconColor: "text-red-600 dark:text-red-400",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
      {cards.map((card) => (
        <StatCard key={card.title} {...card} />
      ))}
    </div>
  );
}
