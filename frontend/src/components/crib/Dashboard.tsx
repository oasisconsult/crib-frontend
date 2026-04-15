"use client";

import Link from "next/link";
import {
  Building2, Users, DollarSign, FileText, TrendingUp, TrendingDown,
  Plus, ArrowRight, CreditCard, Wrench, MapPin, ArrowUpRight,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";

/* ─────────────────────────────────────────────────────────────────────────
   KPI CARD
   ───────────────────────────────────────────────────────────────────────── */

interface KpiCardProps {
  label: string;
  value: string;
  change: string;
  positive: boolean;
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  href?: string;
}

function KpiCard({ label, value, change, positive, icon, iconColor, iconBg, href }: KpiCardProps) {
  const TrendIcon = positive ? TrendingUp : TrendingDown;
  const inner = (
    <div
      className={cn(
        "bg-card rounded-[12px] border border-border p-5 flex flex-col gap-4",
        "shadow-[0_1px_3px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)]",
        "dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)]",
        "hover:shadow-[0_4px_12px_rgba(15,23,42,0.08)] dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.4)]",
        "transition-shadow duration-200",
        href && "group",
      )}
    >
      {/* Top row */}
      <div className="flex items-center justify-between">
        <div
          className="h-10 w-10 rounded-[8px] flex items-center justify-center shrink-0"
          style={{ background: iconBg }}
          aria-hidden="true"
        >
          <span style={{ color: iconColor }}>{icon}</span>
        </div>
        {/* WCAG 1.4.1 — trend uses both icon shape AND text label, not colour alone */}
        <span
          className={cn(
            "flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-[4px]",
            positive
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300"
              : "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300",
          )}
        >
          <TrendIcon className="h-3 w-3" aria-hidden="true" />
          {change}
        </span>
      </div>
      {/* Value + label */}
      <div>
        <p
          className="text-[28px] font-bold text-foreground leading-none tracking-[-0.03em]"
          style={{ fontFamily: "var(--font-poppins,'Poppins',sans-serif)" }}
        >
          {value}
        </p>
        <p className="text-xs font-medium text-muted-foreground mt-1.5 uppercase tracking-[0.05em]">
          {label}
        </p>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href as any} className="block" aria-label={`${label}: ${value}, ${change}`}>
        {inner}
      </Link>
    );
  }
  return inner;
}

/* ─────────────────────────────────────────────────────────────────────────
   ACTIVITY FEED
   ───────────────────────────────────────────────────────────────────────── */

type ActivityType = "payment" | "maintenance" | "tenant" | "alert";
type ActivityStatus = "completed" | "pending" | "overdue";

const ACTIVITY_ICON_CLASSES: Record<ActivityType, { bg: string; text: string; icon: React.ReactNode }> = {
  payment:     { bg: "bg-blue-50 dark:bg-blue-900/20",    text: "text-blue-700 dark:text-blue-300",    icon: <CreditCard className="h-3.5 w-3.5" /> },
  maintenance: { bg: "bg-amber-50 dark:bg-amber-900/20",  text: "text-amber-700 dark:text-amber-300",  icon: <Wrench className="h-3.5 w-3.5" /> },
  tenant:      { bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-700 dark:text-emerald-300", icon: <Users className="h-3.5 w-3.5" /> },
  alert:       { bg: "bg-red-50 dark:bg-red-900/20",      text: "text-red-700 dark:text-red-300",      icon: <FileText className="h-3.5 w-3.5" /> },
};

// WCAG 1.4.1 — status conveyed by text label + colour (not colour alone)
const STATUS_BADGE: Record<ActivityStatus, { label: string; className: string }> = {
  completed: { label: "Done",    className: "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300" },
  pending:   { label: "Pending", className: "bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300" },
  overdue:   { label: "Overdue", className: "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300" },
};

interface Activity {
  id: string;
  type: ActivityType;
  description: string;
  time: string;
  status: ActivityStatus;
}

function ActivityRow({ item }: { item: Activity }) {
  const meta   = ACTIVITY_ICON_CLASSES[item.type];
  const status = STATUS_BADGE[item.status];

  return (
    <div className="flex items-start gap-3 py-3 border-b border-border/60 last:border-0">
      <div
        className={cn("h-7 w-7 rounded-[7px] flex items-center justify-center shrink-0 mt-0.5", meta.bg, meta.text)}
        aria-hidden="true"
      >
        {meta.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-foreground leading-snug">{item.description}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          <time>{item.time}</time>
        </p>
      </div>
      <span className={cn("text-[11px] font-semibold rounded-[4px] px-2 py-0.5 shrink-0", status.className)}>
        {status.label}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   PROPERTY ROW
   ───────────────────────────────────────────────────────────────────────── */

interface Property { id: string; name: string; location: string; units: number; occupied: number; revenue: string; }

function PropertyRow({ p }: { p: Property }) {
  const pct = Math.round((p.occupied / p.units) * 100);
  const barClass = pct >= 85 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-400";
  const textClass = pct >= 85 ? "text-emerald-700 dark:text-emerald-400" : pct >= 60 ? "text-amber-700 dark:text-amber-400" : "text-red-700 dark:text-red-400";

  return (
    <div className="flex items-center gap-3 py-3 px-5 border-b border-border/60 last:border-0 hover:bg-muted/40 transition-colors cursor-pointer group">
      <div className="h-8 w-8 rounded-[7px] bg-accent flex items-center justify-center shrink-0" aria-hidden="true">
        <Building2 className="h-3.5 w-3.5 text-accent-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-foreground truncate group-hover:text-primary transition-colors">
          {p.name}
        </p>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
          <MapPin className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />{p.location}
        </p>
      </div>
      {/* Occupancy bar — percentage shown as text too (WCAG 1.4.1) */}
      <div className="hidden md:flex flex-col gap-1 w-24 shrink-0">
        <div className="flex justify-between text-[10px] font-medium">
          <span className={textClass}>{pct}%</span>
          <span className="text-muted-foreground">{p.occupied}/{p.units}</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% occupied`}>
          <div className={cn("h-full rounded-full", barClass)} style={{ width: `${pct}%` }} />
        </div>
      </div>
      {/* Revenue */}
      <div className="hidden sm:block text-right shrink-0">
        <p className="text-[13px] font-semibold text-foreground">{p.revenue}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">/ month</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   QUICK ACTION
   ───────────────────────────────────────────────────────────────────────── */

function QuickAction({ icon, label, href, iconClass, bgClass }: {
  icon: React.ReactNode; label: string; href: string; iconClass: string; bgClass: string;
}) {
  return (
    <Link
      href={href as any}
      className={cn(
        "flex items-center gap-3 p-3 rounded-[10px] border border-border bg-card",
        "hover:border-border/80 hover:shadow-[0_2px_8px_rgba(15,23,42,0.07)]",
        "dark:hover:shadow-[0_2px_8px_rgba(0,0,0,0.3)]",
        "transition-all duration-150 group",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
      )}
    >
      <div className={cn("h-8 w-8 rounded-[7px] flex items-center justify-center shrink-0", bgClass, iconClass)} aria-hidden="true">
        {icon}
      </div>
      <span className="text-[13px] font-medium text-foreground group-hover:text-primary transition-colors">
        {label}
      </span>
      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-primary ml-auto transition-colors" aria-hidden="true" />
    </Link>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   DASHBOARD PAGE
   ───────────────────────────────────────────────────────────────────────── */

export function Dashboard() {
  const kpis: KpiCardProps[] = [
    { label: "Total Properties", value: "24",     change: "+2 this month",      positive: true,  iconBg: "#EEF4FF", iconColor: "#0062FF", icon: <Building2 className="h-5 w-5" />, href: "/properties" },
    { label: "Occupancy Rate",   value: "87%",    change: "+3% vs last month",  positive: true,  iconBg: "#ECFDF5", iconColor: "#059669", icon: <Users className="h-5 w-5" />,    href: "/tenants" },
    { label: "Monthly Revenue",  value: "124.5M", change: "+8.3% vs last month",positive: true,  iconBg: "#EEF4FF", iconColor: "#0062FF", icon: <DollarSign className="h-5 w-5" />,href: "/payments" },
    { label: "Outstanding Rent", value: "8.45M",  change: "-12% yesterday",     positive: true,  iconBg: "#FFFBEB", iconColor: "#D97706", icon: <FileText className="h-5 w-5" />,  href: "/payments" },
  ];

  const activities: Activity[] = [
    { id: "1", type: "payment",     description: "John Doe paid rent — Sunset Apartments, Jan 2026", time: "2 hours ago",        status: "completed" },
    { id: "2", type: "maintenance", description: "Leaking tap reported — Building A, Unit 4B",        time: "4 hours ago",        status: "pending"   },
    { id: "3", type: "tenant",      description: "Sarah Kato onboarded — Oak Street Property",        time: "Yesterday, 3:14 PM", status: "completed" },
    { id: "4", type: "alert",       description: "Riverside Complex — 3 units rent overdue",          time: "2 days ago",         status: "overdue"   },
    { id: "5", type: "payment",     description: "Deposit received — Nakasero Heights, Unit 2A",      time: "2 days ago",         status: "completed" },
  ];

  const properties: Property[] = [
    { id: "1", name: "Sunset Apartments",   location: "Kampala, UG", units: 12, occupied: 11, revenue: "UGX 18.5M" },
    { id: "2", name: "Oak Street Property", location: "Entebbe, UG", units: 8,  occupied: 7,  revenue: "UGX 12M"   },
    { id: "3", name: "Riverside Complex",   location: "Jinja, UG",   units: 24, occupied: 20, revenue: "UGX 35M"   },
    { id: "4", name: "Nakasero Heights",    location: "Kampala, UG", units: 6,  occupied: 4,  revenue: "UGX 9.6M"  },
  ];

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

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
      </div>

      {/* Middle row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Properties — 3 cols */}
        <section
          aria-labelledby="dash-properties-heading"
          className="lg:col-span-3 bg-card rounded-[12px] border border-border shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
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
            {properties.map((p) => <PropertyRow key={p.id} p={p} />)}
          </div>
        </section>

        {/* Activity — 2 cols */}
        <section
          aria-labelledby="dash-activity-heading"
          className="lg:col-span-2 bg-card rounded-[12px] border border-border shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
        >
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <div>
              <h2 id="dash-activity-heading" className="text-[13.5px] font-semibold text-foreground tracking-[-0.01em]">
                Activity
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">Last 48 hours</p>
            </div>
          </div>
          {/* aria-live so screen readers announce new activity items */}
          <div className="px-5 py-1" aria-live="polite" aria-label="Recent activity">
            {activities.map((a) => <ActivityRow key={a.id} item={a} />)}
          </div>
        </section>
      </div>

      {/* Quick actions */}
      <section aria-labelledby="dash-quickactions-heading" className="bg-card rounded-[12px] border border-border shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)]">
        <div className="px-5 py-3.5 border-b border-border">
          <h2 id="dash-quickactions-heading" className="text-[13.5px] font-semibold text-foreground tracking-[-0.01em]">
            Quick Actions
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4">
          <QuickAction href="/properties/new" icon={<Building2 className="h-4 w-4" />} label="Add Property"  iconClass="text-blue-700 dark:text-blue-300"   bgClass="bg-blue-50 dark:bg-blue-900/20"    />
          <QuickAction href="/tenants"         icon={<Users className="h-4 w-4" />}    label="Add Tenant"    iconClass="text-emerald-700 dark:text-emerald-300" bgClass="bg-emerald-50 dark:bg-emerald-900/20" />
          <QuickAction href="/leases/new"      icon={<FileText className="h-4 w-4" />} label="Create Lease"  iconClass="text-violet-700 dark:text-violet-300"  bgClass="bg-violet-50 dark:bg-violet-900/20"  />
          <QuickAction href="/maintenance"     icon={<Wrench className="h-4 w-4" />}   label="Maintenance"   iconClass="text-amber-700 dark:text-amber-300"   bgClass="bg-amber-50 dark:bg-amber-900/20"   />
        </div>
      </section>
    </div>
  );
}
