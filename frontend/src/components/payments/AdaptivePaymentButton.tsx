"use client";

/**
 * AdaptivePaymentButton — payment CTA with inline cost estimate and channel
 * recommendation from the adaptive routing engine.
 *
 * Usage:
 *   <AdaptivePaymentButton
 *     leaseId={lease.id}
 *     amount={500_000}
 *     currency="UGX"
 *     tenantId={tenant.id}
 *     onPay={(channel) => handlePay(channel)}
 *   />
 *
 * The button fetches a cost estimate when mounted, displays the cheapest
 * channel and predicted failure score, and passes the recommended channel
 * back to the onPay callback so the caller can use it when creating the payment.
 */

import { useState } from "react";
import { Zap, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CostComparisonCard } from "./CostComparisonCard";
import { usePaymentEstimate } from "@/hooks/usePayments";
import { formatCurrency } from "@/utils/formatters";
import { cn } from "@/utils/cn";

interface AdaptivePaymentButtonProps {
  leaseId: string;
  amount: number;
  currency?: string;
  tenantId?: string;
  /** Called when the user clicks Pay. Receives the recommended channel. */
  onPay: (recommendedChannel: string) => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export function AdaptivePaymentButton({
  leaseId,
  amount,
  currency = "UGX",
  tenantId,
  onPay,
  disabled,
  loading,
  className,
}: AdaptivePaymentButtonProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  const { data: decision, isLoading: isEstimating } = usePaymentEstimate(
    leaseId,
    amount > 0 ? { amount, currency, tenantId } : null,
  );

  const failureScore = decision?.predictedFailureScore ?? 0;
  const isRisky = failureScore >= 0.3;
  const recommendedChannel = decision?.recommendedChannel ?? "cash";

  // Fee for the recommended channel
  const bestEstimate = decision?.costEstimates.find(
    (e) => e.channel === recommendedChannel,
  );

  return (
    <div className={cn("space-y-2", className)}>
      {/* Cost hint row */}
      {isEstimating ? (
        <Skeleton className="h-4 w-48" />
      ) : decision ? (
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left"
          onClick={() => setShowBreakdown((v) => !v)}
        >
          <Zap className="h-3 w-3 text-emerald-500 shrink-0" />
          <span>
            Recommended:{" "}
            <span className="font-medium text-foreground">
              {recommendedChannel.replace(/_/g, " ")}
            </span>
            {bestEstimate && bestEstimate.feeAmount > 0 && (
              <span className="ml-1">
                · {formatCurrency(bestEstimate.feeAmount, currency)} fee
              </span>
            )}
            {bestEstimate?.feeAmount === 0 && (
              <span className="ml-1 text-emerald-600">· No fee</span>
            )}
          </span>
          {showBreakdown ? (
            <ChevronUp className="h-3 w-3 ml-auto shrink-0" />
          ) : (
            <ChevronDown className="h-3 w-3 ml-auto shrink-0" />
          )}
        </button>
      ) : null}

      {/* Failure risk warning */}
      {isRisky && decision && (
        <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 rounded-[5px] border border-amber-200 dark:border-amber-200 bg-amber-50 dark:bg-amber-100/40 px-2.5 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            {Math.round(failureScore * 100)}% failure risk on this channel.{" "}
            {decision.retryStrategy !== "none" && (
              <span>
                Retry strategy:{" "}
                <span className="font-medium">
                  {decision.retryStrategy.replace("_", " ")}
                </span>
                .
              </span>
            )}
          </span>
        </div>
      )}

      {/* Expanded cost breakdown */}
      {showBreakdown && decision && (
        <div className="rounded-[6px] border border-primary/15 bg-primary/5 p-3">
          <CostComparisonCard decision={decision} currency={currency} />
        </div>
      )}

      {/* Pay button */}
      <Button
        className="w-full"
        onClick={() => onPay(recommendedChannel)}
        disabled={disabled || isEstimating}
        loading={loading}
      >
        {loading
          ? "Processing…"
          : `Pay ${formatCurrency(amount, currency)} (Optimized)`}
      </Button>
    </div>
  );
}
