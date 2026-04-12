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
    <div className="bg-white rounded-[12px] border border-[#E2E8F0] p-5 flex flex-col gap-4 group
                    shadow-[0_1px_3px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)]
                    hover:shadow-[0_4px_12px_rgba(15,23,42,0.08)] transition-shadow duration-200">
      {/* Top row */}
      <div className="flex items-center justify-between">
        <div
          className="h-10 w-10 rounded-[8px] flex items-center justify-center shrink-0"
          style={{ background: iconBg }}
        >
          <span style={{ color: iconColor }}>{icon}</span>
        </div>
        <span
          className={cn(
            "flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-[4px]",
            positive
              ? "bg-[#ECFDF5] text-[#059669]"
              : "bg-[#FEF2F2] text-[#DC2626]",
          )}
        >
          <TrendIcon className="h-3 w-3" />
          {change}
        </span>
      </div>
      {/* Value + label */}
      <div>
        <p
          className="text-[28px] font-bold text-[#0F172A] leading-none tracking-[-0.03em]"
          style={{ fontFamily: "var(--font-poppins,'Poppins',sans-serif)" }}
        >
          {value}
        </p>
        <p className="text-xs font-medium text-[#64748B] mt-1.5 uppercase tracking-[0.05em]">
          {label}
        </p>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href} className="block">{inner}</Link>;
  }
  return inner;
}

/* ─────────────────────────────────────────────────────────────────────────
   ACTIVITY FEED ITEM
   ───────────────────────────────────────────────────────────────────────── */

type ActivityType = "payment" | "maintenance" | "tenant" | "alert";
type ActivityStatus = "completed" | "pending" | "overdue";

const ACTIVITY_META: Record<ActivityType, { bg: string; color: string; icon: React.ReactNode }> = {
  payment:     { bg: "#EEF4FF", color: "#0062FF", icon: <CreditCard className="h-3.5 w-3.5" /> },
  maintenance: { bg: "#FFFBEB", color: "#D97706", icon: <Wrench className="h-3.5 w-3.5" /> },
  tenant:      { bg: "#ECFDF5", color: "#059669", icon: <Users className="h-3.5 w-3.5" /> },
  alert:       { bg: "#FEF2F2", color: "#DC2626", icon: <FileText className="h-3.5 w-3.5" /> },
};

const STATUS_BADGE: Record<ActivityStatus, { label: string; className: string }> = {
  completed: { label: "Done",    className: "bg-[#ECFDF5] text-[#059669]" },
  pending:   { label: "Pending", className: "bg-[#FFFBEB] text-[#D97706]" },
  overdue:   { label: "Overdue", className: "bg-[#FEF2F2] text-[#DC2626]" },
};

interface Activity {
  id: string;
  type: ActivityType;
  description: string;
  time: string;
  status: ActivityStatus;
}

function ActivityRow({ item }: { item: Activity }) {
  const meta   = ACTIVITY_META[item.type];
  const status = STATUS_BADGE[item.status];

  return (
    <div className="flex items-start gap-3 py-3 border-b border-[#F1F5F9] last:border-0">
      <div
        className="h-7 w-7 rounded-[7px] flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: meta.bg, color: meta.color }}
      >
        {meta.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-[#0F172A] leading-snug">{item.description}</p>
        <p className="text-[11px] text-[#94A3B8] mt-0.5">{item.time}</p>
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
  const barColor = pct >= 85 ? "#059669" : pct >= 60 ? "#D97706" : "#DC2626";

  return (
    <div className="flex items-center gap-3 py-3 px-5 border-b border-[#F1F5F9] last:border-0
                    hover:bg-[#F8FAFC] transition-colors cursor-pointer group">
      <div className="h-8 w-8 rounded-[7px] bg-[#EEF4FF] flex items-center justify-center shrink-0">
        <Building2 className="h-3.5 w-3.5 text-[#0062FF]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-[#0F172A] truncate group-hover:text-[#0062FF] transition-colors">
          {p.name}
        </p>
        <p className="text-[11px] text-[#94A3B8] flex items-center gap-1 mt-0.5">
          <MapPin className="h-2.5 w-2.5 shrink-0" />{p.location}
        </p>
      </div>
      {/* Occupancy bar */}
      <div className="hidden md:flex flex-col gap-1 w-24 shrink-0">
        <div className="flex justify-between text-[10px] font-medium">
          <span style={{ color: barColor }}>{pct}%</span>
          <span className="text-[#94A3B8]">{p.occupied}/{p.units}</span>
        </div>
        <div className="h-1.5 bg-[#F1F5F9] rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor }} />
        </div>
      </div>
      {/* Revenue */}
      <div className="hidden sm:block text-right shrink-0">
        <p className="text-[13px] font-semibold text-[#0F172A]">{p.revenue}</p>
        <p className="text-[10px] text-[#94A3B8] mt-0.5">/ month</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   QUICK ACTION
   ───────────────────────────────────────────────────────────────────────── */

function QuickAction({ icon, label, href, color, bg }: {
  icon: React.ReactNode; label: string; href: string; color: string; bg: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 p-3 rounded-[10px] border border-[#E2E8F0] bg-white
                 hover:border-[#CBD5E1] hover:shadow-[0_2px_8px_rgba(15,23,42,0.07)]
                 transition-all duration-150 group"
    >
      <div className="h-8 w-8 rounded-[7px] flex items-center justify-center shrink-0"
           style={{ background: bg, color }}>
        {icon}
      </div>
      <span className="text-[13px] font-medium text-[#0F172A] group-hover:text-[#0062FF] transition-colors">
        {label}
      </span>
      <ArrowUpRight className="h-3.5 w-3.5 text-[#CBD5E1] group-hover:text-[#0062FF] ml-auto transition-colors" />
    </Link>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   DASHBOARD PAGE
   ───────────────────────────────────────────────────────────────────────── */

export function Dashboard() {
  const kpis: KpiCardProps[] = [
    {
      label: "Total Properties",
      value: "24",
      change: "+2 this month",
      positive: true,
      iconBg: "#EEF4FF",
      iconColor: "#0062FF",
      icon: <Building2 className="h-5 w-5" />,
      href: "/properties",
    },
    {
      label: "Occupancy Rate",
      value: "87%",
      change: "+3% vs last month",
      positive: true,
      iconBg: "#ECFDF5",
      iconColor: "#059669",
      icon: <Users className="h-5 w-5" />,
      href: "/tenants",
    },
    {
      label: "Monthly Revenue",
      value: "124.5M",
      change: "+8.3% vs last month",
      positive: true,
      iconBg: "#EEF4FF",
      iconColor: "#0062FF",
      icon: <DollarSign className="h-5 w-5" />,
      href: "/payments",
    },
    {
      label: "Outstanding Rent",
      value: "8.45M",
      change: "-12% yesterday",
      positive: true,
      iconBg: "#FFFBEB",
      iconColor: "#D97706",
      icon: <FileText className="h-5 w-5" />,
      href: "/payments",
    },
  ];

  const activities: Activity[] = [
    { id: "1", type: "payment",     description: "John Doe paid rent — Sunset Apartments, Jan 2026", time: "2 hours ago",          status: "completed" },
    { id: "2", type: "maintenance", description: "Leaking tap reported — Building A, Unit 4B",        time: "4 hours ago",          status: "pending"   },
    { id: "3", type: "tenant",      description: "Sarah Kato onboarded — Oak Street Property",        time: "Yesterday, 3:14 PM",   status: "completed" },
    { id: "4", type: "alert",       description: "Riverside Complex — 3 units rent overdue",          time: "2 days ago",           status: "overdue"   },
    { id: "5", type: "payment",     description: "Deposit received — Nakasero Heights, Unit 2A",      time: "2 days ago",           status: "completed" },
  ];

  const properties: Property[] = [
    { id: "1", name: "Sunset Apartments",  location: "Kampala, UG",  units: 12, occupied: 11, revenue: "UGX 18.5M" },
    { id: "2", name: "Oak Street Property",location: "Entebbe, UG",  units: 8,  occupied: 7,  revenue: "UGX 12M"   },
    { id: "3", name: "Riverside Complex",  location: "Jinja, UG",    units: 24, occupied: 20, revenue: "UGX 35M"   },
    { id: "4", name: "Nakasero Heights",   location: "Kampala, UG",  units: 6,  occupied: 4,  revenue: "UGX 9.6M"  },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <PageHeader
        title="Dashboard"
        description="Welcome back — here's what's happening across your portfolio."
        actions={
          <Button asChild size="default">
            <Link href="/properties/new">
              <Plus className="h-4 w-4" />
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
        <div className="lg:col-span-3 bg-white rounded-[12px] border border-[#E2E8F0]
                        shadow-[0_1px_3px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F1F5F9]">
            <div>
              <h2 className="text-[13.5px] font-semibold text-[#0F172A] tracking-[-0.01em]">
                Properties
              </h2>
              <p className="text-[11px] text-[#94A3B8] mt-0.5">Live occupancy snapshot</p>
            </div>
            <Link
              href="/properties"
              className="flex items-center gap-1 text-[12px] font-semibold text-[#0062FF] hover:underline"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div>
            {properties.map((p) => <PropertyRow key={p.id} p={p} />)}
          </div>
        </div>

        {/* Activity — 2 cols */}
        <div className="lg:col-span-2 bg-white rounded-[12px] border border-[#E2E8F0]
                        shadow-[0_1px_3px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F1F5F9]">
            <div>
              <h2 className="text-[13.5px] font-semibold text-[#0F172A] tracking-[-0.01em]">
                Activity
              </h2>
              <p className="text-[11px] text-[#94A3B8] mt-0.5">Last 48 hours</p>
            </div>
          </div>
          <div className="px-5 py-1">
            {activities.map((a) => <ActivityRow key={a.id} item={a} />)}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="bg-white rounded-[12px] border border-[#E2E8F0]
                      shadow-[0_1px_3px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="px-5 py-3.5 border-b border-[#F1F5F9]">
          <h2 className="text-[13.5px] font-semibold text-[#0F172A] tracking-[-0.01em]">
            Quick Actions
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4">
          <QuickAction href="/properties/new"  icon={<Building2 className="h-4 w-4" />} label="Add Property"  color="#0062FF" bg="#EEF4FF" />
          <QuickAction href="/tenants"          icon={<Users className="h-4 w-4" />}     label="Add Tenant"    color="#059669" bg="#ECFDF5" />
          <QuickAction href="/leases/new"       icon={<FileText className="h-4 w-4" />}  label="Create Lease"  color="#7C3AED" bg="#F5F3FF" />
          <QuickAction href="/maintenance"      icon={<Wrench className="h-4 w-4" />}    label="Maintenance"   color="#D97706" bg="#FFFBEB" />
        </div>
      </div>
    </div>
  );
}
