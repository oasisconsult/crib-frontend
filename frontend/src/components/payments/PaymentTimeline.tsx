"use client";

/**
 * PaymentTimeline — mobile-first payment history for the tenant portal.
 *
 * Shows a vertical timeline of all payments, oldest at the bottom.
 * Each entry shows: status icon, amount, date, method, and schedule period.
 * Tapping an entry expands allocation details (which schedules it covered).
 */

import { useState } from "react";
import {
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Phone,
  Building2,
  Banknote,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, formatRelative } from "@/utils/formatters";
import { usePaymentAllocations } from "@/hooks/usePayments";
import { RetrySuggestionBanner } from "./RetrySuggestionBanner";
import { cn } from "@/utils/cn";
import type { Payment, RentSchedule } from "@/types";

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  string,
  { icon: React.ElementType; color: string; label: string }
> = {
  // v4 happy path
  initiated:          { icon: Clock,        color: "text-slate-400",   label: "Initiated"      },
  predicted:          { icon: Clock,        color: "text-indigo-500",  label: "Analysed"       },
  routed:             { icon: Clock,        color: "text-blue-500",    label: "Routed"         },
  pending:            { icon: Clock,        color: "text-amber-500",   label: "Processing"     },
  reconciled:         { icon: CheckCircle2, color: "text-teal-500",    label: "Reconciled"     },
  allocated:          { icon: CheckCircle2, color: "text-violet-500",  label: "Allocated"      },
  completed:          { icon: CheckCircle2, color: "text-emerald-500", label: "Completed"      },
  // v4 failure paths
  predicted_failure:  { icon: XCircle,     color: "text-orange-500",  label: "Blocked"        },
  retry_scheduled:    { icon: RefreshCw,   color: "text-amber-500",   label: "Retry Scheduled"},
  permanently_failed: { icon: XCircle,     color: "text-red-500",     label: "Failed"         },
  // legacy
  confirmed:          { icon: CheckCircle2, color: "text-emerald-500", label: "Confirmed"      },
  failed:             { icon: XCircle,      color: "text-red-500",     label: "Failed"         },
  refunded:           { icon: RefreshCw,    color: "text-slate-500",   label: "Refunded"       },
};

// ── Method config ─────────────────────────────────────────────────────────────

const METHOD_ICON: Record<string, React.ElementType> = {
  mobile_money_mtn:    Phone,
  mobile_money_airtel: Phone,
  bank_transfer:       Building2,
  cash:                Banknote,
  other:               CreditCard,
  card:                CreditCard,
};

// ── Allocation detail row (expandable) ────────────────────────────────────────

function AllocationDetail({
  leaseId,
  paymentId,
  schedules,
}: {
  leaseId: string;
  paymentId: string;
  schedules?: RentSchedule[];
}) {
  const { data: allocations, isLoading } = usePaymentAllocations(leaseId, paymentId);

  if (isLoading) {
    return (
      <div className="mt-2 space-y-1 pl-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-36" />
      </div>
    );
  }

  if (!allocations?.length) return null;

  return (
    <div className="mt-2 rounded-md bg-primary/5 border border-primary/15 px-3 py-2 space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Applied to
      </p>
      {allocations.map((a) => {
        const sched = schedules?.find((s) => s.id === a.rentScheduleId);
        return (
          <div key={a.id} className="flex items-center justify-between text-xs">
            <span className="text-foreground">
              {sched
                ? `${formatDate(sched.periodStart, "MMM yyyy")}`
                : a.rentScheduleId.slice(0, 8) + "…"}
            </span>
            <span className="font-semibold text-emerald-600">
              {formatCurrency(a.amountApplied)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Single payment row ────────────────────────────────────────────────────────

interface PaymentRowProps {
  payment: Payment;
  leaseId: string;
  schedules?: RentSchedule[];
  isLast: boolean;
  onRetried?: (updated: Payment) => void;
}

function PaymentRow({ payment, leaseId, schedules, isLast, onRetried }: PaymentRowProps) {
  const [expanded, setExpanded] = useState(false);

  const paymentStatus = (payment as any).status ?? payment.state;
  const statusCfg = STATUS_CONFIG[paymentStatus] ?? STATUS_CONFIG.pending;
  const StatusIcon = statusCfg.icon;
  const MethodIcon = METHOD_ICON[(payment.method as string) ?? "other"] ?? CreditCard;
  const isConfirmed = paymentStatus === "confirmed" || paymentStatus === "completed";
  const isFailed = paymentStatus === "failed" || paymentStatus === "permanently_failed" || paymentStatus === "predicted_failure";
  const isRetryable = paymentStatus === "failed" || paymentStatus === "retry_scheduled";

  return (
    <div className="relative flex gap-3">
      {/* Vertical line */}
      {!isLast && (
        <div
          aria-hidden="true"
          className="absolute left-[13px] top-7 bottom-0 w-px bg-border"
        />
      )}

      {/* Status icon */}
      <div className="relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background border border-border">
        <StatusIcon className={cn("h-3.5 w-3.5", statusCfg.color)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-4">
        <button
          className="w-full text-left"
          onClick={() => (isConfirmed || isFailed || isRetryable) && setExpanded((e) => !e)}
          aria-expanded={expanded}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">
                {formatCurrency(payment.amount, payment.currency)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDate(payment.paidAt ?? payment.createdAt)} ·{" "}
                {formatRelative(payment.paidAt ?? payment.createdAt)}
              </p>
              {/* Failure reason inline hint */}
              {isFailed && payment.failureReason && !expanded && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 truncate">
                  {payment.failureReason}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <MethodIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <Badge
                variant={
                  isConfirmed ? "success"
                  : isFailed ? "destructive"
                  : isRetryable ? "warning"
                  : "secondary"
                }
                className="text-xs"
              >
                {statusCfg.label}
                {isFailed && (payment.retryCount ?? 0) > 0 && (
                  <span className="ml-1 opacity-70">#{payment.retryCount}</span>
                )}
              </Badge>
              {(isConfirmed || isFailed || isRetryable) && (
                <span className="text-muted-foreground">
                  {expanded ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </span>
              )}
            </div>
          </div>
        </button>

        {/* Expanded: allocation detail for confirmed, retry banner for failed */}
        {expanded && isConfirmed && (
          <AllocationDetail
            leaseId={leaseId}
            paymentId={payment.id}
            schedules={schedules}
          />
        )}
        {expanded && (isFailed || isRetryable) && (
          <div className="mt-2">
            <RetrySuggestionBanner
              payment={payment}
              leaseId={leaseId}
              onRetried={onRetried}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

interface PaymentTimelineProps {
  leaseId: string;
  payments: Payment[];
  schedules?: RentSchedule[];
  isLoading?: boolean;
  /** Called after a failed payment is successfully retried. */
  onRetried?: (updated: Payment) => void;
}

export function PaymentTimeline({
  leaseId,
  payments,
  schedules,
  isLoading,
  onRetried,
}: PaymentTimelineProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-7 w-7 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!payments.length) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <CreditCard className="h-8 w-8 text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">No payments yet</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Your payment history will appear here.
        </p>
      </div>
    );
  }

  // Newest first
  const sorted = [...payments].sort(
    (a, b) =>
      new Date(b.paidAt ?? b.createdAt).getTime() -
      new Date(a.paidAt ?? a.createdAt).getTime(),
  );

  return (
    <div className="space-y-0">
      {sorted.map((p, i) => (
        <PaymentRow
          key={p.id}
          payment={p}
          leaseId={leaseId}
          schedules={schedules}
          isLast={i === sorted.length - 1}
          onRetried={onRetried}
        />
      ))}
    </div>
  );
}
