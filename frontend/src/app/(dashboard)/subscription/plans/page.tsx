"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Zap, Building2, Users, HardDrive, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/PageHeader";
import { usePlans, useCurrentSubscription, useSelectPlan } from "@/hooks/useSubscription";
import { toast } from "@/store/useUIStore";
import { cn } from "@/utils/cn";
import type { BillingCycle, BillingCurrency, SubscriptionPlan } from "@/services/api/subscriptions";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatUGX(n: number) {
  return n === 0 ? "Free" : `UGX ${n.toLocaleString()}`;
}

function formatUSD(cents: number) {
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(0)}`;
}

function annualSavings(monthly: number, annual: number) {
  if (monthly === 0) return 0;
  return Math.round((1 - annual / (monthly * 12)) * 100);
}

const FEATURES = [
  { key: "analytics_basic",        label: "Basic Analytics" },
  { key: "analytics_advanced",     label: "Advanced Analytics" },
  { key: "maintenance_workflows",  label: "Maintenance Workflows" },
  { key: "document_storage",       label: "Document Storage" },
  { key: "tenant_messaging",       label: "Tenant Messaging" },
  { key: "team_members",           label: "Team Members" },
  { key: "custom_branding",        label: "Custom Branding" },
  { key: "priority_support",       label: "Priority Support" },
  { key: "dedicated_support",      label: "Dedicated Support" },
  { key: "api_access",             label: "API Access" },
  { key: "sso",                    label: "SSO / SAML" },
  { key: "audit_logs",             label: "Audit Logs" },
];

function limitLabel(v: number, unit: string) {
  return v === -1 ? "Unlimited" : `${v.toLocaleString()} ${unit}`;
}

// ── Plan card ──────────────────────────────────────────────────────────────

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
  const annualUGX = plan.annualPriceUgx;
  const monthlyUSD = plan.monthlyPriceUsdCents;
  const annualUSD = plan.annualPriceUsdCents;

  const displayPrice = currency === "UGX"
    ? (cycle === "annual" ? formatUGX(Math.round(annualUGX / 12)) : formatUGX(monthlyUGX))
    : (cycle === "annual" ? formatUSD(Math.round(annualUSD / 12)) : formatUSD(monthlyUSD));

  const savings = currency === "UGX"
    ? annualSavings(monthlyUGX, annualUGX)
    : annualSavings(monthlyUSD, annualUSD);

  const isFree = plan.slug === "free";

  return (
    <div className={cn(
      "relative flex flex-col rounded-[var(--radius-lg)] border bg-card transition-all duration-200",
      isRecommended && "border-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.15)] shadow-[var(--shadow-md)]",
      !isRecommended && "border-border shadow-[var(--shadow-sm)]",
      isCurrent && "ring-2 ring-primary/20",
    )}>
      {isRecommended && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary text-primary-foreground px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow">
            Most Popular
          </Badge>
        </div>
      )}

      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <span className="text-base font-bold text-foreground">{plan.name}</span>
          {isCurrent && <Badge variant="outline" className="text-[10px]">Current</Badge>}
        </div>
        <div className="flex items-end gap-1 mb-1">
          <span className="text-3xl font-bold text-foreground">{displayPrice}</span>
          {!isFree && <span className="text-sm text-muted-foreground mb-1">/ mo</span>}
        </div>
        {!isFree && cycle === "annual" && savings > 0 && (
          <p className="text-xs text-emerald-600 font-medium">Save {savings}% annually</p>
        )}
        {!isFree && cycle === "monthly" && (
          <p className="text-xs text-muted-foreground">Billed monthly</p>
        )}
        <p className="text-xs text-muted-foreground mt-2">{plan.description}</p>
      </div>

      <div className="p-6 flex-1 space-y-3">
        {/* Limits */}
        <div className="space-y-1.5 text-sm">
          {[
            { icon: Building2, label: limitLabel(plan.maxProperties, "properties") },
            { icon: Building2, label: limitLabel(plan.maxUnits, "units") },
            { icon: Users, label: limitLabel(plan.maxUsers, "users") },
            { icon: HardDrive, label: plan.maxStorageMb === -1 ? "Unlimited storage" : `${plan.maxStorageMb >= 1024 ? `${plan.maxStorageMb / 1024} GB` : `${plan.maxStorageMb} MB`} storage` },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-muted-foreground">
              <item.icon className="h-3.5 w-3.5 shrink-0" />
              {item.label}
            </div>
          ))}
        </div>

        {/* Features */}
        <div className="space-y-1.5 pt-2 border-t border-border">
          {FEATURES.map(f => (
            <div key={f.key} className="flex items-center gap-2 text-sm">
              {plan.features[f.key] ? (
                <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              ) : (
                <div className="h-3.5 w-3.5 shrink-0 rounded-full border border-muted-foreground/20" />
              )}
              <span className={plan.features[f.key] ? "text-foreground" : "text-muted-foreground/50"}>{f.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-6 pt-4">
        <Button
          onClick={onSelect}
          disabled={isCurrent || selecting}
          className="w-full"
          variant={isRecommended ? "default" : "outline"}
        >
          {selecting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isCurrent ? "Current Plan" : isFree ? "Switch to Free" : "Select Plan"}
        </Button>
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

  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [currency, setCurrency] = useState<BillingCurrency>("UGX");
  const [selectingId, setSelectingId] = useState<string | null>(null);

  function handleSelect(plan: SubscriptionPlan) {
    if (plan.slug === "free") {
      // Downgrade to free — no payment needed
      setSelectingId(plan.id);
      selectPlan(
        { planId: plan.id, billingCycle: "none", currency },
        {
          onSuccess: () => {
            toast.success("Plan changed", "You are now on the Free plan.");
            router.push("/subscription");
          },
          onError: (err: any) => toast.error("Failed", err?.response?.data?.detail ?? "Please try again"),
          onSettled: () => setSelectingId(null),
        },
      );
    } else {
      // Paid plan — go to payment form
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
            <Link href="/subscription"><ArrowLeft className="h-3.5 w-3.5" /> Back</Link>
          </Button>
        }
      />

      {/* ── Billing cycle + currency toggles ── */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center rounded-[var(--radius-md)] border border-border bg-muted/40 p-1 gap-1">
          {(["monthly", "annual"] as BillingCycle[]).map(c => (
            <button
              key={c}
              onClick={() => setCycle(c)}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-[var(--radius-sm)] transition-all",
                cycle === c ? "bg-card shadow-[var(--shadow-sm)] text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c === "monthly" ? "Monthly" : "Annual"}{c === "annual" && " (Save 20%)"}
            </button>
          ))}
        </div>

        <div className="flex items-center rounded-[var(--radius-md)] border border-border bg-muted/40 p-1 gap-1">
          {(["UGX", "USD"] as BillingCurrency[]).map(cur => (
            <button
              key={cur}
              onClick={() => setCurrency(cur)}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-[var(--radius-sm)] transition-all",
                currency === cur ? "bg-card shadow-[var(--shadow-sm)] text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {cur}
            </button>
          ))}
        </div>
      </div>

      {/* ── Plan grid ── */}
      {loadingPlans ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-[500px] rounded-[var(--radius-lg)] bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
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

      <p className="text-xs text-muted-foreground text-center">
        All prices are subject to 18% VAT. Annual plans are billed once per year.
        Payments verified manually within 24 hours.
      </p>
    </div>
  );
}
