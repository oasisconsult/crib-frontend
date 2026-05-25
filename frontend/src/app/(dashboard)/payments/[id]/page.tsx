"use client";

import { use, useState } from "react";
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
  XCircle,
  Ban,
  FileText as Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageSkeleton } from "@/components/common/LoadingSkeleton";
import { formatCurrency, formatDate } from "@/utils/formatters";
import {
  usePayment,
  useReconcilePayment,
  useRejectPayment,
  useCancelPayment,
} from "@/hooks/usePayments";
import { useLease } from "@/hooks/useLeases";
import { usePermissions } from "@/hooks/usePermissions";
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
    color: "text-muted-foreground",
    bg: "bg-muted/60 dark:bg-muted/30",
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
    color: "text-teal-700",
    bg: "bg-teal-100 dark:bg-teal-950/40",
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
  // human-action terminal states
  rejected: {
    label: "Rejected",
    color: "text-red-700",
    bg: "bg-red-100 dark:bg-red-950/40",
    icon: Ban,
  },
  cancelled: {
    label: "Cancelled",
    color: "text-gray-600",
    bg: "bg-gray-100 dark:bg-gray-800/40",
    icon: XCircle,
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

// ── State sets (mirrors backend state machine) ────────────────────────────────

/** States from which org staff can reject */
const REJECTABLE = new Set([
  "initiated", "predicted", "routed", "pending",
  "reconciled", "allocated",
  "predicted_failure", "retry_scheduled",
  "permanently_failed", "failed",
]);

/** States from which a tenant can still cancel */
const CANCELLABLE = new Set([
  "initiated", "predicted", "routed", "pending", "retry_scheduled",
]);

/** In-progress states (Confirm Payment button) */
const IN_PROGRESS = new Set([
  "initiated", "predicted", "routed", "pending",
  "reconciled", "allocated", "retry_scheduled",
]);

const SUCCESS_STATES = new Set(["confirmed", "completed"]);

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function CopyButton({ value }: { value: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value);
        toast.success("Copied");
      }}
      className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
      aria-label="Copy to clipboard"
      title="Copy"
    >
      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

// ── Reject dialog ─────────────────────────────────────────────────────────────

function RejectDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (reason: string) => void;
  isPending: boolean;
}) {
  const [reason, setReason] = useState("");

  function handleSubmit() {
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error("Please provide a reason for the rejection");
      return;
    }
    onConfirm(trimmed);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Ban className="h-5 w-5" />
            Reject Payment
          </DialogTitle>
          <DialogDescription>
            This payment will be permanently rejected and cannot be confirmed.
            A new payment must be created to re-attempt. Please provide a reason
            — it will be visible to the tenant.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Label htmlFor="reject-reason">
            Reason <span className="text-red-500">*</span>
          </Label>
          <Textarea
            id="reject-reason"
            placeholder="e.g. Duplicate entry, wrong amount, payment recorded in error…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="resize-none"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            {reason.trim().length}/500 characters
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!reason.trim() || isPending}
            loading={isPending}
          >
            <Ban className="h-3.5 w-3.5" />
            Reject Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Cancel dialog ─────────────────────────────────────────────────────────────

function CancelDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (reason?: string) => void;
  isPending: boolean;
}) {
  const [reason, setReason] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-700">
            <XCircle className="h-5 w-5" />
            Cancel Payment
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to cancel this payment? This action cannot
            be undone. If you've already sent funds, please contact your
            property manager to arrange a refund instead.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Label htmlFor="cancel-reason">
            Reason{" "}
            <span className="text-muted-foreground text-xs font-normal">
              (optional)
            </span>
          </Label>
          <Textarea
            id="cancel-reason"
            placeholder="e.g. Paid in cash instead, entered wrong amount…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="resize-none"
          />
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Keep Payment
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(reason.trim() || undefined)}
            disabled={isPending}
            loading={isPending}
          >
            <XCircle className="h-3.5 w-3.5" />
            Cancel Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PaymentDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();

  const { data: payment, isLoading } = usePayment(id);
  const { mutate: reconcile, isPending: reconciling } = useReconcilePayment();
  const { mutate: reject, isPending: rejecting } = useRejectPayment();
  const { mutate: cancel, isPending: cancelling } = useCancelPayment();
  const perms = usePermissions();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

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

  const state = payment.state as string;
  const stateCfg = STATE_CONFIG[state] ?? STATE_CONFIG.pending;
  const StateIcon = stateCfg.icon;

  const canReconcile = IN_PROGRESS.has(state);

  // Reject: org staff only (owner / caretaker / manager / superadmin).
  // canManageOrg covers owner + manager + superadmin; add isCaretaker explicitly.
  const isOrgStaff = perms.canManageOrg || perms.isCaretaker;
  const canReject = REJECTABLE.has(state) && isOrgStaff;

  // Cancel: tenant (self-service) or superadmin (on behalf of tenant), only in early pre-reconciliation states.
  const canCancel = CANCELLABLE.has(state) && (perms.isTenant || perms.isSuperAdmin);

  function handleReject(reason: string) {
    if (!payment?.leaseId) return;
    reject(
      { leaseId: payment.leaseId, paymentId: payment.id, reason },
      { onSuccess: () => setRejectOpen(false) },
    );
  }

  function handleCancel(reason?: string) {
    if (!payment?.leaseId) return;
    cancel(
      { leaseId: payment.leaseId, paymentId: payment.id, reason },
      { onSuccess: () => setCancelOpen(false) },
    );
  }

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

        {/* Action buttons — shown based on state + role */}
        <div className="flex items-center gap-2 flex-wrap">
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

          {canReject && (
            <Button
              size="sm"
              variant="outline"
              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:hover:bg-red-950/30"
              onClick={() => setRejectOpen(true)}
            >
              <Ban className="h-3.5 w-3.5" />
              Reject
            </Button>
          )}

          {canCancel && (
            <Button
              size="sm"
              variant="outline"
              className="border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/40"
              onClick={() => setCancelOpen(true)}
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancel Payment
            </Button>
          )}
        </div>
      </div>

      {/* ── Rejection / Cancellation notice banners ───────── */}
      {state === "rejected" && payment.rejectionReason && (
        <div className="rounded-[6px] border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20 px-4 py-3 flex gap-3">
          <Ban className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5 min-w-0">
            <p className="text-sm font-medium text-red-700 dark:text-red-400">
              Payment rejected
              {payment.rejectedAt && (
                <span className="font-normal text-red-600/80 ml-2">
                  — {formatDate(payment.rejectedAt)}
                </span>
              )}
            </p>
            <p className="text-xs text-red-600/80 dark:text-red-400/70 break-words">
              {payment.rejectionReason}
            </p>
          </div>
        </div>
      )}

      {state === "cancelled" && (
        <div className="rounded-[6px] border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/30 px-4 py-3 flex gap-3">
          <XCircle className="h-4 w-4 text-gray-500 shrink-0 mt-0.5" />
          <div className="space-y-0.5 min-w-0">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Payment cancelled by tenant
              {payment.cancelledAt && (
                <span className="font-normal text-gray-500 ml-2">
                  — {formatDate(payment.cancelledAt)}
                </span>
              )}
            </p>
            {payment.cancellationReason && (
              <p className="text-xs text-gray-500 break-words">
                {payment.cancellationReason}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Amount hero ──────────────────────────────────────── */}
      <div className="rounded-[6px] border bg-gradient-to-br from-emerald-50 to-background dark:from-emerald-950/20 dark:to-background p-6 flex items-center justify-between gap-4">
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
            "h-16 w-16 rounded-[8px] flex items-center justify-center shrink-0",
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
            {payment.rejectedAt && (
              <>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rejected At</span>
                  <span className="text-red-600">{formatDate(payment.rejectedAt)}</span>
                </div>
              </>
            )}
            {payment.cancelledAt && (
              <>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cancelled At</span>
                  <span className="text-gray-600">{formatDate(payment.cancelledAt)}</span>
                </div>
              </>
            )}

            {/* Visual timeline */}
            <div className="pt-2">
              <div className="flex items-center gap-2">
                {[
                  { label: "Created", done: true },
                  { label: "Paid", done: !!payment.paidAt },
                  {
                    label: "Completed",
                    done: SUCCESS_STATES.has(state),
                  },
                  { label: "Refunded", done: state === "refunded" },
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

      {/* ── Dialogs ────────────────────────────────────────── */}
      <RejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        onConfirm={handleReject}
        isPending={rejecting}
      />
      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onConfirm={handleCancel}
        isPending={cancelling}
      />
    </div>
  );
}
