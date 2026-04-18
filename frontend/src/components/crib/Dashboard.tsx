"use client";

import Link from "next/link";
import {
  Building2,
  Users,
  DollarSign,
  FileText,
  TrendingUp,
  AlertTriangle,
  Plus,
  ArrowRight,
  CreditCard,
  Wrench,
  MapPin,
  ArrowUpRight,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardStats } from "@/hooks/usePayments";
import { usePayments } from "@/hooks/usePayments";
import { useProperties } from "@/hooks/useProperties";
import { useMaintenanceIssues } from "@/hooks/useInspections";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { formatCurrencyCompact, formatRelative } from "@/utils/formatters";
import type { Property, Payment, MaintenanceIssue, DashboardStats } from "@/types";

/* ─────────────────────────────────────────────────────────────────────────
   KPI CARD
   ───────────────────────────────────────────────────────────────────────── */

interface KpiCardProps {
  label: string;
  value: string;
  sub: string;
  positive: boolean;
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  href?: string;
  loading?: boolean;
}

function KpiCard({
  label, value, sub, positive, icon, iconColor, iconBg, href, loading,
}: KpiCardProps) {
  const inner = (
    <div
      className={cn(
        "bg-[hsl(var(--card))] rounded-[12px] border border-border p-5 flex flex-col gap-4",
        "shadow-[0_1px_3px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)]",
        "dark:shadow-none",
        "hover:shadow-[0_4px_12px_rgba(15,23,42,0.08)] dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.4)]",
        "transition-shadow duration-200",
        href && "group cursor-pointer",
      )}
    >
      <div className="flex items-center justify-between">
        <div
          className="h-10 w-10 rounded-[8px] flex items-center justify-center shrink-0"
          style={{ background: iconBg }}
          aria-hidden="true"
        >
          <span style={{ color: iconColor }}>{icon}</span>
        </div>
        {loading ? (
          <Skeleton className="h-5 w-16 rounded-[4px]" />
        ) : (
          <span
            className={cn(
              "flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-[4px]",
              positive
                ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-100/40 dark:text-emerald-300"
                : "bg-red-50 text-red-800 dark:bg-red-100/40 dark:text-red-300",
            )}
          >
            {positive ? <TrendingUp className="h-3 w-3" aria-hidden="true" /> : <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
            {sub}
          </span>
        )}
      </div>
      <div>
        {loading ? (
          <>
            <Skeleton className="h-8 w-24 mb-1.5" />
            <Skeleton className="h-3 w-32" />
          </>
        ) : (
          <>
            <p
              className="text-[28px] font-bold text-foreground leading-none tracking-[-0.03em]"
              style={{ fontFamily: "var(--font-poppins,'Poppins',sans-serif)" }}
            >
              {value}
            </p>
            <p className="text-xs font-medium text-muted-foreground mt-1.5 uppercase tracking-[0.05em]">
              {label}
            </p>
          </>
        )}
      </div>
    </div>
  );

  if (href && !loading) {
    return (
      <Link href={href as any} className="block" aria-label={`${label}: ${value}`}>
        {inner}
      </Link>
    );
  }
  return inner;
}

/* ─────────────────────────────────────────────────────────────────────────
   PROPERTY ROW
   ───────────────────────────────────────────────────────────────────────── */

function PropertyRow({ p }: { p: Property }) {
  const pct = Math.round(p.occupancyRate ?? (p.totalUnits > 0 ? (p.occupiedUnits / p.totalUnits) * 100 : 0));
  const barClass =
    pct >= 85 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-400";
  const textClass =
    pct >= 85
      ? "text-emerald-700 dark:text-emerald-400"
      : pct >= 60
        ? "text-amber-700 dark:text-amber-400"
        : "text-red-700 dark:text-red-400";

  return (
    <Link
      href={`/properties/${p.id}` as any}
      className="flex items-center gap-3 py-3 px-5 border-b border-border/60 last:border-0 hover:bg-muted/40 transition-colors cursor-pointer group"
    >
      <div
        className="h-8 w-8 rounded-[7px] bg-accent flex items-center justify-center shrink-0"
        aria-hidden="true"
      >
        <Building2 className="h-3.5 w-3.5 text-accent-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-foreground truncate group-hover:text-primary transition-colors">
          {p.name}
        </p>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
          <MapPin className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
          {p.address?.city ?? "—"}
        </p>
      </div>
      <div className="hidden md:flex flex-col gap-1 w-24 shrink-0">
        <div className="flex justify-between text-[10px] font-medium">
          <span className={textClass}>{pct}%</span>
          <span className="text-muted-foreground">{p.occupiedUnits}/{p.totalUnits}</span>
        </div>
        <div
          className="h-1.5 bg-muted rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${pct}% occupied`}
        >
          <div className={cn("h-full rounded-full", barClass)} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="hidden sm:block text-right shrink-0">
        <p className="text-[13px] font-semibold text-foreground">
          {formatCurrencyCompact(p.monthlyRevenue ?? 0, p.currency ?? "UGX")}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">/ month</p>
      </div>
    </Link>
  );
}

function PropertyRowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-3 px-5 border-b border-border/60 last:border-0">
      <Skeleton className="h-8 w-8 rounded-[7px] shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-36" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="hidden md:block h-8 w-24" />
      <Skeleton className="hidden sm:block h-8 w-16" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   ACTIVITY FEED
   Built from recent payments + maintenance issues
   ───────────────────────────────────────────────────────────────────────── */

type ActivityEntry =
  | { kind: "payment"; item: Payment; timestamp: string }
  | { kind: "maintenance"; item: MaintenanceIssue; timestamp: string };

const ACTIVITY_ICON_CLASSES = {
  payment: {
    bg: "bg-blue-50 dark:bg-blue-100/40",
    text: "text-blue-700 dark:text-blue-300",
    icon: CreditCard,
  },
  maintenance: {
    bg: "bg-amber-50 dark:bg-amber-100/40",
    text: "text-amber-700 dark:text-amber-300",
    icon: Wrench,
  },
} as const;

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const meta = ACTIVITY_ICON_CLASSES[entry.kind];
  const Icon = meta.icon;

  let title = "";
  let description = "";
  let badgeClass = "";
  let badgeLabel = "";

  if (entry.kind === "payment") {
    const p = entry.item;
    title = p.category === "rent" ? "Rent received" : "Payment recorded";
    description = [p.tenantName, p.propertyName, p.unitName]
      .filter(Boolean)
      .join(" · ");
    if (!description) description = `${formatCurrencyCompact(p.amount, p.currency)} · ${p.state}`;
    const stateMap: Record<string, { label: string; cls: string }> = {
      confirmed:  { label: "Confirmed",  cls: "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800" },
      completed:  { label: "Completed",  cls: "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800" },
      pending:    { label: "Pending",    cls: "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800" },
      processing: { label: "Processing", cls: "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800" },
      failed:     { label: "Failed",     cls: "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800" },
      refunded:   { label: "Refunded",   cls: "bg-slate-50 text-slate-700 border border-slate-200 dark:bg-slate-800/40 dark:text-slate-300 dark:border-slate-700" },
    };
    const s = stateMap[p.state] ?? { label: p.state, cls: "bg-slate-50 text-slate-700 border border-slate-200 dark:bg-slate-800/40 dark:text-slate-300 dark:border-slate-700" };
    badgeClass = s.cls;
    badgeLabel = s.label;
  } else {
    const m = entry.item;
    title = m.title;
    description = [m.propertyName, m.unitName].filter(Boolean).join(" · ");
    const priorityMap: Record<string, { label: string; cls: string }> = {
      urgent: { label: "Urgent", cls: "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800" },
      high:   { label: "High",   cls: "bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800" },
      medium: { label: "Medium", cls: "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800" },
      low:    { label: "Low",    cls: "bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800" },
    };
    const p = priorityMap[m.priority] ?? { label: m.priority, cls: "bg-slate-50 text-slate-700 border border-slate-200 dark:bg-slate-800/40 dark:text-slate-300 dark:border-slate-700" };
    badgeClass = p.cls;
    badgeLabel = p.label;
  }

  return (
    <div className="flex items-start gap-3 py-3 border-b border-border/60 last:border-0">
      <div
        className={cn(
          "h-7 w-7 rounded-[7px] flex items-center justify-center shrink-0 mt-0.5",
          meta.bg,
          meta.text,
        )}
        aria-hidden="true"
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-foreground leading-snug">{title}</p>
        {description && (
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{description}</p>
        )}
        <p className="text-[11px] text-muted-foreground mt-0.5">
          <time suppressHydrationWarning>{formatRelative(entry.timestamp)}</time>
        </p>
      </div>
      <span className={cn("text-[11px] font-semibold rounded-[4px] px-2 py-0.5 shrink-0", badgeClass)}>
        {badgeLabel}
      </span>
    </div>
  );
}

function ActivityRowSkeleton() {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border/60 last:border-0">
      <Skeleton className="h-7 w-7 rounded-[7px] shrink-0 mt-0.5" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="h-5 w-14 rounded-[4px]" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   QUICK ACTION
   ───────────────────────────────────────────────────────────────────────── */

function QuickAction({
  icon, label, href, iconClass, bgClass,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
  iconClass: string;
  bgClass: string;
}) {
  return (
    <Link
      href={href as any}
      className={cn(
        "flex items-center gap-3 p-3 rounded-[10px] border border-border bg-[hsl(var(--card))]",
        "hover:border-border/80 hover:shadow-[0_2px_8px_rgba(15,23,42,0.07)]",
        "dark:hover:shadow-[0_2px_8px_rgba(0,0,0,0.3)]",
        "transition-all duration-150 group",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
      )}
    >
      <div
        className={cn("h-8 w-8 rounded-[7px] flex items-center justify-center shrink-0", bgClass, iconClass)}
        aria-hidden="true"
      >
        {icon}
      </div>
      <span className="text-[13px] font-medium text-foreground group-hover:text-primary transition-colors">
        {label}
      </span>
      <ArrowUpRight
        className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-primary ml-auto transition-colors"
        aria-hidden="true"
      />
    </Link>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   ERROR BANNER
   ───────────────────────────────────────────────────────────────────────── */

function ErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-[10px] bg-red-50 dark:bg-red-100/10 border border-red-200 dark:border-red-900/50 text-sm text-red-700 dark:text-red-400">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">Failed to load dashboard data.</span>
      <button
        onClick={onRetry}
        className="flex items-center gap-1 font-semibold underline underline-offset-2 hover:text-red-900 dark:hover:text-red-300"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Retry
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   BUILD KPI CONFIG FROM REAL STATS
   ───────────────────────────────────────────────────────────────────────── */

function buildKpis(stats: DashboardStats): KpiCardProps[] {
  const occupancyGood = stats.occupancyRate >= 80;
  const collectionGood = stats.collectionRate >= 90;
  const hasOverdue = stats.overduePayments > 0;

  return [
    {
      label: "Total Properties",
      value: String(stats.totalProperties),
      sub: `${stats.totalUnits} total units`,
      positive: true,
      iconBg: "#EEF4FF",
      iconColor: "#0062FF",
      icon: <Building2 className="h-5 w-5" />,
      href: "/properties",
    },
    {
      label: "Occupancy Rate",
      value: `${stats.occupancyRate.toFixed(1)}%`,
      sub: `${stats.occupiedUnits} / ${stats.totalUnits} occupied`,
      positive: occupancyGood,
      iconBg: "#ECFDF5",
      iconColor: "#059669",
      icon: <Users className="h-5 w-5" />,
      href: "/tenants",
    },
    {
      label: "Monthly Revenue",
      value: formatCurrencyCompact(stats.monthlyRevenue),
      sub: `${stats.collectionRate.toFixed(0)}% collection rate`,
      positive: collectionGood,
      iconBg: "#EEF4FF",
      iconColor: "#0062FF",
      icon: <DollarSign className="h-5 w-5" />,
      href: "/payments",
    },
    {
      label: "Overdue Rent",
      value: formatCurrencyCompact(stats.overdueAmount),
      sub: `${stats.overduePayments} overdue ${stats.overduePayments === 1 ? "payment" : "payments"}`,
      positive: !hasOverdue,
      iconBg: "#FFFBEB",
      iconColor: "#D97706",
      icon: <FileText className="h-5 w-5" />,
      href: "/payments",
    },
  ];
}

/* ─────────────────────────────────────────────────────────────────────────
   DASHBOARD PAGE
   ───────────────────────────────────────────────────────────────────────── */

export function Dashboard() {
  /* ── Data fetching ─────────────────────────────────────────────────────── */
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    refetch: refetchStats,
  } = useDashboardStats();

  const {
    data: propertiesData,
    isLoading: propertiesLoading,
    isError: propertiesError,
    refetch: refetchProperties,
  } = useProperties({ pageSize: 5, sort: { field: "monthlyRevenue", direction: "desc" } });

  const {
    data: paymentsData,
    isLoading: paymentsLoading,
  } = usePayments({
    pageSize: 5,
    sort: { field: "createdAt", direction: "desc" },
  });

  const {
    data: maintenanceData,
    isLoading: maintenanceLoading,
  } = useMaintenanceIssues();

  const properties = propertiesData?.data ?? [];

  /* ── Build activity feed from payments + maintenance ───────────────────── */
  const activityEntries: ActivityEntry[] = [
    ...(paymentsData?.data ?? []).map((p): ActivityEntry => ({
      kind: "payment",
      item: p,
      timestamp: p.createdAt,
    })),
    ...(maintenanceData?.data ?? []).map((m): ActivityEntry => ({
      kind: "maintenance",
      item: m,
      timestamp: m.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 6);

  const activityLoading = paymentsLoading || maintenanceLoading;
  const kpis = stats ? buildKpis(stats) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description="Welcome back — here's what's happening across your portfolio."
        actions={
          <Button asChild size="default">
            <Link href="/properties/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Property
            </Link>
          </Button>
        }
      />

      {/* Error banners */}
      {statsError && <ErrorBanner onRetry={refetchStats} />}
      {propertiesError && (
        <div className="text-xs text-muted-foreground px-1">
          Could not load properties. <button onClick={() => refetchProperties()} className="underline">Retry</button>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statsLoading || !kpis
          ? Array.from({ length: 4 }).map((_, i) => (
              <KpiCard
                key={i}
                label=""
                value=""
                sub=""
                positive={true}
                iconBg="#EEF4FF"
                iconColor="#0062FF"
                icon={<Building2 className="h-5 w-5" />}
                loading
              />
            ))
          : kpis.map((k) => <KpiCard key={k.label} {...k} />)}
      </div>

      {/* Middle row: Properties + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Properties — 3 cols */}
        <section
          aria-labelledby="dash-properties-heading"
          className="lg:col-span-3 bg-[hsl(var(--card))] rounded-[12px] border border-border shadow-[0_1px_4px_rgba(15,23,42,0.06)] dark:shadow-none"
        >
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <div>
              <h2 id="dash-properties-heading" className="text-[13.5px] font-semibold text-foreground tracking-[-0.01em]">
                Properties
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">Live occupancy snapshot</p>
            </div>
            <Link
              href="/properties"
              className="flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
            >
              View all <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
          <div role="list" aria-label="Property list">
            {propertiesLoading
              ? Array.from({ length: 4 }).map((_, i) => <PropertyRowSkeleton key={i} />)
              : properties.length === 0
                ? (
                  <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                    No properties yet.{" "}
                    <Link href="/properties/new" className="text-primary hover:underline font-medium">
                      Add one
                    </Link>
                  </div>
                )
                : properties.map((p) => <PropertyRow key={p.id} p={p} />)}
          </div>
        </section>

        {/* Activity feed — 2 cols */}
        <section
          aria-labelledby="dash-activity-heading"
          className="lg:col-span-2 bg-[hsl(var(--card))] rounded-[12px] border border-border shadow-[0_1px_4px_rgba(15,23,42,0.06)] dark:shadow-none"
        >
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <div>
              <h2 id="dash-activity-heading" className="text-[13.5px] font-semibold text-foreground tracking-[-0.01em]">
                Activity
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">Recent payments & maintenance</p>
            </div>
          </div>
          <div className="px-5 py-1" aria-live="polite" aria-label="Recent activity">
            {activityLoading
              ? Array.from({ length: 5 }).map((_, i) => <ActivityRowSkeleton key={i} />)
              : activityEntries.length === 0
                ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No recent activity.
                  </div>
                )
                : activityEntries.map((entry) => (
                    <ActivityRow key={`${entry.kind}-${entry.item.id}`} entry={entry} />
                  ))}
          </div>
        </section>
      </div>

      {/* Revenue chart */}
      <RevenueChart />

      {/* Quick actions */}
      <section
        aria-labelledby="dash-quickactions-heading"
        className="bg-[hsl(var(--card))] rounded-[12px] border border-border shadow-[0_1px_4px_rgba(15,23,42,0.06)] dark:shadow-none"
      >
        <div className="px-5 py-3.5 border-b border-border">
          <h2 id="dash-quickactions-heading" className="text-[13.5px] font-semibold text-foreground tracking-[-0.01em]">
            Quick Actions
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4">
          <QuickAction
            href="/properties/new"
            icon={<Building2 className="h-4 w-4" />}
            label="Add Property"
            iconClass="text-blue-700 dark:text-blue-300"
            bgClass="bg-blue-50 dark:bg-blue-100/40"
          />
          <QuickAction
            href="/tenants"
            icon={<Users className="h-4 w-4" />}
            label="Add Tenant"
            iconClass="text-emerald-700 dark:text-emerald-300"
            bgClass="bg-emerald-50 dark:bg-emerald-100/40"
          />
          <QuickAction
            href="/leases/new"
            icon={<FileText className="h-4 w-4" />}
            label="Create Lease"
            iconClass="text-violet-700 dark:text-violet-300"
            bgClass="bg-violet-50 dark:bg-violet-100/40"
          />
          <QuickAction
            href="/maintenance"
            icon={<Wrench className="h-4 w-4" />}
            label="Maintenance"
            iconClass="text-amber-700 dark:text-amber-300"
            bgClass="bg-amber-50 dark:bg-amber-100/40"
          />
        </div>
      </section>

      {/* Stats summary footer */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Active Tenants",       value: String(stats.activeTenants),       href: "/tenants" },
            { label: "Pending Onboarding",   value: String(stats.pendingOnboarding),   href: "/tenants" },
            { label: "Open Maintenance",     value: String(stats.openMaintenanceIssues), href: "/maintenance" },
            { label: "Scheduled Inspections",value: String(stats.scheduledInspections), href: "/inspections" },
          ].map(({ label, value, href }) => (
            <Link
              key={label}
              href={href as any}
              className="bg-[hsl(var(--card))] rounded-[10px] border border-border px-4 py-3 hover:border-primary/40 hover:shadow-sm transition-all group"
            >
              <p className="text-[22px] font-bold text-foreground tracking-[-0.02em] group-hover:text-primary transition-colors">
                {value}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 uppercase tracking-[0.04em] font-medium">
                {label}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
