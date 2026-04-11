"use client";

import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/utils/formatters";
import { usePayments } from "@/hooks/usePayments";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";

function TenantAvatar({ id }: { id: string }) {
  const initials = id.replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase() || "TN";
  return (
    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
      {initials}
    </div>
  );
}

const STATE_CONFIG: Record<
  string,
  { label: string; variant: "destructive" | "warning" | "success" | "outline" }
> = {
  pending: { label: "Pending", variant: "warning" },
  confirmed: { label: "Confirmed", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
  refunded: { label: "Refunded", variant: "outline" },
};

export function PendingRentWidget() {
  const { data, isLoading } = usePayments({
    filters: [{ field: "state", operator: "eq", value: "pending" }],
  });

  const items = data?.data.slice(0, 6) ?? [];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2 truncate">
            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="truncate">Recent Transactions</span>
          </CardTitle>
          <Button variant="ghost" size="sm" asChild className="h-7 px-2 text-xs gap-1 shrink-0">
            <Link href="/payments">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="px-4 sm:px-6 pb-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-5 w-14 rounded-full shrink-0" />
                <Skeleton className="h-4 w-20 shrink-0" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-center px-4">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <p className="text-sm font-medium">All payments up to date</p>
            <p className="text-xs text-muted-foreground">No pending payments</p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="hidden sm:grid grid-cols-[1fr_auto_auto] gap-4 px-4 sm:px-6 py-2 text-xs font-medium text-muted-foreground border-b">
              <span>Payment</span>
              <span>Status</span>
              <span className="text-right">Amount</span>
            </div>
            <ul className="divide-y divide-border">
              {items.map((payment, i) => {
                const sc = STATE_CONFIG[payment.state] ?? STATE_CONFIG.pending;
                return (
                  <li
                    key={payment.id}
                    className="grid sm:grid-cols-[1fr_auto_auto] gap-3 sm:gap-4 items-center px-4 sm:px-6 py-3 transition-colors hover:bg-muted/30"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {payment.reference ?? "Payment"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        Lease {payment.leaseId} · {payment.category?.replace(/_/g, " ")}
                      </p>
                    </div>
                    <Badge variant={sc.variant} className="text-xs w-fit shrink-0">
                      {sc.label}
                    </Badge>
                    <span className="text-sm font-semibold text-right shrink-0 min-w-0">
                      {formatCurrency(payment.amount, payment.currency)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
