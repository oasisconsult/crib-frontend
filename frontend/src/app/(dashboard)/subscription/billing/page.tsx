"use client";

import { useState } from "react";
import { FileText, CreditCard, CheckCircle2, Clock, XCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/PageHeader";
import { usePaymentHistory, useInvoices } from "@/hooks/useSubscription";
import { cn } from "@/utils/cn";
import type { SubscriptionPayment, SubscriptionInvoice } from "@/services/api/subscriptions";

function formatAmount(amount: number, currency: string) {
  if (currency === "UGX") return `UGX ${amount.toLocaleString()}`;
  return `$${(amount / 100).toFixed(2)}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" });
}

const PAYMENT_STATUS_CONFIG = {
  pending:              { label: "Pending",     variant: "secondary" as const,   icon: Clock },
  pending_verification: { label: "Verifying",   variant: "warning" as const,     icon: Clock },
  verified:             { label: "Verified",    variant: "success" as const,     icon: CheckCircle2 },
  rejected:             { label: "Rejected",    variant: "destructive" as const, icon: XCircle },
  refunded:             { label: "Refunded",    variant: "outline" as const,     icon: XCircle },
};

const INVOICE_STATUS_CONFIG = {
  draft:   { label: "Draft",   variant: "secondary" as const },
  issued:  { label: "Issued",  variant: "warning" as const },
  paid:    { label: "Paid",    variant: "success" as const },
  void:    { label: "Void",    variant: "outline" as const },
  overdue: { label: "Overdue", variant: "destructive" as const },
};

const METHOD_LABELS: Record<string, string> = {
  mtn_momo: "MTN MoMo", airtel_money: "Airtel Money",
  bank_transfer: "Bank Transfer", cash: "Cash",
};

function PaymentRow({ p }: { p: SubscriptionPayment }) {
  const cfg = PAYMENT_STATUS_CONFIG[p.status] ?? PAYMENT_STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-muted">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}</p>
          <p className="text-xs text-muted-foreground">{formatDate(p.submittedAt)} {p.transactionReference && `· ${p.transactionReference}`}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-foreground">{formatAmount(p.amount, p.currency)}</span>
        <Badge variant={cfg.variant as any} className="flex items-center gap-1 text-[10px]">
          <Icon className="h-3 w-3" />{cfg.label}
        </Badge>
      </div>
    </div>
  );
}

function InvoiceRow({ inv }: { inv: SubscriptionInvoice }) {
  const cfg = INVOICE_STATUS_CONFIG[inv.status] ?? INVOICE_STATUS_CONFIG.issued;
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-muted">
          <FileText className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{inv.invoiceNumber}</p>
          <p className="text-xs text-muted-foreground">{formatDate(inv.createdAt)}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-foreground">{formatAmount(inv.total, inv.currency)}</span>
        <Badge variant={cfg.variant as any} className="text-[10px]">{cfg.label}</Badge>
        <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
          <Link href={`/subscription/invoices/${inv.id}`}>View</Link>
        </Button>
      </div>
    </div>
  );
}

export default function BillingPage() {
  const [tab, setTab] = useState<"payments" | "invoices">("payments");
  const { data: paymentsData, isLoading: loadingPayments } = usePaymentHistory(20, 0);
  const { data: invoicesData, isLoading: loadingInvoices } = useInvoices(20, 0);

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Billing History"
        description="Your payment submissions and invoices."
        actions={
          <Button asChild size="sm">
            <Link href="/subscription/pay"><CreditCard className="h-4 w-4" /> Make Payment</Link>
          </Button>
        }
      />

      {/* Tabs */}
      <div className="flex items-center rounded-[var(--radius-md)] border border-border bg-muted/40 p-1 w-fit gap-1">
        {(["payments", "invoices"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-1.5 text-sm font-medium rounded-[var(--radius-sm)] transition-all capitalize",
              tab === t ? "bg-card shadow-[var(--shadow-sm)] text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="pt-4">
          {tab === "payments" && (
            loadingPayments ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : !paymentsData?.data.length ? (
              <div className="text-center py-12">
                <CreditCard className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground">No payments yet.</p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href="/subscription/pay">Make your first payment</Link>
                </Button>
              </div>
            ) : (
              <div>{paymentsData.data.map(p => <PaymentRow key={p.id} p={p} />)}</div>
            )
          )}

          {tab === "invoices" && (
            loadingInvoices ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : !invoicesData?.data.length ? (
              <div className="text-center py-12">
                <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground">No invoices yet.</p>
              </div>
            ) : (
              <div>{invoicesData.data.map(inv => <InvoiceRow key={inv.id} inv={inv} />)}</div>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
