"use client";

import Link from "next/link";
import { AlertCircle, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatCurrency, formatDate, formatRelative } from "@/utils/formatters";
import { usePayments } from "@/hooks/usePayments";
import { Skeleton } from "@/components/ui/skeleton";

export function PendingRentWidget() {
  const { data, isLoading } = usePayments({ filters: [{ field: "state", operator: "in", value: ["pending", "overdue"] }] });

  const items = data?.data.slice(0, 5) ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            Pending Payments
          </CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/payments">
              View all <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {isLoading ? (
          <div className="px-6 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : items.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">All payments up to date ✓</p>
        ) : (
          <ul aria-label="Pending payments">
            {items.map((payment) => (
              <li
                key={payment.id}
                className="flex items-center justify-between px-6 py-3 border-t hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">Tenant #{payment.tenantId.slice(-4)}</p>
                  <p className="text-xs text-muted-foreground">
                    Due {formatDate(payment.dueDate)} · {formatRelative(payment.dueDate)}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  <StatusBadge state={payment.state as "pending"} domain="payment" />
                  <span className="text-sm font-semibold">
                    {formatCurrency(payment.amount, payment.currency)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
