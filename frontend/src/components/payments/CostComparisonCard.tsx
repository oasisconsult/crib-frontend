"use client";

/**
 * CostComparisonCard — shows per-channel fee estimates and highlights the
 * recommended (cheapest + most reliable) option.
 *
 * Used in PaymentStep and AdaptivePaymentButton to help tenants choose a channel.
 */

import { TrendingDown, Zap, Shield, Phone, Building2, Banknote, CreditCard } from "lucide-react";
import { cn } from "@/utils/cn";
import { formatCurrency } from "@/utils/formatters";
import type { ChannelCostEstimate, PaymentDecision } from "@/types";

// ── Channel display config ─────────────────────────────────────────────────────

const CHANNEL_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; description: string }
> = {
  mobile_money_mtn: {
    label: "MTN Mobile Money",
    icon: Phone,
    description: "Pay with MTN MoMo",
  },
  mobile_money_airtel: {
    label: "Airtel Money",
    icon: Phone,
    description: "Pay with Airtel Money",
  },
  bank_transfer: {
    label: "Bank Transfer",
    icon: Building2,
    description: "Direct bank transfer",
  },
  cash: {
    label: "Cash",
    icon: Banknote,
    description: "Pay in person",
  },
  other: {
    label: "Other",
    icon: CreditCard,
    description: "Other payment method",
  },
};

function retryLabel(strategy: PaymentDecision["retryStrategy"]): string {
  switch (strategy) {
    case "none":      return "High reliability";
    case "immediate": return "May need 1 retry";
    case "delayed":   return "May need retries";
    case "next_day":  return "Low reliability";
  }
}

function retryColor(strategy: PaymentDecision["retryStrategy"]): string {
  switch (strategy) {
    case "none":      return "text-emerald-600";
    case "immediate": return "text-amber-600";
    case "delayed":   return "text-orange-600";
    case "next_day":  return "text-red-600";
  }
}

// ── Single channel row ─────────────────────────────────────────────────────────

function ChannelRow({
  estimate,
  isRecommended,
  currency,
}: {
  estimate: ChannelCostEstimate;
  isRecommended: boolean;
  currency: string;
}) {
  const cfg = CHANNEL_CONFIG[estimate.channel] ?? CHANNEL_CONFIG.other;
  const Icon = cfg.icon;

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors",
        isRecommended
          ? "border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30"
          : "border-border bg-background",
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            isRecommended
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight truncate">{cfg.label}</p>
          <p className="text-xs text-muted-foreground">
            {estimate.feePercent === 0
              ? "No fee"
              : `${estimate.feePercent}% fee · ${formatCurrency(estimate.feeAmount, currency)}`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isRecommended && (
          <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <Zap className="h-3 w-3" />
            Best
          </span>
        )}
        <span className="text-sm font-semibold tabular-nums">
          {formatCurrency(estimate.totalAmount, currency)}
        </span>
      </div>
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

interface CostComparisonCardProps {
  decision: PaymentDecision;
  currency?: string;
  className?: string;
}

export function CostComparisonCard({
  decision,
  currency = "UGX",
  className,
}: CostComparisonCardProps) {
  const failureScore = decision.predictedFailureScore;
  const failurePct = Math.round(failureScore * 100);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <TrendingDown className="h-4 w-4 text-emerald-600" />
          Channel comparison
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Shield className="h-3 w-3" />
          <span className={retryColor(decision.retryStrategy)}>
            {retryLabel(decision.retryStrategy)}
          </span>
          {failurePct > 0 && (
            <span className="ml-1 text-muted-foreground">
              ({failurePct}% failure risk)
            </span>
          )}
        </div>
      </div>

      {/* Channel rows — recommended first, rest sorted by fee */}
      <div className="space-y-1.5">
        {decision.costEstimates.map((est) => (
          <ChannelRow
            key={est.channel}
            estimate={est}
            isRecommended={est.channel === decision.recommendedChannel}
            currency={currency}
          />
        ))}
      </div>

      {/* Explanation */}
      <p className="text-xs text-muted-foreground leading-relaxed px-0.5">
        {decision.explain}
      </p>
    </div>
  );
}
