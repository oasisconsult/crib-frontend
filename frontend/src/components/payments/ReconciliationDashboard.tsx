"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Phone,
  Banknote,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate, formatRelative } from "@/utils/formatters";
import { useMobileMoneyTransactions } from "@/hooks/usePayments";
import type { MobileMoneyTransaction } from "@/types";

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; className: string }
> = {
  pending: {
    label: "Pending",
    icon: Clock,
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  received: {
    label: "Received",
    icon: Banknote,
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  matched: {
    label: "Matched",
    icon: CheckCircle2,
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  unmatched: {
    label: "Unmatched",
    icon: AlertTriangle,
    className: "bg-orange-50 text-orange-700 border-orange-200",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    className: "bg-red-50 text-red-700 border-red-200",
  },
  expired: {
    label: "Expired",
    icon: XCircle,
    className: "bg-slate-100 text-slate-600 border-slate-200",
  },
};

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.className}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

// ── Summary cards ─────────────────────────────────────────────────────────────

interface SummaryProps {
  data: MobileMoneyTransaction[] | undefined;
  isLoading: boolean;
}

function SummaryCards({ data, isLoading }: SummaryProps) {
  const txns = data ?? [];

  const counts = {
    pending: txns.filter((t) => t.status === "pending").length,
    received: txns.filter((t) => t.status === "received").length,
    matched: txns.filter((t) => t.status === "matched").length,
    unmatched: txns.filter((t) => t.status === "unmatched").length,
  };

  const totalMatched = txns
    .filter((t) => t.status === "matched")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalUnmatched = txns
    .filter((t) => t.status === "unmatched")
    .reduce((sum, t) => sum + t.amount, 0);

  const firstCurrency = txns[0]?.currency ?? "UGX";

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-[6px]" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Pending</p>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-1 text-2xl font-bold">{counts.pending}</p>
          <p className="text-xs text-muted-foreground">awaiting PIN</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Unmatched</p>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </div>
          <p className="mt-1 text-2xl font-bold text-orange-600">
            {counts.unmatched}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatCurrency(totalUnmatched, firstCurrency)} needs review
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Matched</p>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-1 text-2xl font-bold text-emerald-600">
            {counts.matched}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatCurrency(totalMatched, firstCurrency)} allocated
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Received</p>
            <Banknote className="h-4 w-4 text-blue-500" />
          </div>
          <p className="mt-1 text-2xl font-bold">{counts.received}</p>
          <p className="text-xs text-muted-foreground">matching queued</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Transactions table ────────────────────────────────────────────────────────

const COLUMNS: Column<MobileMoneyTransaction>[] = [
  {
    key: "createdAt",
    header: "Time",
    sortable: true,
    render: (t) => (
      <div>
        <p className="text-xs font-medium">{formatDate(t.createdAt)}</p>
        <p className="text-xs text-muted-foreground">
          {formatRelative(t.createdAt)}
        </p>
      </div>
    ),
  },
  {
    key: "provider",
    header: "Provider",
    render: (t) => (
      <Badge
        variant={t.provider === "MTN" ? "warning" : "destructive"}
        className="text-xs font-semibold"
      >
        {t.provider}
      </Badge>
    ),
  },
  {
    key: "phoneNumber",
    header: "Phone",
    render: (t) => (
      <span className="font-mono text-xs">{t.phoneNumber}</span>
    ),
  },
  {
    key: "amount",
    header: "Amount",
    sortable: true,
    className: "text-right",
    render: (t) => (
      <span className="font-semibold">
        {formatCurrency(t.amount, t.currency)}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (t) => <StatusPill status={t.status} />,
  },
  {
    key: "externalId",
    header: "External ID",
    render: (t) => (
      <span className="font-mono text-xs text-muted-foreground truncate max-w-[140px] block">
        {t.externalId}
      </span>
    ),
  },
  {
    key: "matchedPaymentId",
    header: "Payment",
    render: (t) =>
      t.matchedPaymentId ? (
        <span className="font-mono text-xs text-emerald-600 truncate max-w-[100px] block">
          {t.matchedPaymentId.slice(0, 8)}…
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  },
];

// ── Main component ────────────────────────────────────────────────────────────

export function ReconciliationDashboard() {
  const [tab, setTab] = useState<string>("all");
  const [provider, setProvider] = useState<string | undefined>(undefined);

  const statusFilter = tab === "all" ? undefined : tab;
  const { data: page, isLoading, refetch, isFetching } = useMobileMoneyTransactions({
    status: statusFilter,
    provider,
  });

  const txns = page?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Mobile Money Reconciliation
          </h1>
          <p className="text-sm text-muted-foreground">
            Real-time view of MTN MoMo and Airtel Money inbound transactions.
            Refreshes every 30 seconds.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw
            className={`mr-1.5 h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <SummaryCards data={page?.data} isLoading={isLoading} />

      {/* Provider filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Provider:</span>
        {(["all", "MTN", "AIRTEL"] as const).map((p) => (
          <Button
            key={p}
            variant={provider === (p === "all" ? undefined : p) ? "default" : "outline"}
            size="sm"
            onClick={() => setProvider(p === "all" ? undefined : p)}
          >
            {p === "all" ? "All" : p}
          </Button>
        ))}
      </div>

      {/* Tabs + table */}
      <Card>
        <CardHeader className="pb-0">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-9">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="unmatched">
                Unmatched
                {(page?.data?.filter((t) => t.status === "unmatched").length ?? 0) > 0 && (
                  <span className="ml-1.5 rounded-full bg-orange-500 px-1.5 py-0.5 text-xs text-white">
                    {page?.data?.filter((t) => t.status === "unmatched").length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="matched">Matched</TabsTrigger>
              <TabsTrigger value="failed">Failed</TabsTrigger>
            </TabsList>

            <TabsContent value={tab} className="mt-0">
              <DataTable
                data={txns}
                columns={COLUMNS}
                loading={isLoading}
                rowKey={(t) => t.id}
                emptyTitle="No transactions"
                emptyDescription={
                  tab === "unmatched"
                    ? "All mobile money transactions have been matched."
                    : "No transactions in this category."
                }
              />
            </TabsContent>
          </Tabs>
        </CardHeader>
      </Card>

      {/* Pagination info */}
      {page && page.total > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Showing {txns.length} of {page.total} transactions
        </p>
      )}
    </div>
  );
}
