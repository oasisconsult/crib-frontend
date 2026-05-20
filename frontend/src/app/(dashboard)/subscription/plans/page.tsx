"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check, X, Zap, Building2, Users, HardDrive,
  Loader2, ArrowLeft, ChevronDown, ChevronUp,
  BarChart3, Wrench, FileText, MessageSquare,
  UserCheck, Palette, Headphones, Phone,
  Key, Shield, ClipboardList,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/PageHeader";
import { usePlans, useCurrentSubscription, useSelectPlan } from "@/hooks/useSubscription";
import { toast } from "@/store/useUIStore";
import { cn } from "@/utils/cn";
import type { BillingCycle, BillingCurrency, SubscriptionPlan } from "@/services/api/subscriptions";

// ── Helpers ────────────────────────────────────────────────────────────────

function compactNum(n: number): string {
  if (n >= 1_000_000) return `${n % 1_000_000 === 0 ? n / 1_000_000 : (n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${n % 1_000 === 0 ? n / 1_000 : (n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function formatUGX(n: number) {
  return n === 0 ? "Free" : `UGX ${compactNum(n)}`;
}

function formatUSD(cents: number) {
  if (cents === 0) return "Free";
  const dollars = cents / 100;
  return `$${compactNum(dollars)}`;
}

function annualSavings(monthly: number, annual: number) {
  if (monthly === 0) return 0;
  return Math.round((1 - annual / (monthly * 12)) * 100);
}

function limitLabel(v: number, unit: string) {
  return v === -1 ? `Unlimited ${unit}` : `${v.toLocaleString()} ${unit}`;
}

function storageLabel(mb: number) {
  if (mb === -1) return "Unlimited storage";
  if (mb >= 1024) return `${mb / 1024} GB storage`;
  return `${mb} MB storage`;
}

// ── Feature definitions ────────────────────────────────────────────────────

const FEATURES = [
  { key: "analytics_basic",       label: "Basic Analytics",        icon: BarChart3 },
  { key: "analytics_advanced",    label: "Advanced Analytics",     icon: BarChart3 },
  { key: "maintenance_workflows", label: "Maintenance Workflows",  icon: Wrench },
  { key: "document_storage",      label: "Document Storage",       icon: FileText },
  { key: "tenant_messaging",      label: "Tenant Messaging",       icon: MessageSquare },
  { key: "team_members",          label: "Team Members",           icon: Users },
  { key: "custom_branding",       label: "Custom Branding",        icon: Palette },
  { key: "priority_support",      label: "Priority Support",       icon: Headphones },
  { key: "dedicated_support",     label: "Dedicated Support",      icon: Phone },
  { key: "api_access",            label: "API Access",             icon: Key },
  { key: "sso",                   label: "SSO / SAML",             icon: Shield },
  { key: "audit_logs",            label: "Audit Logs",             icon: ClipboardList },
];

// Key highlights to show per plan slug (condensed view)
const PLAN_HIGHLIGHTS: Record<string, string[]> = {
  free:         ["analytics_basic"],
  professional: ["analytics_advanced", "maintenance_workflows", "document_storage", "tenant_messaging"],
  agency:       ["analytics_advanced", "team_members", "custom_branding", "priority_support"],
  enterprise:   ["dedicated_support", "api_access", "sso", "audit_logs"],
};

// ── Plan Card ──────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  cycle,
  currency,
  isCurrent,
  isRecommended,
  onSelect,
  selecting,
}: {
  plan: SubscriptionPlan;
  cycle: BillingCycle;
  currency: BillingCurrency;
  isCurrent: boolean;
  isRecommended: boolean;
  onSelect: () => void;
  selecting: boolean;
}) {
  const monthlyUGX = plan.monthlyPriceUgx;
  const annualUGX  = plan.annualPriceUgx;
  const monthlyUSD = plan.monthlyPriceUsdCents;
  const annualUSD  = plan.annualPriceUsdCents;

  // Split currency label from number so "UGX" never sits on the same line as the amount
  const isFreePrice = plan.slug === "free";
  const rawAmount =
    currency === "UGX"
      ? (cycle === "annual" ? Math.round(annualUGX / 12) : monthlyUGX)
      : (cycle === "annual" ? Math.round(annualUSD / 12) : monthlyUSD);

  const priceCurrencyLabel = currency === "UGX" ? "UGX" : "USD";
  const priceSymbol        = currency === "USD" ? "$" : "";
  const priceAmount        = isFreePrice
    ? "Free"
    : `${priceSymbol}${currency === "USD" ? compactNum(rawAmount / 100) : compactNum(rawAmount)}`;

  const savings =
    currency === "UGX"
      ? annualSavings(monthlyUGX, annualUGX)
      : annualSavings(monthlyUSD, annualUSD);

  const isFree      = isFreePrice;
  const highlights  = PLAN_HIGHLIGHTS[plan.slug] ?? FEATURES.slice(0, 4).map(f => f.key);
  const limitItems   = [
    { icon: Building2, label: limitLabel(plan.maxProperties, "properties") },
    { icon: Building2, label: limitLabel(plan.maxUnits, "units") },
    { icon: Users,     label: limitLabel(plan.maxUsers, "users") },
    { icon: HardDrive, label: storageLabel(plan.maxStorageMb) },
  ];

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border bg-card transition-all duration-200",
        isRecommended
          ? "border-primary shadow-lg ring-1 ring-primary/20 scale-[1.02] z-10"
          : "border-border shadow-sm hover:shadow-md hover:-translate-y-0.5",
        isCurrent && !isRecommended && "ring-1 ring-primary/30",
      )}
    >
      {/* Popular badge */}
      {isRecommended && (
        <div className="absolute -top-3.5 inset-x-0 flex justify-center">
          <span className="inline-flex items-center gap-1 rounded-full bg-white dark:bg-card border border-primary/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary shadow-sm">
            <Zap className="h-3 w-3" />
            Most Popular
          </span>
        </div>
      )}

      {/* Header */}
      <div className={cn(
        "p-6 rounded-t-xl",
        isRecommended ? "bg-primary/5" : "",
      )}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              {plan.name}
            </p>
            {isCurrent && (
              <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                Current Plan
              </Badge>
            )}
          </div>
        </div>

        {/* Currency label sits above the number so "UGX 160k" never wraps mid-string */}
        {!isFree && (
          <p className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-0.5">
            {priceCurrencyLabel}
          </p>
        )}
        <div className="flex items-baseline gap-1.5 mb-1">
          <span className={cn(
            "font-bold tracking-tight leading-none",
            isFree ? "text-2xl" : "text-3xl",
          )}>
            {priceAmount}
          </span>
          {!isFree && (
            <span className="text-sm text-muted-foreground">/mo</span>
          )}
        </div>

        <div className="h-5 mt-1">
          {!isFree && cycle === "annual" && savings > 0 && (
            <p className="text-xs font-medium text-emerald-600">
              Save {savings}% with annual billing
            </p>
          )}
          {!isFree && cycle === "monthly" && (
            <p className="text-xs text-muted-foreground">Billed monthly</p>
          )}
          {isFree && (
            <p className="text-xs text-muted-foreground">No credit card required</p>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
          {plan.description}
        </p>
      </div>

      {/* CTA */}
      <div className="px-6 pb-5">
        <Button
          onClick={onSelect}
          disabled={isCurrent || selecting}
          className="w-full"
          variant={isRecommended ? "default" : isCurrent ? "outline" : "outline"}
        >
          {selecting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isCurrent ? "Current Plan" : isFree ? "Switch to Free" : "Get Started"}
        </Button>
      </div>

      {/* Divider */}
      <div className="mx-6 border-t border-border" />

      {/* Limits */}
      <div className="px-6 pt-5 pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Includes
        </p>
        <ul className="space-y-2">
          {limitItems.map((item, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-foreground">
              <item.icon className="h-3.5 w-3.5 text-primary shrink-0" />
              {item.label}
            </li>
          ))}
        </ul>
      </div>

      {/* Divider */}
      <div className="mx-6 border-t border-border" />

      {/* Feature highlights */}
      <div className="px-6 pt-4 pb-6 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Key Features
        </p>
        <ul className="space-y-2">
          {FEATURES.filter(f => highlights.includes(f.key)).map(f => {
            const enabled = plan.features[f.key];
            return (
              <li key={f.key} className="flex items-center gap-2 text-sm">
                <div className={cn(
                  "h-4 w-4 rounded-full flex items-center justify-center shrink-0",
                  enabled ? "bg-primary/10" : "bg-muted",
                )}>
                  {enabled
                    ? <Check className="h-2.5 w-2.5 text-primary" />
                    : <X className="h-2.5 w-2.5 text-muted-foreground/50" />}
                </div>
                <span className={enabled ? "text-foreground" : "text-muted-foreground/50"}>
                  {f.label}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ── Comparison Table ───────────────────────────────────────────────────────

type FeatureRow = { label: string; feature: string };
type LimitRow   = { label: string; render: (p: SubscriptionPlan) => string };
type AnyRow     = FeatureRow | LimitRow;

const COMPARISON_CATEGORIES: { label: string; rows: AnyRow[] }[] = [
  {
    label: "Usage Limits",
    rows: [
      { label: "Properties",   render: (p) => p.maxProperties === -1 ? "Unlimited" : String(p.maxProperties) },
      { label: "Units",        render: (p) => p.maxUnits === -1 ? "Unlimited" : String(p.maxUnits) },
      { label: "Team Members", render: (p) => p.maxUsers === -1 ? "Unlimited" : String(p.maxUsers) },
      { label: "Storage",      render: (p) => storageLabel(p.maxStorageMb).replace(" storage", "") },
    ] as LimitRow[],
  },
  {
    label: "Analytics",
    rows: [
      { label: "Basic Analytics",    feature: "analytics_basic" },
      { label: "Advanced Analytics", feature: "analytics_advanced" },
    ] as FeatureRow[],
  },
  {
    label: "Operations",
    rows: [
      { label: "Maintenance Workflows", feature: "maintenance_workflows" },
      { label: "Document Storage",      feature: "document_storage" },
      { label: "Tenant Messaging",      feature: "tenant_messaging" },
    ] as FeatureRow[],
  },
  {
    label: "Team & Customisation",
    rows: [
      { label: "Team Members",    feature: "team_members" },
      { label: "Custom Branding", feature: "custom_branding" },
    ] as FeatureRow[],
  },
  {
    label: "Support & Compliance",
    rows: [
      { label: "Priority Support",  feature: "priority_support" },
      { label: "Dedicated Support", feature: "dedicated_support" },
      { label: "API Access",        feature: "api_access" },
      { label: "SSO / SAML",        feature: "sso" },
      { label: "Audit Logs",        feature: "audit_logs" },
    ] as FeatureRow[],
  },
];

function ComparisonTable({
  plans,
  sub,
}: {
  plans: SubscriptionPlan[];
  sub: { plan: { id: string } } | undefined;
}) {
  return (
    <div className="overflow-hidden rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-sm)]">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" role="table">

          {/* ── Column headers ── */}
          <thead>
            <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] w-[38%]">
                Feature
              </th>
              {plans.map(plan => (
                <th
                  key={plan.id}
                  className={cn(
                    "px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]",
                    plan.slug === "professional" && "bg-[hsl(var(--accent))]",
                  )}
                >
                  <span className="block text-[hsl(var(--foreground))]">{plan.name}</span>
                  {sub?.plan.id === plan.id && (
                    <span className="mt-1 inline-block rounded-full border border-[hsl(var(--primary))]/40 px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--primary))]">
                      Current
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          {/* ── Body ── */}
          <tbody className="divide-y divide-[hsl(var(--border))]">
            {COMPARISON_CATEGORIES.map((cat) => (
              <>
                {/* Category group header */}
                <tr
                  key={cat.label}
                  className="bg-[hsl(var(--muted))]/50"
                >
                  <td
                    colSpan={plans.length + 1}
                    className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]"
                  >
                    {cat.label}
                  </td>
                </tr>

                {/* Category rows */}
                {cat.rows.map((row, ri) => (
                  <tr
                    key={ri}
                    className="transition-colors hover:bg-[hsl(var(--accent))]"
                  >
                    {/* Feature label */}
                    <td className="px-4 py-3.5 text-[hsl(var(--foreground))]">
                      {row.label}
                    </td>

                    {/* Plan cells */}
                    {plans.map((plan) => {
                      const isPopular = plan.slug === "professional";
                      const cellBase = cn(
                        "px-4 py-3.5 text-center",
                        isPopular && "bg-[hsl(var(--accent))]/60",
                      );

                      if ("feature" in row) {
                        const enabled = plan.features[(row as FeatureRow).feature];
                        return (
                          <td key={plan.id} className={cellBase}>
                            <span className="inline-flex items-center justify-center">
                              {enabled
                                ? <Check className="h-4 w-4 text-[hsl(var(--primary))]" />
                                : <X    className="h-4 w-4 text-[hsl(var(--muted-foreground))]/30" />}
                            </span>
                          </td>
                        );
                      }

                      return (
                        <td key={plan.id} className={cn(cellBase, "font-medium text-[hsl(var(--foreground))]")}>
                          {(row as LimitRow).render(plan)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function PlansPage() {
  const router = useRouter();
  const { data: plans = [], isLoading: loadingPlans } = usePlans();
  const { data: sub } = useCurrentSubscription();
  const { mutate: selectPlan, isPending: selecting } = useSelectPlan();

  const [cycle,       setCycle]       = useState<BillingCycle>("monthly");
  const [currency,    setCurrency]    = useState<BillingCurrency>("UGX");
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [showCompare, setShowCompare] = useState(false);

  function handleSelect(plan: SubscriptionPlan) {
    if (plan.slug === "free") {
      setSelectingId(plan.id);
      selectPlan(
        { planId: plan.id, billingCycle: "none", currency },
        {
          onSuccess: () => {
            toast.success("Plan changed", "You are now on the Free plan.");
            router.push("/subscription");
          },
          onError: (err: any) =>
            toast.error("Failed", err?.response?.data?.detail ?? "Please try again"),
          onSettled: () => setSelectingId(null),
        },
      );
    } else {
      router.push(`/subscription/pay?planId=${plan.id}&cycle=${cycle}&currency=${currency}`);
    }
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <PageHeader
        title="Plans & Pricing"
        description="Choose the plan that fits your portfolio."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/subscription">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Link>
          </Button>
        }
      />

      {/* ── Billing cycle + currency toggles ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Cycle toggle */}
        <div className="inline-flex items-center rounded-lg border border-border bg-background p-1 gap-0.5">
          {(["monthly", "annual"] as BillingCycle[]).map(c => (
            <button
              key={c}
              onClick={() => setCycle(c)}
              className={cn(
                "px-3.5 py-1.5 text-sm font-medium rounded-md transition-all cursor-pointer",
                cycle === c
                  ? "bg-white dark:bg-slate-700 shadow-sm text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/60 dark:hover:bg-slate-700/60",
              )}
            >
              {c === "monthly" ? "Monthly" : "Annual"}
              {c === "annual" && (
                <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
                  Save 20%
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Currency toggle */}
        <div className="inline-flex items-center rounded-lg border border-border bg-background p-1 gap-0.5">
          {(["UGX", "USD"] as BillingCurrency[]).map(cur => (
            <button
              key={cur}
              onClick={() => setCurrency(cur)}
              className={cn(
                "px-3.5 py-1.5 text-sm font-medium rounded-md transition-all cursor-pointer",
                currency === cur
                  ? "bg-white dark:bg-slate-700 shadow-sm text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/60 dark:hover:bg-slate-700/60",
              )}
            >
              {cur}
            </button>
          ))}
        </div>
      </div>

      {/* ── Plan cards ── */}
      {loadingPlans ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-[440px] rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-start pt-4">
          {plans.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              cycle={cycle}
              currency={currency}
              isCurrent={sub?.plan.id === plan.id}
              isRecommended={plan.slug === "professional"}
              onSelect={() => handleSelect(plan)}
              selecting={selecting && selectingId === plan.id}
            />
          ))}
        </div>
      )}

      {/* ── VAT note ── */}
      <p className="text-xs text-muted-foreground text-center">
        All prices are subject to 18% VAT. Annual plans are billed once per year.
        Payments verified manually within 24 hours.
      </p>

      {/* ── Compare all features ── */}
      {!loadingPlans && plans.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-center">
            <button
              onClick={() => setShowCompare(v => !v)}
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors cursor-pointer"
            >
              {showCompare ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  Hide feature comparison
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  Compare all features
                </>
              )}
            </button>
          </div>

          {showCompare && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-200">
              <ComparisonTable plans={plans} sub={sub} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
