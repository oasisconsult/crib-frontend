"use client";

import { Download, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/utils/formatters";
import { useLedger } from "@/hooks/usePayments";
import { Skeleton } from "@/components/ui/skeleton";
import type { LedgerEntry } from "@/types";

const COLUMNS: Column<LedgerEntry>[] = [
  {
    key: "date",
    header: "Date",
    sortable: true,
    render: (e) => <span className="text-sm">{formatDate(e.date)}</span>,
  },
  {
    key: "description",
    header: "Description",
    render: (e) => (
      <div>
        <p className="text-sm font-medium">{e.description}</p>
        {e.reference && (
          <p className="text-xs text-muted-foreground font-mono">{e.reference}</p>
        )}
      </div>
    ),
  },
  {
    key: "category",
    header: "Category",
    render: (e) => (
      <Badge variant="slate" className="capitalize text-xs">
        {e.category.replace("_", " ")}
      </Badge>
    ),
  },
  {
    key: "debit",
    header: "Debit",
    className: "text-right",
    render: (e) =>
      e.debit > 0 ? (
        <span className="text-sm text-red-600 font-medium">
          {formatCurrency(e.debit, e.currency)}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: "credit",
    header: "Credit",
    className: "text-right",
    render: (e) =>
      e.credit > 0 ? (
        <span className="text-sm text-emerald-600 font-medium">
          {formatCurrency(e.credit, e.currency)}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: "balance",
    header: "Balance",
    className: "text-right",
    render: (e) => (
      <div className="flex items-center justify-end gap-1">
        {e.balance > 0 ? (
          <TrendingUp className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
        ) : (
          <TrendingDown className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
        )}
        <span className={`text-sm font-semibold ${e.balance > 0 ? "text-red-600" : "text-emerald-600"}`}>
          {formatCurrency(Math.abs(e.balance), e.currency)}
          {e.balance > 0 ? " owed" : " credit"}
        </span>
      </div>
    ),
  },
];

interface LedgerViewProps {
  tenantId: string;
  tenantName?: string;
}

export function LedgerView({ tenantId, tenantName }: LedgerViewProps) {
  const { data: entries, isLoading } = useLedger(tenantId);

  const currentBalance = entries?.[entries.length - 1]?.balance ?? 0;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
        ) : (
          <>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Current Balance</p>
                <p className={`text-xl font-bold mt-1 ${currentBalance > 0 ? "text-red-600" : "text-emerald-600"}`}>
                  {formatCurrency(Math.abs(currentBalance))}
                </p>
                <p className="text-xs text-muted-foreground">{currentBalance > 0 ? "Amount owed" : "In credit"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Paid</p>
                <p className="text-xl font-bold mt-1 text-emerald-600">
                  {formatCurrency(entries?.reduce((sum, e) => sum + e.credit, 0) ?? 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Transactions</p>
                <p className="text-xl font-bold mt-1">{entries?.length ?? 0}</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Ledger {tenantName ? `— ${tenantName}` : ""}
            </CardTitle>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            data={entries ?? []}
            columns={COLUMNS}
            loading={isLoading}
            rowKey={(e) => e.id}
            emptyTitle="No ledger entries"
          />
        </CardContent>
      </Card>
    </div>
  );
}
