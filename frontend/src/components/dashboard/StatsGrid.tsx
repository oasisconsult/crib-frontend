"use client";

import {
  Building2,
  Users,
  TrendingUp,
  AlertCircle,
  Banknote,
  Clock,
  CheckCircle,
  Wrench,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatPercentage } from "@/utils/formatters";
import { cn } from "@/utils/cn";
import type { DashboardStats } from "@/types";

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  changePositive?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
}

function StatCard({ title, value, change, changePositive, icon: Icon, iconBg, iconColor }: StatCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="mt-1.5 text-2xl font-bold tracking-tight">{value}</p>
            {change && (
              <p
                className={cn(
                  "mt-1 text-xs font-medium",
                  changePositive ? "text-emerald-600" : "text-red-500",
                )}
                aria-label={`${changePositive ? "Increased" : "Decreased"} by ${change}`}
              >
                {changePositive ? "↑" : "↓"} {change}
              </p>
            )}
          </div>
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", iconBg)}>
            <Icon className={cn("h-5 w-5", iconColor)} aria-hidden="true" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface StatsGridProps {
  stats?: DashboardStats;
  loading?: boolean;
}

export function StatsGrid({ stats, loading }: StatsGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const cards: StatCardProps[] = [
    {
      title: "Occupancy Rate",
      value: formatPercentage(stats.occupancyRate),
      change: "+2.3% vs last month",
      changePositive: true,
      icon: Building2,
      iconBg: "bg-indigo-100 dark:bg-indigo-900/30",
      iconColor: "text-indigo-600 dark:text-indigo-400",
    },
    {
      title: "Active Tenants",
      value: `${stats.activeTenants} / ${stats.totalTenants}`,
      icon: Users,
      iconBg: "bg-sky-100 dark:bg-sky-900/30",
      iconColor: "text-sky-600 dark:text-sky-400",
    },
    {
      title: "Monthly Revenue",
      value: formatCurrency(stats.monthlyRevenue),
      change: formatPercentage(stats.collectionRate) + " collected",
      changePositive: stats.collectionRate >= 95,
      icon: Banknote,
      iconBg: "bg-emerald-100 dark:bg-emerald-900/30",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      title: "Overdue Amount",
      value: formatCurrency(stats.overdueAmount),
      change: `${stats.overduePayments} payment${stats.overduePayments !== 1 ? "s" : ""}`,
      changePositive: false,
      icon: AlertCircle,
      iconBg: "bg-red-100 dark:bg-red-900/30",
      iconColor: "text-red-600 dark:text-red-400",
    },
    {
      title: "Total Units",
      value: `${stats.occupiedUnits} / ${stats.totalUnits}`,
      icon: Building2,
      iconBg: "bg-violet-100 dark:bg-violet-900/30",
      iconColor: "text-violet-600 dark:text-violet-400",
    },
    {
      title: "Pending Onboarding",
      value: String(stats.pendingOnboarding),
      icon: Clock,
      iconBg: "bg-amber-100 dark:bg-amber-900/30",
      iconColor: "text-amber-600 dark:text-amber-400",
    },
    {
      title: "Collection Rate",
      value: formatPercentage(stats.collectionRate),
      change: "target: 98%",
      changePositive: stats.collectionRate >= 98,
      icon: TrendingUp,
      iconBg: "bg-teal-100 dark:bg-teal-900/30",
      iconColor: "text-teal-600 dark:text-teal-400",
    },
    {
      title: "Open Maintenance",
      value: String(stats.openMaintenanceIssues),
      icon: Wrench,
      iconBg: "bg-orange-100 dark:bg-orange-900/30",
      iconColor: "text-orange-600 dark:text-orange-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Key statistics">
      {cards.map((card) => (
        <StatCard key={card.title} {...card} />
      ))}
    </div>
  );
}
