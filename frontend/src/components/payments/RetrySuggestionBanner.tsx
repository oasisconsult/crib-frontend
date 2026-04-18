"use client";

/**
 * RetrySuggestionBanner — shown on a failed payment to offer a retry action.
 *
 * Displays:
 *   - The failure reason (if available)
 *   - Retry count and remaining attempts
 *   - A "Retry payment" button that calls POST /leases/{id}/payments/{id}/retry
 */

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { useRetryPayment } from "@/hooks/usePayments";
import type { Payment } from "@/types";

const MAX_RETRIES = 3;

interface RetrySuggestionBannerProps {
  payment: Payment;
  leaseId: string;
  /** Called after a successful retry so the parent can re-confirm or refresh. */
  onRetried?: (updated: Payment) => void;
  className?: string;
}

export function RetrySuggestionBanner({
  payment,
  leaseId,
  onRetried,
  className,
}: RetrySuggestionBannerProps) {
  const status = (payment as any).status ?? payment.state;
  if (status !== "failed") return null;

  const retryCount = payment.retryCount ?? 0;
  const attemptsLeft = MAX_RETRIES - retryCount;
  const canRetry = attemptsLeft > 0;

  const { mutate: retry, isPending } = useRetryPayment(leaseId);

  function handleRetry() {
    retry(payment.id, {
      onSuccess: (updated) => onRetried?.(updated),
    });
  }

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-[6px] border border-red-200 bg-red-50 p-3",
        "dark:border-red-200 dark:bg-red-100/40",
        className,
      )}
    >
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-red-800 dark:text-red-300">
          Payment failed
        </p>

        {payment.failureReason && (
          <p className="text-xs text-red-700 dark:text-red-400 mt-0.5 leading-relaxed">
            {payment.failureReason}
          </p>
        )}

        <p className="text-xs text-muted-foreground mt-1">
          {retryCount > 0 &&
            `Attempt ${retryCount + 1} of ${MAX_RETRIES + 1}. `}
          {canRetry
            ? `${attemptsLeft} ${attemptsLeft === 1 ? "retry" : "retries"} remaining.`
            : "No retries remaining. Please contact support."}
        </p>
      </div>

      {canRetry && (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300"
          onClick={handleRetry}
          disabled={isPending}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5 mr-1.5", isPending && "animate-spin")}
          />
          {isPending ? "Retrying…" : "Retry"}
        </Button>
      )}
    </div>
  );
}
