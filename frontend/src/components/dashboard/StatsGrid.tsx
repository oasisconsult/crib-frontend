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
  const getCardClass = () => {
    switch (color) {
      case "blue":
        return "border-blue-200 bg-blue-50";
      case "green":
        return "border-green-200 bg-green-50";
      case "purple":
        return "border-purple-200 bg-purple-50";
      case "orange":
        return "border-orange-200 bg-orange-50";
      default:
        return "border-gray-200 bg-gray-50";
    }
  };

  const getIconBg = () => {
    switch (color) {
      case "blue":
        return "bg-blue-500";
      case "green":
        return "bg-green-500";
      case "purple":
        return "bg-purple-500";
      case "orange":
        return "bg-orange-500";
      default:
        return "bg-gray-500";
    }
  };

  const getIconColor = () => {
    return "text-white";
  };

  const getProgressClass = () => {
    if (progress === undefined) return "";
    if (progress >= 80) return "bg-green-500";
    if (progress >= 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <Card className={cn("re-card", getCardClass())}>
      <CardContent className="re-card-content">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="re-dashboard-card-title">{title}</p>
            <p className="re-dashboard-card-value">{value}</p>
            {trend && (
              <div className={cn(
                "re-dashboard-card-trend",
                trend.positive ? "re-trend-up" : "re-trend-down"
              )}>
                {trend.positive
                  ? <TrendingUp className="w-4 h-4" />
                  : <TrendingDown className="w-4 h-4" />}
                {trend.value}
              </div>
            )}
          </div>
          <div className={cn(
            "re-icon-wrapper flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-sm",
            getIconBg()
          )}>
            <Icon className={cn("h-6 w-6", getIconColor())} />
          </div>
        </div>
        {progress !== undefined && (
          <div className="mt-6">
            <div className="flex justify-between re-dashboard-card-trend mb-2">
              <span className="truncate">Progress</span>
              <span className="shrink-0 font-semibold">{progress}%</span>
            </div>
            <div className="re-progress-bar h-3 w-full rounded-full overflow-hidden bg-gray-200">
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
