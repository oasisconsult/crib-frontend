"use client";

import {
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  CreditCard,
  Phone,
  Building2,
  Banknote,
  Printer,
  Calendar,
  Hash,
  Receipt,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDateTime, formatDate, formatRef } from "@/utils/formatters";
import { usePaymentAllocations } from "@/hooks/usePayments";
import { cn } from "@/utils/cn";
import type { Payment, RentSchedule } from "@/types";

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; badgeVariant: "success" | "destructive" | "warning" | "secondary"; label: string }> = {
  initiated:          { icon: Clock,        color: "text-slate-500",   badgeVariant: "secondary",    label: "Initiated"       },
  predicted:          { icon: Clock,        color: "text-indigo-500",  badgeVariant: "secondary",    label: "Analysed"        },
  routed:             { icon: Clock,        color: "text-blue-500",    badgeVariant: "secondary",    label: "Routed"          },
  pending:            { icon: Clock,        color: "text-amber-500",   badgeVariant: "warning",      label: "Processing"      },
  reconciled:         { icon: CheckCircle2, color: "text-teal-600",    badgeVariant: "success",      label: "Reconciled"      },
  allocated:          { icon: CheckCircle2, color: "text-violet-600",  badgeVariant: "success",      label: "Allocated"       },
  completed:          { icon: CheckCircle2, color: "text-emerald-600", badgeVariant: "success",      label: "Completed"       },
  confirmed:          { icon: CheckCircle2, color: "text-emerald-600", badgeVariant: "success",      label: "Confirmed"       },
  predicted_failure:  { icon: XCircle,     color: "text-orange-500",  badgeVariant: "warning",      label: "Blocked"         },
  retry_scheduled:    { icon: RefreshCw,   color: "text-amber-500",   badgeVariant: "warning",      label: "Retry Scheduled" },
  permanently_failed: { icon: XCircle,     color: "text-red-600",     badgeVariant: "destructive",  label: "Failed"          },
  failed:             { icon: XCircle,     color: "text-red-600",     badgeVariant: "destructive",  label: "Failed"          },
  refunded:           { icon: RefreshCw,   color: "text-slate-500",   badgeVariant: "secondary",    label: "Refunded"        },
};

const METHOD_LABELS: Record<string, { icon: React.ElementType; label: string }> = {
  mobile_money_mtn:    { icon: Phone,     label: "MTN Mobile Money"  },
  mobile_money_airtel: { icon: Phone,     label: "Airtel Money"      },
  bank_transfer:       { icon: Building2, label: "Bank Transfer"     },
  cash:                { icon: Banknote,  label: "Cash"              },
  card:                { icon: CreditCard,label: "Card"              },
  direct_debit:        { icon: Building2, label: "Direct Debit"      },
  cheque:              { icon: CreditCard,label: "Cheque"            },
};

const CATEGORY_LABELS: Record<string, string> = {
  rent:        "Rent Payment",
  deposit:     "Security Deposit",
  late_fee:    "Late Fee",
  maintenance: "Maintenance Charge",
  utility:     "Utility Payment",
  other:       "Other",
};

// ── Allocations section ───────────────────────────────────────────────────────

function AllocationRows({
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
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-32" />
      </div>
    );
  }
  if (!allocations?.length) return null;

  return (
    <div className="space-y-1.5">
      {allocations.map((a) => {
        const sched = schedules?.find((s) => s.id === a.rentScheduleId);
        return (
          <div key={a.id} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {sched
                ? `${sched.reference ?? "Rent"} — ${formatDate(sched.periodStart, "MMMM yyyy")}`
                : "Rent period"}
            </span>
            <span className="font-semibold text-foreground">
              {formatCurrency(a.amountApplied)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Row helper ────────────────────────────────────────────────────────────────

function ReceiptRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-border/50 last:border-0">
      <dt className="text-sm text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-sm font-medium text-foreground text-right">{children}</dd>
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

interface PaymentReceiptProps {
  payment: Payment | null;
  leaseRef?: string;
  propertyName?: string;
  unitName?: string;
  leaseId?: string;
  schedules?: RentSchedule[];
  open: boolean;
  onClose: () => void;
}

export function PaymentReceipt({
  payment,
  leaseRef,
  propertyName,
  unitName,
  leaseId,
  schedules,
  open,
  onClose,
}: PaymentReceiptProps) {
  if (!payment) return null;

  const state = (payment as any).status ?? payment.state;
  const statusCfg = STATUS_CONFIG[state] ?? STATUS_CONFIG.pending;
  const StatusIcon = statusCfg.icon;
  const methodInfo = METHOD_LABELS[(payment.method as string) ?? "other"] ?? METHOD_LABELS.cash;
  const MethodIcon = methodInfo.icon;
  const categoryLabel = CATEGORY_LABELS[payment.category] ?? "Payment";
  const isSuccess = ["completed", "confirmed", "reconciled", "allocated"].includes(state);
  const isFailed = ["failed", "permanently_failed"].includes(state);
  const paidAt = payment.paidAt ?? payment.createdAt;

  function handlePrint() {
    window.print();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            Payment Receipt
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* Status hero */}
          <div className={cn(
            "flex flex-col items-center gap-2 py-5 rounded-[6px] border",
            isSuccess && "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800",
            isFailed && "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800",
            !isSuccess && !isFailed && "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
          )}>
            <StatusIcon className={cn("h-8 w-8", statusCfg.color)} />
            <p className="text-2xl font-bold text-foreground">
              {formatCurrency(payment.amount, payment.currency)}
            </p>
            <Badge variant={statusCfg.badgeVariant} className="text-xs">
              {statusCfg.label}
            </Badge>
          </div>

          {/* Details */}
          <dl>
            <ReceiptRow label="Reference">
              <span className="font-mono">{payment.reference ?? "—"}</span>
            </ReceiptRow>
            <ReceiptRow label="Category">{categoryLabel}</ReceiptRow>
            <ReceiptRow label="Date & Time">
              <span>{formatDateTime(paidAt)}</span>
            </ReceiptRow>
            <ReceiptRow label="Payment Method">
              <span className="flex items-center gap-1.5 justify-end">
                <MethodIcon className="h-3.5 w-3.5 text-muted-foreground" />
                {methodInfo.label}
              </span>
            </ReceiptRow>
            {leaseRef && (
              <ReceiptRow label="Lease Reference">
                <span className="font-mono">{leaseRef}</span>
              </ReceiptRow>
            )}
            {propertyName && (
              <ReceiptRow label="Property">{propertyName}</ReceiptRow>
            )}
            {unitName && (
              <ReceiptRow label="Unit">{unitName}</ReceiptRow>
            )}
            {payment.notes && (
              <ReceiptRow label="Notes">{payment.notes}</ReceiptRow>
            )}
          </dl>

          {/* Allocations — what period(s) this payment covered */}
          {isSuccess && leaseId && (
            <div className="rounded-[6px] border border-border bg-card p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <Calendar className="h-3 w-3" />
                Applied to
              </div>
              <AllocationRows
                leaseId={leaseId}
                paymentId={payment.id}
                schedules={schedules}
              />
            </div>
          )}

          {/* Failure reason */}
          {isFailed && payment.failureReason && (
            <div className="rounded-[6px] border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-3">
              <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">Failure Reason</p>
              <p className="text-sm text-red-700 dark:text-red-300">{payment.failureReason}</p>
            </div>
          )}

          {/* Receipt ID */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
            <Hash className="h-3 w-3" />
            <span className="font-mono">RCP-{payment.id.replace(/-/g, "").slice(0, 8).toUpperCase()}</span>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
