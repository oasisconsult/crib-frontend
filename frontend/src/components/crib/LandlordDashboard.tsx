"use client";

import Link from "next/link";
import {
  Building2,
  CreditCard,
  Wrench,
  FileText,
  MapPin,
  TrendingUp,
  AlertTriangle,
  Eye,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ReadOnlyBanner } from "@/components/common/ReadOnlyBanner";
import { useProperties } from "@/hooks/useProperties";
import { usePayments } from "@/hooks/usePayments";
import { usePermissions } from "@/hooks/usePermissions";
import { useAppStore } from "@/store/useAppStore";
import { formatCurrencyCompact, formatRelative } from "@/utils/formatters";
import type { Property } from "@/types";

function PropertyCard({ p }: { p: Property }) {
  const pct = Math.round(
    p.occupancyRate ?? (p.totalUnits > 0 ? (p.occupiedUnits / p.totalUnits) * 100 : 0),
  );
  const barClass =
    pct >= 85 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-400";
  const pctClass =
    pct >= 85
      ? "text-emerald-700 dark:text-emerald-400"
      : pct >= 60
        ? "text-amber-700 dark:text-amber-400"
        : "text-red-700 dark:text-red-400";

  return (
    <Link
      href={`/properties/${p.id}` as any}
      className="flex items-center gap-3 py-3 px-4 border-b border-border/60 last:border-0 hover:bg-primary/5 transition-colors group"
    >
      <div className="h-8 w-8 rounded-[7px] bg-accent flex items-center justify-center shrink-0">
        <Building2 className="h-3.5 w-3.5 text-accent-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-foreground truncate group-hover:text-primary transition-colors">
          {p.name}
        </p>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
          <MapPin className="h-2.5 w-2.5 shrink-0" />
          {p.address?.city ?? "—"}
        </p>
      </div>
      <div className="hidden sm:flex flex-col gap-1 w-24 shrink-0">
        <div className="flex justify-between text-[10px] font-medium">
          <span className={pctClass}>{pct}%</span>
          <span className="text-muted-foreground">
            {p.occupiedUnits}/{p.totalUnits}
          </span>
        </div>
        <div
          className="h-1.5 bg-primary/10 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className={cn("h-full rounded-full", barClass)} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[13px] font-semibold text-foreground">
          {formatCurrencyCompact(p.monthlyRevenue ?? 0, p.currency ?? "UGX")}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">/ month</p>
      </div>
    </Link>
  );
}

export function LandlordDashboard() {
  const user = useAppStore((s) => s.user);
  const { isReadOnly } = usePermissions();

  const { data: propertiesData, isLoading: loadingProps } = useProperties();
  const { data: paymentsData, isLoading: loadingPayments } = usePayments({ limit: 5 });

  const properties = propertiesData?.data ?? [];
  const payments = paymentsData?.data ?? [];

  const totalRevenue = properties.reduce((sum, p) => sum + (p.monthlyRevenue ?? 0), 0);
  const totalUnits = properties.reduce((sum, p) => sum + (p.totalUnits ?? 0), 0);
  const occupiedUnits = properties.reduce((sum, p) => sum + (p.occupiedUnits ?? 0), 0);
  const occupancyPct = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

  const currency = properties[0]?.currency ?? "UGX";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {user?.name?.split(" ")[0] ?? "Landlord"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isReadOnly
            ? "Your properties are managed by an agency — here's your overview"
            : "Here's your property overview"}
        </p>
      </div>

      <ReadOnlyBanner />

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: "Properties",
            value: loadingProps ? "—" : String(properties.length),
            icon: <Building2 className="h-5 w-5" />,
            iconClass: "bg-primary/15 text-primary",
            href: "/properties",
          },
          {
            label: "Monthly Revenue",
            value: loadingProps ? "—" : formatCurrencyCompact(totalRevenue, currency),
            icon: <CreditCard className="h-5 w-5" />,
            iconClass: "bg-primary/15 text-primary",
            href: "/payments",
          },
          {
            label: "Occupancy",
            value: loadingProps ? "—" : `${occupancyPct}%`,
            icon: <TrendingUp className="h-5 w-5" />,
            iconClass:
              "bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400",
            href: "/analytics",
          },
          {
            label: "Units",
            value: loadingProps ? "—" : `${occupiedUnits}/${totalUnits}`,
            icon: <Eye className="h-5 w-5" />,
            iconClass: "bg-muted text-muted-foreground",
          },
        ].map((kpi) => {
          const card = (
            <Card key={kpi.label} className="cursor-default">
              <CardContent className="pt-5 pb-4">
                <div
                  className={cn(
                    "h-9 w-9 rounded-[8px] flex items-center justify-center mb-3",
                    kpi.iconClass,
                  )}
                >
                  {kpi.icon}
                </div>
                {loadingProps ? (
                  <Skeleton className="h-7 w-20 mb-1" />
                ) : (
                  <p className="text-2xl font-bold tracking-tight">{kpi.value}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wide font-medium">
                  {kpi.label}
                </p>
              </CardContent>
            </Card>
          );
          return kpi.href ? (
            <Link key={kpi.label} href={kpi.href as any} className="block">
              {card}
            </Link>
          ) : (
            <div key={kpi.label}>{card}</div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Properties list */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Your Properties</CardTitle>
            <Link
              href="/properties"
              className="text-xs text-primary hover:underline font-medium"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {loadingProps ? (
              <div className="divide-y">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 py-3 px-4">
                    <Skeleton className="h-8 w-8 rounded-[7px]" />
                    <div className="flex-1">
                      <Skeleton className="h-3.5 w-40 mb-1.5" />
                      <Skeleton className="h-2.5 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            ) : properties.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No properties yet
              </p>
            ) : (
              <div>
                {properties.slice(0, 6).map((p) => (
                  <PropertyCard key={p.id} p={p} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent payments */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Payments</CardTitle>
            <Link
              href="/payments"
              className="text-xs text-primary hover:underline font-medium"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {loadingPayments ? (
              <div className="divide-y">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between py-3 px-4">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3.5 w-20" />
                  </div>
                ))}
              </div>
            ) : payments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No payments yet
              </p>
            ) : (
              <div className="divide-y">
                {payments.map((payment) => (
                  <Link
                    key={payment.id}
                    href={`/payments/${payment.id}` as any}
                    className="flex items-center justify-between py-3 px-4 hover:bg-primary/5 transition-colors group"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium truncate group-hover:text-primary transition-colors">
                        {payment.description ?? "Rent payment"}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {formatRelative(payment.paidAt ?? payment.dueDate)}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p className="text-[13px] font-semibold text-foreground">
                        {formatCurrencyCompact(payment.amount ?? 0, payment.currency ?? currency)}
                      </p>
                      <span
                        className={cn(
                          "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                          payment.status === "paid"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                            : payment.status === "overdue"
                              ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {payment.status}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: "/leases",      label: "Leases",      icon: FileText,  desc: "View active leases"          },
          { href: "/payments",    label: "Payments",    icon: CreditCard,desc: "Rent & payment history"       },
          { href: "/maintenance", label: "Maintenance", icon: Wrench,    desc: "Track repair requests"        },
          { href: "/analytics",  label: "Analytics",   icon: TrendingUp, desc: "Revenue & occupancy trends"  },
        ].map(({ href, label, icon: Icon, desc }) => (
          <Link key={href} href={href as any}>
            <Card className="h-full hover:shadow-md transition-shadow cursor-pointer group">
              <CardContent className="pt-4 pb-3">
                <Icon className="h-5 w-5 text-primary mb-2 group-hover:scale-110 transition-transform" />
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
