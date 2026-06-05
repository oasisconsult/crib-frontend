"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, Loader2, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/PageHeader";
import { useInvoiceById } from "@/hooks/useSubscription";

function formatCurrency(amount: number, currency: string) {
  if (currency === "UGX") return `UGX ${amount.toLocaleString()}`;
  return `$${(amount / 100).toFixed(2)}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-UG", { day: "numeric", month: "long", year: "numeric" });
}

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "outline" | "secondary"> = {
  paid:    "success",
  issued:  "warning",
  draft:   "secondary",
  void:    "outline",
  overdue: "destructive",
};

export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: inv, isLoading, isError } = useInvoiceById(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !inv) {
    return (
      <div className="space-y-4 max-w-2xl">
        <Button asChild variant="ghost" size="sm">
          <Link href="/subscription/billing"><ArrowLeft className="h-4 w-4" /> Back</Link>
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <FileText className="h-10 w-10 text-muted-foreground opacity-40" />
            <p className="font-semibold">Invoice not found</p>
            <p className="text-sm text-muted-foreground">This invoice may have been removed or you don't have access.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusVariant = STATUS_VARIANT[inv.status] ?? "outline";

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title={`Invoice ${inv.invoiceNumber}`}
        description={`Issued ${formatDate(inv.createdAt)}`}
        actions={
          <div className="flex gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/subscription/billing"><ArrowLeft className="h-4 w-4" /> Back</Link>
            </Button>
            {inv.pdfFileKey && (
              <Button asChild variant="outline" size="sm">
                <a href={`/api/v1/uploads/${inv.pdfFileKey}`} target="_blank" rel="noopener noreferrer">
                  <Download className="h-4 w-4" /> Download PDF
                </a>
              </Button>
            )}
          </div>
        }
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Invoice Details
          </CardTitle>
          <Badge variant={statusVariant} className="capitalize">{inv.status}</Badge>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <span className="text-muted-foreground">Invoice Number</span>
            <span className="font-mono font-medium">{inv.invoiceNumber}</span>

            <span className="text-muted-foreground">Billing Period</span>
            <span>
              {inv.periodStart && inv.periodEnd
                ? `${formatDate(inv.periodStart)} – ${formatDate(inv.periodEnd)}`
                : "—"}
            </span>

            <span className="text-muted-foreground">Due Date</span>
            <span>{formatDate(inv.dueDate)}</span>

            {inv.paidAt && (
              <>
                <span className="text-muted-foreground">Paid On</span>
                <span className="text-emerald-600 font-medium">{formatDate(inv.paidAt)}</span>
              </>
            )}
          </div>

          <div className="border-t pt-3 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(inv.subtotal, inv.currency)}</span>
            </div>
            {inv.taxAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span>{formatCurrency(inv.taxAmount, inv.currency)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-base pt-1 border-t">
              <span>Total</span>
              <span>{formatCurrency(inv.total, inv.currency)}</span>
            </div>
          </div>

          {inv.notes && (
            <div className="border-t pt-3">
              <p className="text-muted-foreground text-xs mb-1">Notes</p>
              <p className="text-sm">{inv.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
