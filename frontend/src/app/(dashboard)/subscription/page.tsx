"use client";

import Link from "next/link";
import {
  BadgeCheck, CreditCard, TrendingUp, AlertTriangle,
  Clock, Zap, Building2, Users, HardDrive, ArrowRight,
  CheckCircle2, XCircle, Loader2, Settings,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/PageHeader";
import { useCurrentSubscription, useSubscriptionUsage } from "@/hooks/useSubscription";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/utils/cn";
import type { SubscriptionStatus } from "@/services/api/subscriptions";

// ── Status helpers ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<SubscriptionStatus, { label: string; variant: "success" | "warning" | "destructive" | "outline" | "secondary"; icon: React.ElementType }> = {
  active:               { label: "Active",               variant: "success",     icon: CheckCircle2 },
  trialing:             { label: "Trial",                 variant: "secondary",   icon: Clock },
  pending_payment:      { label: "Payment Required",      variant: "warning",     icon: CreditCard },
  pending_verification: { label: "Verifying Payment",     variant: "warning",     icon: Clock },
  grace_period:         { label: "Grace Period",          variant: "warning",     icon: AlertTriangle },
  past_due:             { label: "Past Due",              variant: "destructive", icon: AlertTriangle },
  suspended:            { label: "Suspended",             variant: "destructive", icon: XCircle },
  cancelled:            { label: "Cancelled",             variant: "outline",     icon: XCircle },
  expired:              { label: "Expired",               variant: "destructive", icon: XCircle },
};

function formatCurrency(amount: number, currency: string): string {
  if (currency === "UGX") return `UGX ${amount.toLocaleString()}`;
  return `$${(amount / 100).toFixed(2)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-UG", { day: "numeric", month: "long", year: "numeric" });
}

// ── Usage bar ──────────────────────────────────────────────────────────────

function UsageBar({ used, limit, percent, label, icon: Icon }: {
  used: number; limit: number; percent: number; label: string;
  icon: React.ElementType;
}) {
  const unlimited = limit === -1;
  const danger = !unlimited && percent >= 90;
  const warning = !unlimited && percent >= 70;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </span>
        <span className={cn("font-medium text-xs", danger && "text-destructive", warning && !danger && "text-warning")}>
          {unlimited ? `${used} / ∞` : `${used} / ${limit}`}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        {!unlimited && (
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              danger ? "bg-destructive" : warning ? "bg-warning" : "bg-primary",
            )}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        )}
        {unlimited && <div className="h-full w-full bg-primary/20 rounded-full" />}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function SubscriptionPage() {
  const { data: sub, isLoading: loadingSub } = useCurrentSubscription();
  const { data: usage, isLoading: loadingUsage } = useSubscriptionUsage();
  const { isSuperAdmin } = usePermissions();

  if (loadingSub) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!sub) return null;

  const statusCfg = STATUS_CONFIG[sub.status] ?? STATUS_CONFIG.active;
  const StatusIcon = statusCfg.icon;
  const isFreePlan = sub.plan.slug === "free";
  const needsPayment = ["pending_payment", "pending_verification", "grace_period", "expired"].includes(sub.status);

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Subscription"
        description="Manage your plan, billing, and feature access."
        actions={
          <div className="flex gap-2">
            {/* Superadmin: direct link to configure plans + payment settings */}
            {isSuperAdmin && (
              <Button asChild variant="outline" size="sm">
                <Link href="/subscription/settings">
                  <Settings className="h-3.5 w-3.5" />
                  Billing Settings
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/subscription/billing">Billing History</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/subscription/plans">
                {isFreePlan ? "Upgrade" : "Change Plan"}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        }
      />

      {/* ── Status banner ── */}
      {needsPayment && (
        <div className={cn(
          "rounded-[var(--radius-lg)] border px-4 py-3 flex items-center justify-between gap-4",
          sub.status === "grace_period" && "bg-warning/10 border-warning/30",
          sub.status === "expired" && "bg-destructive/10 border-destructive/30",
          (sub.status === "pending_payment" || sub.status === "pending_verification") && "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700",
        )}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
            <span className="text-sm font-medium">
              {sub.status === "pending_verification" && "Your payment is being verified. We'll notify you within 24 hours."}
              {sub.status === "pending_payment" && "Action required — submit payment to activate your plan."}
              {sub.status === "grace_period" && `Grace period active until ${formatDate(sub.gracePeriodUntil)}. Submit payment to restore full access.`}
              {sub.status === "expired" && "Your subscription has expired. Upgrade to restore access to premium features."}
            </span>
          </div>
          {sub.status !== "pending_verification" && (
            <Button asChild size="sm" variant="outline">
              <Link href="/subscription/pay">Submit Payment</Link>
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* ── Current plan card ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-primary" />
              Current Plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-2xl font-bold text-foreground">{sub.plan.name}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{sub.plan.description}</p>
              </div>
              <Badge variant={statusCfg.variant as any} className="flex items-center gap-1">
                <StatusIcon className="h-3 w-3" />
                {statusCfg.label}
              </Badge>
            </div>

            <div className="space-y-2 text-sm">
              {!isFreePlan && sub.billingCycle !== "none" && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Billing Cycle</span>
                  <span className="font-medium capitalize">{sub.billingCycle}</span>
                </div>
              )}
              {sub.pricePaid && sub.priceCurrency && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Price</span>
                  <span className="font-medium">{formatCurrency(sub.pricePaid, sub.priceCurrency)}</span>
                </div>
              )}
              {sub.currentPeriodEnd && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Renews</span>
                  <span className="font-medium">{formatDate(sub.currentPeriodEnd)}</span>
                </div>
              )}
              {sub.trialEndsAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Trial Ends</span>
                  <span className="font-medium text-primary">{formatDate(sub.trialEndsAt)}</span>
                </div>
              )}
            </div>

            {isFreePlan && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-2">Unlock more with a paid plan</p>
                <Button asChild size="sm" className="w-full">
                  <Link href="/subscription/plans">
                    <Zap className="h-3.5 w-3.5" />
                    View Plans
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Usage card ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Usage
            </CardTitle>
            <CardDescription>Your current resource usage vs plan limits.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingUsage ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-8 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : usage ? (
              <>
                <UsageBar
                  used={usage.propertiesUsed}
                  limit={usage.propertiesLimit}
                  percent={usage.propertiesPercent}
                  label="Properties"
                  icon={Building2}
                />
                <UsageBar
                  used={usage.unitsUsed}
                  limit={usage.unitsLimit}
                  percent={usage.unitsPercent}
                  label="Units"
                  icon={Building2}
                />
                <UsageBar
                  used={usage.usersUsed}
                  limit={usage.usersLimit}
                  percent={usage.usersPercent}
                  label="Team Members"
                  icon={Users}
                />
                <UsageBar
                  used={Math.round(usage.storageUsedMb)}
                  limit={usage.storageLimitMb}
                  percent={usage.storagePercent}
                  label="Storage (MB)"
                  icon={HardDrive}
                />
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* ── Quick links ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { href: "/subscription/plans", icon: Zap, label: "View Plans", desc: "Compare & upgrade" },
          { href: "/subscription/pay", icon: CreditCard, label: "Make Payment", desc: "Submit proof of payment" },
          { href: "/subscription/billing", icon: TrendingUp, label: "Billing History", desc: "Invoices & receipts" },
        ].map(item => (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-col gap-1 rounded-[var(--radius-lg)] border border-border bg-card p-4 hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200 group"
          >
            <item.icon className="h-5 w-5 text-primary mb-1" />
            <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{item.label}</span>
            <span className="text-xs text-muted-foreground">{item.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
