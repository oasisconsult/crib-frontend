"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CreditCard,
  Banknote,
  Calendar,
  User,
  FileText,
  Building2,
  Home,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Receipt,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PageSkeleton } from "@/components/common/LoadingSkeleton";
import { formatCurrency, formatDate } from "@/utils/formatters";
import { usePayment, useReconcilePayment } from "@/hooks/usePayments";
import { useTenant } from "@/hooks/useTenants";
import { useProperty, useUnit } from "@/hooks/useProperties";
import { useLease } from "@/hooks/useLeases";
import { toast } from "@/store/useUIStore";
import { cn } from "@/utils/cn";
import type { PaymentState } from "@/types/states";

interface Props {
  params: Promise<{ id: string }>;
}

// ── State config ──────────────────────────────────────────────────────────────

const STATE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  pending:     { label: "Pending",     color: "text-amber-700",   bg: "bg-amber-100 dark:bg-amber-950/40",   icon: Clock         },
  completed:   { label: "Completed",   color: "text-emerald-700", bg: "bg-emerald-100 dark:bg-emerald-950/40", icon: CheckCircle2  },
  paid:        { label: "Paid",        color: "text-emerald-700", bg: "bg-emerald-100 dark:bg-emerald-950/40", icon: CheckCircle2  },
  overdue:     { label: "Overdue",     color: "text-red-700",     bg: "bg-red-100 dark:bg-red-950/40",       icon: AlertTriangle },
  failed:      { label: "Failed",      color: "text-red-700",     bg: "bg-red-100 dark:bg-red-950/40",       icon: AlertTriangle },
  reconciled:  { label: "Reconciled",  color: "text-violet-700",  bg: "bg-violet-100 dark:bg-violet-950/40", icon: CheckCircle2  },
  refunded:    { label: "Refunded",    color: "text-orange-700",  bg: "bg-orange-100 dark:bg-orange-950/40", icon: Receipt       },
};

// ── Method label ──────────────────────────────────────────────────────────────

function methodLabel(method?: string | null): string {
  if (!method) return "—";
  const MAP: Record<string, string> = {
    mobile_money_mtn:    "MTN Mobile Money",
    mobile_money_airtel: "Airtel Money",
    bank_transfer:       "Bank Transfer",
    card:                "Card",
    cash:                "Cash",
    direct_debit:        "Direct Debit",
    cheque:              "Cheque",
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
      onClick={() => { navigator.clipboard.writeText(value); toast.success("Copied"); }}
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
  const router  = useRouter();

  const { data: payment, isLoading } = usePayment(id);
  const { mutate: reconcile, isPending: reconciling } = useReconcilePayment();

  // Related data — only fetch when IDs are known
  const { data: tenant }   = useTenant(payment?.tenantId ?? "");
  const { data: property } = useProperty(payment?.propertyId ?? "");
  const { data: unit }     = useUnit(payment?.propertyId ?? "", payment?.unitId ?? "");
  const { data: lease }    = useLease(payment?.leaseId ?? "");

  if (isLoading) return <PageSkeleton />;
  if (!payment) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <CreditCard className="h-12 w-12 text-muted-foreground" />
        <p className="text-sm font-medium">Payment not found</p>
        <Button variant="outline" size="sm" onClick={() => router.back()}>Go back</Button>
      </div>
    );
  }

  const stateCfg    = STATE_CONFIG[payment.state] ?? STATE_CONFIG.pending;
  const StateIcon   = stateCfg.icon;
  const canReconcile = payment.state === "completed";

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
              <h1 className="text-xl font-bold tracking-tight font-mono">{payment.reference}</h1>
              <span className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                stateCfg.color, stateCfg.bg,
              )}>
                <StateIcon className="h-3 w-3" />
                {stateCfg.label}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 capitalize">
              {categoryLabel(payment)} payment
              {payment.dueDate && ` · Due ${formatDate(payment.dueDate)}`}
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
            Mark Reconciled
          </Button>
        )}
      </div>

      {/* ── Amount hero ──────────────────────────────────────── */}
      <div className="rounded-xl border bg-gradient-to-br from-emerald-50 to-background dark:from-emerald-950/20 dark:to-background p-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Amount</p>
          <p className="text-4xl font-bold text-emerald-600 mt-1">
            {formatCurrency(payment.amount, payment.currency)}
          </p>
          <p className="text-sm text-muted-foreground mt-1 capitalize">{categoryLabel(payment)}</p>
        </div>
        <div className={cn("h-16 w-16 rounded-2xl flex items-center justify-center shrink-0", stateCfg.bg)}>
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
                <CopyButton value={payment.reference} />
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
            {(payment as any).externalReference && (
              <>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">External Ref</span>
                  <span className="font-mono text-xs flex items-center">
                    {(payment as any).externalReference}
                    <CopyButton value={(payment as any).externalReference} />
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
            <div className="flex justify-between">
              <span className="text-muted-foreground">Due Date</span>
              <span className={cn(
                payment.state === "overdue" && "text-red-600 font-medium",
              )}>
                {formatDate(payment.dueDate)}
              </span>
            </div>
            {payment.paidAt && (
              <>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Paid On</span>
                  <span className="text-emerald-600 font-medium">{formatDate(payment.paidAt)}</span>
                </div>
              </>
            )}
            {payment.reconciledAt && (
              <>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reconciled</span>
                  <span>{formatDate(payment.reconciledAt)}</span>
                </div>
              </>
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
                  { label: "Created",    done: true },
                  { label: "Paid",       done: !!payment.paidAt },
                  { label: "Completed",  done: payment.state === "completed" || payment.state === "reconciled" },
                  { label: "Reconciled", done: payment.state === "reconciled" },
                ].map((s, i, arr) => (
                  <div key={s.label} className="flex items-center gap-1">
                    {i > 0 && <div className={cn("h-px w-4 shrink-0", s.done ? "bg-emerald-400" : "bg-border")} />}
                    <div className="flex flex-col items-center gap-0.5">
                      <div className={cn(
                        "h-2 w-2 rounded-full",
                        s.done ? "bg-emerald-500" : "bg-muted-foreground/30",
                      )} />
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">{s.label}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Related parties ────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Related Parties
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {/* Tenant */}
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Tenant</span>
              {tenant ? (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-sm"
                  onClick={() => router.push(`/tenants/${payment.tenantId}`)}
                >
                  {tenant.firstName} {tenant.lastName}
                </Button>
              ) : (
                <span className="font-mono text-xs">{payment.tenantId}</span>
              )}
            </div>
            <Separator />
            {/* Lease */}
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Lease</span>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-sm font-mono text-xs"
                onClick={() => router.push(`/leases/${payment.leaseId}`)}
              >
                <FileText className="h-3.5 w-3.5 mr-1" />
                {lease?.reference ?? payment.leaseId}
              </Button>
            </div>
            {payment.propertyId && (
              <>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Property</span>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-sm"
                    onClick={() => router.push(`/properties/${payment.propertyId}`)}
                  >
                    <Building2 className="h-3.5 w-3.5 mr-1" />
                    {property?.name ?? payment.propertyId}
                  </Button>
                </div>
              </>
            )}
            {payment.unitId && (
              <>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Unit</span>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-sm"
                    onClick={() => router.push(`/properties/${payment.propertyId}/units/${payment.unitId}`)}
                  >
                    <Home className="h-3.5 w-3.5 mr-1" />
                    {unit?.name ?? payment.unitId}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Notes / receipt ────────────────────────────────── */}
        {(payment.notes || payment.receiptUrl) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Notes & Receipt
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {payment.notes && (
                <p className="text-muted-foreground leading-relaxed">{payment.notes}</p>
              )}
              {payment.receiptUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={payment.receiptUrl} target="_blank" rel="noopener noreferrer">
                    <Receipt className="h-3.5 w-3.5" />
                    View Receipt
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Overdue warning ──────────────────────────────────── */}
      {payment.state === "overdue" && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20 px-4 py-3 text-sm text-red-800 dark:text-red-200">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Payment overdue</p>
            <p className="text-xs mt-0.5 text-red-700 dark:text-red-300">
              This payment was due on {formatDate(payment.dueDate)} and has not been received.
              A late fee may apply.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
