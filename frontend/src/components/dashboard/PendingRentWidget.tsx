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

const STATE_CONFIG: Record<string, { label: string; variant: "destructive" | "warning" | "success" | "outline" }> = {
  pending:  { label: "Pending",  variant: "warning"     },
  overdue:  { label: "Overdue",  variant: "destructive" },
  completed:{ label: "Paid",     variant: "success"     },
};

export function PendingRentWidget() {
  const { data, isLoading } = usePayments({
    filters: [{ field: "state", operator: "in", value: ["pending", "overdue"] }],
  });

  const items = data?.data.slice(0, 6) ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            Recent Transactions
          </CardTitle>
          <Button variant="ghost" size="sm" asChild className="h-7 px-2 text-xs gap-1">
            <Link href="/payments">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="px-6 pb-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <p className="text-sm font-medium">All payments up to date</p>
            <p className="text-xs text-muted-foreground">No pending or overdue rent</p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="hidden sm:grid grid-cols-[auto_1fr_auto_auto] gap-4 px-6 py-2 text-xs font-medium text-muted-foreground border-b">
              <span className="w-8" />
              <span>Tenant</span>
              <span>Status</span>
              <span className="text-right">Amount</span>
            </div>
            <ul>
              {items.map((payment, i) => {
                const sc = STATE_CONFIG[payment.state] ?? STATE_CONFIG.pending;
                return (
                  <li
                    key={payment.id}
                    className={cn(
                      "grid sm:grid-cols-[auto_1fr_auto_auto] gap-3 sm:gap-4 items-center px-6 py-3 transition-colors hover:bg-muted/30",
                      i > 0 && "border-t",
                    )}
                  >
                    <TenantAvatar id={payment.tenantId} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        Tenant {payment.tenantId.replace("tenant-", "#")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Due {formatDate(payment.dueDate)} · {payment.type}
                      </p>
                    </div>
                    <Badge variant={sc.variant} className="text-xs w-fit shrink-0">
                      {sc.label}
                    </Badge>
                    <span className={cn(
                      "text-sm font-semibold text-right shrink-0",
                      payment.state === "overdue" ? "text-red-600" : "text-foreground",
                    )}>
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
