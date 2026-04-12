"use client";

import Link from "next/link";
import {
  Building2,
  Users,
  DollarSign,
  FileText,
  TrendingUp,
  TrendingDown,
  Plus,
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Wrench,
  CreditCard,
  MapPin,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/utils/cn";

// ── KPI Card ────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  change: string;
  changePositive: boolean;
  icon: React.ReactNode;
  iconBg: string;
}

function KpiCard({ label, value, change, changePositive, icon, iconBg }: KpiCardProps) {
  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-3 border"
      style={{
        background: "#FFFFFF",
        borderColor: "rgba(0,0,0,0.06)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
      }}
    >
      <div className="flex items-start justify-between">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: iconBg }}
        >
          {icon}
        </div>
        <span
          className={cn(
            "flex items-center gap-0.5 text-xs font-semibold",
            changePositive ? "text-[#00A878]" : "text-[#E02020]",
          )}
        >
          {changePositive ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          {change}
        </span>
      </div>
      <div>
        <p
          className="text-2xl font-bold leading-tight"
          style={{
            fontFamily: "var(--font-poppins, 'Poppins', sans-serif)",
            color: "#171725",
          }}
        >
          {value}
        </p>
        <p className="text-xs font-medium mt-0.5 uppercase tracking-wide" style={{ color: "#696974" }}>
          {label}
        </p>
      </div>
    </div>
  );
}

// ── Activity item ────────────────────────────────────────────────────────────

const ACTIVITY_ICON_MAP: Record<string, { icon: React.ReactNode; bg: string; color: string }> = {
  payment:     { icon: <CreditCard className="h-4 w-4" />,  bg: "#EEF4FF", color: "#0062FF" },
  maintenance: { icon: <Wrench className="h-4 w-4" />,      bg: "#FFF8E7", color: "#E5A800" },
  tenant:      { icon: <Users className="h-4 w-4" />,       bg: "#E8FFF7", color: "#00A878" },
  alert:       { icon: <AlertTriangle className="h-4 w-4" />, bg: "#FFF0F0", color: "#E02020" },
};

interface Activity {
  id: string;
  type: keyof typeof ACTIVITY_ICON_MAP;
  description: string;
  time: string;
  status: "completed" | "pending" | "overdue";
}

function ActivityItem({ activity }: { activity: Activity }) {
  const meta = ACTIVITY_ICON_MAP[activity.type] ?? ACTIVITY_ICON_MAP.payment;

  const statusConfig = {
    completed: { label: "Completed", bg: "#E8FFF7", color: "#00A878" },
    pending:   { label: "Pending",   bg: "#FFF8E7", color: "#E5A800" },
    overdue:   { label: "Overdue",   bg: "#FFF0F0", color: "#E02020" },
  }[activity.status];

  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-b-0" style={{ borderColor: "rgba(0,0,0,0.05)" }}>
      <div
        className="h-8 w-8 shrink-0 rounded-[8px] flex items-center justify-center"
        style={{ background: meta.bg, color: meta.color }}
      >
        {meta.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#171725] leading-snug truncate">{activity.description}</p>
        <p className="text-xs text-[#696974] mt-0.5">{activity.time}</p>
      </div>
      <span
        className="shrink-0 text-xs font-semibold rounded-full px-2.5 py-0.5"
        style={{ background: statusConfig.bg, color: statusConfig.color }}
      >
        {statusConfig.label}
      </span>
    </div>
  );
}

// ── Property row ─────────────────────────────────────────────────────────────

interface Property {
  id: string;
  name: string;
  location: string;
  units: number;
  occupied: number;
  revenue: string;
}

function PropertyRow({ property }: { property: Property }) {
  const occupancyPct = Math.round((property.occupied / property.units) * 100);
  const occupancyColor = occupancyPct >= 85 ? "#00A878" : occupancyPct >= 60 ? "#E5A800" : "#E02020";

  return (
    <div
      className="flex items-center gap-4 py-3 border-b last:border-b-0 hover:bg-[#F1F1F5]/60 px-4 -mx-4 rounded-lg transition-colors cursor-pointer"
      style={{ borderColor: "rgba(0,0,0,0.05)" }}
    >
      {/* Icon */}
      <div className="h-9 w-9 shrink-0 rounded-[8px] flex items-center justify-center" style={{ background: "#EEF4FF" }}>
        <Building2 className="h-4 w-4 text-[#0062FF]" />
      </div>

      {/* Name & location */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#171725] truncate">{property.name}</p>
        <p className="text-xs text-[#696974] flex items-center gap-1 mt-0.5">
          <MapPin className="h-3 w-3 shrink-0" />
          {property.location}
        </p>
      </div>

      {/* Units */}
      <div className="hidden sm:block text-center w-16">
        <p className="text-sm font-semibold text-[#171725]">{property.units}</p>
        <p className="text-[10px] text-[#696974] uppercase tracking-wide">Units</p>
      </div>

      {/* Occupancy */}
      <div className="hidden md:block w-28">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold" style={{ color: occupancyColor }}>{occupancyPct}%</span>
          <span className="text-xs text-[#696974]">{property.occupied}/{property.units}</span>
        </div>
        <div className="h-1.5 rounded-full bg-[#F1F1F5] overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${occupancyPct}%`, background: occupancyColor }}
          />
        </div>
      </div>

      {/* Revenue */}
      <div className="hidden sm:block text-right w-24">
        <p className="text-sm font-semibold text-[#171725]">{property.revenue}</p>
        <p className="text-[10px] text-[#696974] uppercase tracking-wide">Revenue</p>
      </div>
    </div>
  );
}

// ── Quick action button ───────────────────────────────────────────────────────

function QuickAction({ icon, label, href, color, bg }: {
  icon: React.ReactNode;
  label: string;
  href: string;
  color: string;
  bg: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 p-4 rounded-xl border hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 group"
      style={{ background: "#FFFFFF", borderColor: "rgba(0,0,0,0.06)" }}
    >
      <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: bg, color }}>
        {icon}
      </div>
      <span className="text-xs font-semibold text-[#171725] text-center leading-tight">{label}</span>
    </Link>
  );
}

// ── Main Dashboard component ──────────────────────────────────────────────────

export function Dashboard() {
  const kpiCards: KpiCardProps[] = [
    {
      label: "Total Properties",
      value: "24",
      change: "+2 this month",
      changePositive: true,
      iconBg: "#EEF4FF",
      icon: <Building2 className="h-5 w-5 text-[#0062FF]" />,
    },
    {
      label: "Occupancy Rate",
      value: "87%",
      change: "+3% vs last month",
      changePositive: true,
      iconBg: "#E8FFF7",
      icon: <Users className="h-5 w-5 text-[#00A878]" />,
    },
    {
      label: "Monthly Revenue",
      value: "UGX 124.5M",
      change: "+8.3% vs last month",
      changePositive: true,
      iconBg: "#EEF4FF",
      icon: <DollarSign className="h-5 w-5 text-[#0062FF]" />,
    },
    {
      label: "Outstanding Rent",
      value: "UGX 8.45M",
      change: "-12% from yesterday",
      changePositive: true,
      iconBg: "#FFF8E7",
      icon: <FileText className="h-5 w-5 text-[#E5A800]" />,
    },
  ];

  const recentActivity: Activity[] = [
    {
      id: "1",
      type: "payment",
      description: "John Doe paid rent for Sunset Apartments — Jan 2026",
      time: "2 hours ago",
      status: "completed",
    },
    {
      id: "2",
      type: "maintenance",
      description: "Leaking tap reported in Building A, Unit 4B",
      time: "4 hours ago",
      status: "pending",
    },
    {
      id: "3",
      type: "tenant",
      description: "New tenant Sarah Kato onboarded — Oak Street",
      time: "Yesterday, 3:14 PM",
      status: "completed",
    },
    {
      id: "4",
      type: "alert",
      description: "Riverside Complex — Rent overdue for 3 units",
      time: "2 days ago",
      status: "overdue",
    },
  ];

  const properties: Property[] = [
    { id: "1", name: "Sunset Apartments", location: "Kampala, UG", units: 12, occupied: 11, revenue: "UGX 18.5M" },
    { id: "2", name: "Oak Street Property", location: "Entebbe, UG", units: 8, occupied: 7, revenue: "UGX 12M" },
    { id: "3", name: "Riverside Complex", location: "Jinja, UG", units: 24, occupied: 20, revenue: "UGX 35M" },
    { id: "4", name: "Nakasero Heights", location: "Kampala, UG", units: 6, occupied: 4, revenue: "UGX 9.6M" },
  ];

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-xl font-bold text-[#171725]"
            style={{ fontFamily: "var(--font-poppins, 'Poppins', sans-serif)" }}
          >
            Dashboard
          </h1>
          <p className="text-sm text-[#696974] mt-0.5">
            Welcome back! Here&apos;s what&apos;s happening today.
          </p>
        </div>
        <Link
          href="/properties/new"
          className="flex items-center gap-2 h-9 px-4 rounded-[8px] text-sm font-semibold text-white transition-all hover:shadow-md"
          style={{ background: "#0062FF" }}
        >
          <Plus className="h-4 w-4" />
          Add Property
        </Link>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <KpiCard key={card.label} {...card} />
        ))}
      </div>

      {/* ── Middle row: properties + activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Properties list — 3 cols */}
        <div
          className="lg:col-span-3 rounded-xl border"
          style={{ background: "#FFFFFF", borderColor: "rgba(0,0,0,0.06)", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
            <h2 className="text-sm font-bold text-[#171725]" style={{ fontFamily: "var(--font-poppins, 'Poppins', sans-serif)" }}>
              Properties Overview
            </h2>
            <Link
              href="/properties"
              className="flex items-center gap-1 text-xs font-semibold text-[#0062FF] hover:underline"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="px-5 py-2">
            {properties.map((p) => (
              <PropertyRow key={p.id} property={p} />
            ))}
          </div>
        </div>

        {/* Activity — 2 cols */}
        <div
          className="lg:col-span-2 rounded-xl border"
          style={{ background: "#FFFFFF", borderColor: "rgba(0,0,0,0.06)", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
            <h2 className="text-sm font-bold text-[#171725]" style={{ fontFamily: "var(--font-poppins, 'Poppins', sans-serif)" }}>
              Recent Activity
            </h2>
            <span className="flex items-center gap-1 text-xs font-semibold text-[#696974]">
              <Clock className="h-3 w-3" /> Today
            </span>
          </div>
          <div className="px-5 py-2">
            {recentActivity.map((a) => (
              <ActivityItem key={a.id} activity={a} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Quick actions ── */}
      <div
        className="rounded-xl border"
        style={{ background: "#FFFFFF", borderColor: "rgba(0,0,0,0.06)", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}
      >
        <div className="px-5 py-4 border-b" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
          <h2
            className="text-sm font-bold text-[#171725]"
            style={{ fontFamily: "var(--font-poppins, 'Poppins', sans-serif)" }}
          >
            Quick Actions
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5">
          <QuickAction href="/properties/new"  icon={<Building2 className="h-5 w-5" />} label="Add Property"    color="#0062FF" bg="#EEF4FF" />
          <QuickAction href="/tenants"          icon={<Users className="h-5 w-5" />}     label="Add Tenant"      color="#00A878" bg="#E8FFF7" />
          <QuickAction href="/leases/new"       icon={<FileText className="h-5 w-5" />}  label="New Lease"       color="#8B5CF6" bg="#F3EEFF" />
          <QuickAction href="/maintenance"      icon={<Wrench className="h-5 w-5" />}    label="Maintenance"     color="#E5A800" bg="#FFF8E7" />
        </div>
      </div>
    </div>
  );
}
