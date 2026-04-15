"use client";

import { Building2, Users, Banknote, AlertCircle, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StatsGridSkeleton } from "./DashboardSkeleton";
import { formatCurrency, formatPercentage } from "@/utils/formatters";
import { cn } from "@/utils/cn";

interface StatCardProps {
  title: string;
  value: string;
  trend?: {
    value?: string;
    label?: string;
    positive: boolean;
  };
  icon: any;
  color: string;
  progress?: number;
  iconBg?: string;
  iconColor?: string;
}

function StatCard({ title, value, trend, icon: Icon, color, progress }: StatCardProps) {
  const iconBg = {
    blue:   "bg-blue-500",
    green:  "bg-emerald-500",
    purple: "bg-violet-500",
    orange: "bg-orange-500",
    red:    "bg-red-500",
  }[color] ?? "bg-slate-500";

  const progressColor = progress === undefined ? "" :
    progress >= 80 ? "bg-emerald-500" :
    progress >= 60 ? "bg-amber-500" :
    "bg-red-500";

  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
            <p className="text-2xl font-bold text-foreground mt-1 tabular-nums">{value}</p>
            {trend && (
              <div className={cn(
                "mt-1.5 flex items-center gap-1 text-xs font-medium",
                trend.positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
              )}>
                {trend.positive
                  ? <TrendingUp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  : <TrendingDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                <span>{trend.value ?? trend.label}</span>
              </div>
            )}
          </div>
          <div className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
            iconBg,
          )}>
            <Icon className="h-5 w-5 text-white" aria-hidden="true" />
          </div>
        </div>
        {progress !== undefined && (
          <div className="mt-5">
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>Progress</span>
              <span className="font-semibold text-foreground">{progress}%</span>
            </div>
            <div className="h-2 w-full rounded-full overflow-hidden bg-muted">
              <div
                className={cn("h-full rounded-full transition-all duration-500", progressColor)}
                style={{ width: `${Math.min(progress, 100)}%` }}
                role="presentation"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function StatsGrid({ stats: statsProp, loading: loadingProp }: { stats?: any; loading?: boolean }) {
  const stats = statsProp ?? {
    monthlyRevenue: 12450,
    occupancyRate: 0.75,
    activeTenants: 18,
    totalTenants: 20,
    collectionRate: 0.95
  };
  const loading = loadingProp ?? false;

  if (loading) {
    return <StatsGridSkeleton />;
  }

  if (!stats) return null;

  const occupancy = Math.round(stats.occupancyRate);
  const collection = Math.round(stats.collectionRate);

  const cards = [
    {
      title: "Monthly Revenue",
      value: formatCurrency(stats.monthlyRevenue),
      trend: { value: "+6.2% vs last month", positive: true },
      icon: Banknote,
      color: "blue",
      progress: 92
    },
    {
      title: "Occupancy Rate",
      value: formatPercentage(stats.occupancyRate),
      trend: { value: "+2.3% vs last month", positive: true },
      icon: Building2,
      color: "green",
      progress: occupancy
    },
    {
      title: "Active Tenants",
      value: `${stats.activeTenants} / ${stats.totalTenants}`,
      trend: { label: `${stats.totalTenants - stats.activeTenants} pending`, positive: stats.activeTenants >= stats.totalTenants * 0.9 },
      icon: Users,
      iconBg: "bg-gradient-to-br from-purple-50 to-purple-100",
      iconColor: "text-purple-600",
      color: "purple",
    },
    {
      title: "Overdue Payments",
      value: formatCurrency(stats.overdueAmount),
      trend: { label: `${stats.overduePayments} overdue`, positive: false },
      icon: AlertCircle,
      iconBg: "bg-gradient-to-br from-rose-50 to-rose-100",
      iconColor: "text-rose-600",
      color: "red",
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
