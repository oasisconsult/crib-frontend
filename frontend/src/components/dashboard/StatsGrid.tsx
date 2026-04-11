"use client";

import { Building2, Users, Banknote, AlertCircle, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StatsGridSkeleton } from "./DashboardSkeleton";
import { formatCurrency, formatPercentage } from "@/utils/formatters";
import { cn } from "@/utils/cn";
import { useDashboardStats } from "@/hooks/usePayments";
import { realEstateColors, realEstateColorVariants } from "./AccessibilityEnhancements";
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
  const getCardClass = () => {
    if (title.includes("Revenue")) return "re-stat-card revenue";
    if (title.includes("Occupancy")) return "re-stat-card occupancy";
    if (title.includes("Tenants")) return "re-stat-card tenants";
    if (title.includes("Overdue")) return "re-stat-card overdue";
    return "re-stat-card";
  };

  const getProgressClass = () => {
    if (progress === undefined) return "";
    if (progress >= 80) return "re-progress-bar success";
    if (progress >= 60) return "re-progress-bar warning";
    return "re-progress-bar error";
  };

  return (
    <Card className={cn("re-stat-card", getCardClass())}>
      <CardContent className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="stat-label truncate mb-3" style={{ fontSize: '12px', fontWeight: '600', lineHeight: '1.4', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</p>
            <p className="mt-2 stat-value leading-none break-words mb-3" style={{ fontSize: '20px', fontWeight: '700', lineHeight: '1.2' }}>{value}</p>
            {trend && (
              <div className={cn("flex items-center gap-2 stat-trend",
                trend.positive ? "re-status-success" : "re-status-error"
              )} style={{ fontSize: '12px', fontWeight: '500', lineHeight: '1.4' }}>
                {trend.positive
                  ? <TrendingUp className="h-4 w-4 shrink-0" />
                  : <TrendingDown className="h-4 w-4 shrink-0" />}
                <span className="truncate">{trend.label}</span>
              </div>
            )}
          </div>
          <div className={cn("re-icon-wrapper flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-xl shadow-sm", iconBg)}>
            <Icon className={cn("h-6 w-6 sm:h-7 sm:w-7", iconColor)} />
          </div>
        </div>
        {progress !== undefined && (
          <div className="mt-6">
            <div className="flex justify-between stat-trend mb-2" style={{ fontSize: '12px', fontWeight: '500', lineHeight: '1.4' }}>
              <span className="truncate">Progress</span>
              <span className="shrink-0 font-semibold">{progress}%</span>
            </div>
            <div className="re-progress-bar h-3 w-full rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-500", getProgressClass())}
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
      iconBg: "bg-gradient-to-br from-amber-50 to-amber-100",
      iconColor: "text-amber-600",
    },
    {
      title: "Occupancy Rate",
      value: formatPercentage(stats.occupancyRate),
      trend: { label: "+2.3% vs last month", positive: true },
      progress: occupancy,
      icon: Building2,
      iconBg: "bg-gradient-to-br from-blue-50 to-blue-100",
      iconColor: "text-blue-600",
    },
    {
      title: "Active Tenants",
      value: `${stats.activeTenants} / ${stats.totalTenants}`,
      trend: { label: `${stats.totalTenants - stats.activeTenants} pending`, positive: stats.activeTenants >= stats.totalTenants * 0.9 },
      icon: Users,
      iconBg: "bg-gradient-to-br from-purple-50 to-purple-100",
      iconColor: "text-purple-600",
    },
    {
      title: "Overdue Payments",
      value: formatCurrency(stats.overdueAmount),
      trend: { label: `${stats.overduePayments} overdue`, positive: false },
      icon: AlertCircle,
      iconBg: "bg-gradient-to-br from-rose-50 to-rose-100",
      iconColor: "text-rose-600",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
      {cards.map((card) => (
        <StatCard key={card.title} {...card} />
      ))}
    </div>
  );
}
