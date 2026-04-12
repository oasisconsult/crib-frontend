"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CreditCard,
  Calendar,
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  Copy,
  // Receipt,
  FileText as Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PageSkeleton } from "@/components/common/LoadingSkeleton";
import { formatCurrency, formatDate } from "@/utils/formatters";
import { usePayment, useReconcilePayment } from "@/hooks/usePayments";
import { useLease } from "@/hooks/useLeases";
import { toast } from "@/store/useUIStore";
import { cn } from "@/utils/cn";

interface Props {
  params: Promise<{ id: string }>;
}

// ── State config ──────────────────────────────────────────────────────────────

const STATE_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; icon: React.ElementType }
> = {
  // v4 happy path
  initiated: {
    label: "Initiated",
    color: "text-slate-600",
    bg: "bg-slate-100 dark:bg-slate-900/40",
    icon: Clock,
  },
  predicted: {
    label: "Analysed",
    color: "text-indigo-700",
    bg: "bg-indigo-100 dark:bg-indigo-950/40",
    icon: Clock,
  },
  routed: {
    label: "Routed",
    color: "text-blue-700",
    bg: "bg-blue-100 dark:bg-blue-950/40",
    icon: Clock,
  },
  pending: {
    label: "Processing",
    color: "text-amber-700",
    bg: "bg-amber-100 dark:bg-amber-950/40",
    icon: Clock,
  },
  reconciled: {
    label: "Reconciled",
    color: "text-teal-700",
    bg: "bg-teal-100 dark:bg-teal-950/40",
    icon: CheckCircle2,
  },
  allocated: {
    label: "Allocated",
    color: "text-violet-700",
    bg: "bg-violet-100 dark:bg-violet-950/40",
    icon: CheckCircle2,
  },
  completed: {
    label: "Completed",
    color: "text-emerald-700",
    bg: "bg-emerald-100 dark:bg-emerald-950/40",
    icon: CheckCircle2,
  },
  // v4 failure paths
  predicted_failure: {
    label: "Blocked",
    color: "text-orange-700",
    bg: "bg-orange-100 dark:bg-orange-950/40",
    icon: AlertTriangle,
  },
  retry_scheduled: {
    label: "Retry Scheduled",
    color: "text-amber-700",
    bg: "bg-amber-100 dark:bg-amber-950/40",
    icon: Clock,
  },
  permanently_failed: {
    label: "Failed",
    color: "text-red-700",
    bg: "bg-red-100 dark:bg-red-950/40",
    icon: AlertTriangle,
  },
  // legacy
  confirmed: {
    label: "Confirmed",
    color: "text-emerald-700",
    bg: "bg-emerald-100 dark:bg-emerald-950/40",
    icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    color: "text-red-700",
    bg: "bg-red-100 dark:bg-red-950/40",
    icon: AlertTriangle,
  },
  refunded: {
    label: "Refunded",
    color: "text-orange-700",
    bg: "bg-orange-100 dark:bg-orange-950/40",
    icon: RotateCcw,
  },
};

// ── Method label ──────────────────────────────────────────────────────────────

function methodLabel(method?: string | null): string {
  if (!method) return "—";
  const MAP: Record<string, string> = {
    mobile_money_mtn: "MTN Mobile Money",
    mobile_money_airtel: "Airtel Money",
    bank_transfer: "Bank Transfer",
    card: "Card",
    cash: "Cash",
    direct_debit: "Direct Debit",
    cheque: "Cheque",
  };
  return MAP[method] ?? method.replace(/_/g, " ");
}

function categoryLabel(p: { category?: string; type?: string }): string {
  const raw = p.category ?? (p as any).type ?? "other";
  return raw.replace(/_/g, " ");
}

// ── Copy helper ───────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value);
        toast.success("Copied");
      }}
      className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
      title="Copy"
    >
      <Copy className="h-3.5 w-3.5" />
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PaymentDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();

  const { data: payment, isLoading } = usePayment(id);
  const { mutate: reconcile, isPending: reconciling } = useReconcilePayment();

  // Related data — only fetch when IDs are known
  const { data: lease } = useLease(payment?.leaseId ?? "");

  if (isLoading) return <PageSkeleton />;
  if (!payment) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <CreditCard className="h-12 w-12 text-muted-foreground" />
        <p className="text-sm font-medium">Payment not found</p>
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          Go back
        </Button>
      </div>
    );
  }

  const stateCfg = STATE_CONFIG[payment.state] ?? STATE_CONFIG.pending;
  const StateIcon = stateCfg.icon;
  const IN_PROGRESS = new Set([
    "initiated",
    "predicted",
    "routed",
    "pending",
    "reconciled",
    "allocated",
    "retry_scheduled",
  ]);
  const SUCCESS_STATES = new Set(["confirmed", "completed"]);
  const canReconcile = IN_PROGRESS.has(payment.state as string);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight font-mono">
                {payment.reference}
              </h1>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                  stateCfg.color,
                  stateCfg.bg,
                )}
              >
                <StateIcon className="h-3 w-3" />
                {stateCfg.label}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 capitalize">
              {categoryLabel(payment)} payment
            </p>
          </div>
        </div>

        {canReconcile && (
          <Button
            size="sm"
            variant="outline"
            loading={reconciling}
            onClick={() => reconcile(payment.id)}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Confirm Payment
          </Button>
        )}
      </div>

      {/* ── Amount hero ──────────────────────────────────────── */}
      <div className="rounded-xl border bg-gradient-to-br from-emerald-50 to-background dark:from-emerald-950/20 dark:to-background p-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            Amount
          </p>
          <p className="text-4xl font-bold text-emerald-600 mt-1">
            {formatCurrency(payment.amount, payment.currency)}
          </p>
          <p className="text-sm text-muted-foreground mt-1 capitalize">
            {categoryLabel(payment)}
          </p>
        </div>
        <div
          className={cn(
            "h-16 w-16 rounded-2xl flex items-center justify-center shrink-0",
            stateCfg.bg,
          )}
        >
          <StateIcon className={cn("h-8 w-8", stateCfg.color)} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Payment details ────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Payment Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Reference</span>
              <span className="font-mono text-xs flex items-center">
                {payment.reference}
                <CopyButton value={payment.reference ?? ""} />
              </span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Category</span>
              <span className="capitalize">{categoryLabel(payment)}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Method</span>
              <span>{methodLabel((payment as any).method)}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Currency</span>
              <Badge variant="secondary">{payment.currency}</Badge>
            </div>
            {(payment as any).idempotencyKey && (
              <>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Idempotency</span>
                  <span className="font-mono text-xs flex items-center">
                    {(payment as any).idempotencyKey}
                    <CopyButton value={(payment as any).idempotencyKey} />
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Timeline ───────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {payment.paidAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid On</span>
                <span className="text-emerald-600 font-medium">
                  {formatDate(payment.paidAt)}
                </span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{formatDate(payment.createdAt)}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last Updated</span>
              <span>{formatDate(payment.updatedAt)}</span>
            </div>

            {/* Visual timeline */}
            <div className="pt-2">
              <div className="flex items-center gap-2">
                {[
                  { label: "Created", done: true },
                  { label: "Paid", done: !!payment.paidAt },
                  {
                    label: "Completed",
                    done: SUCCESS_STATES.has(payment.state as string),
                  },
                  { label: "Refunded", done: payment.state === "refunded" },
                ].map((s, i) => (
                  <div key={s.label} className="flex items-center gap-1">
                    {i > 0 && (
                      <div
                        className={cn(
                          "h-px w-4 shrink-0",
                          s.done ? "bg-emerald-400" : "bg-border",
                        )}
                      />
                    )}
                    <div className="flex flex-col items-center gap-0.5">
                      <div
                        className={cn(
                          "h-2 w-2 rounded-full",
                          s.done ? "bg-emerald-500" : "bg-muted-foreground/30",
                        )}
                      />
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {s.label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Related ────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Related
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {/* Lease */}
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Lease</span>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 font-mono text-xs"
                onClick={() => router.push(`/leases/${payment.leaseId}`)}
              >
                <FileText className="h-3.5 w-3.5 mr-1" />
                {lease?.reference ?? payment.leaseId}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Notes / receipt ────────────────────────────────── */}
        {!!payment.notes && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground leading-relaxed">
                {payment.notes}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
