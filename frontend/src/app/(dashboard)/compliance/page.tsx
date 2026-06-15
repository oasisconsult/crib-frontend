"use client";

import { useState, useCallback, useEffect } from "react";
import {
  AlertCircle,
  Clock,
  CheckCircle2,
  RefreshCw,
  ReceiptText,
  ShieldCheck,
  SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { formatCurrency, formatDate, formatDateTime } from "@/utils/formatters";
import { useOrganisation } from "@/hooks/useOrganisation";
import { efrisApi, type EfrisCompliancePayment } from "@/services/api/efris";
import { toast } from "@/store/useUIStore";
import type { PaginatedResponse } from "@/types";

const PAGE_SIZE = 20;

type EfrisTab = "all" | "issued" | "failed" | "pending" | "skipped";

// ── Status badge ───────────────────────────────────────────────────────────────

function EfrisStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>;

  const config: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    issued: {
      label: "Issued",
      className: "bg-green-50 text-green-700 border-green-200",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    failed: {
      label: "Failed",
      className: "bg-red-50 text-red-700 border-red-200",
      icon: <AlertCircle className="h-3 w-3" />,
    },
    pending: {
      label: "Pending",
      className: "bg-yellow-50 text-yellow-700 border-yellow-200",
      icon: <Clock className="h-3 w-3" />,
    },
    skipped: {
      label: "Skipped",
      className: "bg-slate-50 text-slate-600 border-slate-200",
      icon: <SkipForward className="h-3 w-3" />,
    },
  };

  const c = config[status] ?? {
    label: status,
    className: "bg-slate-50 text-slate-600 border-slate-200",
    icon: null,
  };

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border ${c.className}`}
    >
      {c.icon}
      {c.label}
    </span>
  );
}

// ── Receipt cell ───────────────────────────────────────────────────────────────

function ReceiptCell({ receipt }: { receipt: EfrisCompliancePayment }) {
  if (receipt.efrisReceiptNumber) {
    return (
      <span className="font-mono text-xs text-green-700">
        {receipt.efrisReceiptNumber}
      </span>
    );
  }
  if (receipt.efrisStatus === "failed" && receipt.efrisFailureReason) {
    return (
      <span className="text-xs text-red-600 max-w-[200px] truncate block" title={receipt.efrisFailureReason}>
        {receipt.efrisFailureReason}
      </span>
    );
  }
  return <span className="text-muted-foreground text-xs">—</span>;
}

// ── Columns ────────────────────────────────────────────────────────────────────

function buildColumns(
  onRetry: (p: EfrisCompliancePayment) => void,
  retrying: string | null,
): Column<EfrisCompliancePayment>[] {
  return [
    {
      key: "reference",
      header: "Reference",
      render: (p) => (
        <span className="font-mono text-xs">{p.reference ?? "—"}</span>
      ),
    },
    {
      key: "tenantName",
      header: "Tenant",
      render: (p) => (
        <span className="text-sm">{p.tenantName ?? "—"}</span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      render: (p) => (
        <span className="font-medium text-sm">
          {formatCurrency(p.amount, p.currency)}
        </span>
      ),
    },
    {
      key: "paidAt",
      header: "Paid On",
      render: (p) => (
        <span className="text-sm text-muted-foreground">
          {p.paidAt ? formatDate(p.paidAt) : "—"}
        </span>
      ),
    },
    {
      key: "efrisStatus",
      header: "EFRIS Status",
      render: (p) => <EfrisStatusBadge status={p.efrisStatus} />,
    },
    {
      key: "efrisReceiptNumber",
      header: "Receipt / Reason",
      render: (p) => <ReceiptCell receipt={p} />,
    },
    {
      key: "efrisReceiptDate",
      header: "Receipt Date",
      render: (p) => (
        <span className="text-xs text-muted-foreground">
          {p.efrisReceiptDate ? formatDate(p.efrisReceiptDate) : "—"}
        </span>
      ),
    },
    {
      key: "efrisRetryCount",
      header: "Retries",
      render: (p) => (
        <span className="text-xs text-muted-foreground">{p.efrisRetryCount}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (p) =>
        p.efrisStatus === "failed" && !p.efrisReceiptNumber ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={retrying === p.id}
            onClick={() => onRetry(p)}
          >
            {retrying === p.id ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              "Retry"
            )}
          </Button>
        ) : null,
    },
  ];
}

// ── Summary cards ──────────────────────────────────────────────────────────────

function SummaryCards({
  counts,
}: {
  counts: Record<EfrisTab, number>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card className="border-green-100">
        <CardContent className="p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
          <div>
            <p className="text-2xl font-semibold text-green-700">{counts.issued}</p>
            <p className="text-xs text-muted-foreground">Issued</p>
          </div>
        </CardContent>
      </Card>
      <Card className="border-red-100">
        <CardContent className="p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          <div>
            <p className="text-2xl font-semibold text-red-700">{counts.failed}</p>
            <p className="text-xs text-muted-foreground">Failed</p>
          </div>
        </CardContent>
      </Card>
      <Card className="border-yellow-100">
        <CardContent className="p-4 flex items-center gap-3">
          <Clock className="h-5 w-5 text-yellow-600 shrink-0" />
          <div>
            <p className="text-2xl font-semibold text-yellow-700">{counts.pending}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </div>
        </CardContent>
      </Card>
      <Card className="border-slate-100">
        <CardContent className="p-4 flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-slate-500 shrink-0" />
          <div>
            <p className="text-2xl font-semibold text-slate-700">{counts.all}</p>
            <p className="text-xs text-muted-foreground">Total tracked</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function CompliancePage() {
  const { data: org } = useOrganisation();

  const [tab, setTab] = useState<EfrisTab>("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedResponse<EfrisCompliancePayment> | null>(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<EfrisTab, number>>({
    all: 0, issued: 0, failed: 0, pending: 0, skipped: 0,
  });

  const fetchPage = useCallback(
    async (currentTab: EfrisTab, currentPage: number) => {
      if (!org?.id) return;
      setLoading(true);
      try {
        const statusFilter = currentTab === "all" ? undefined : currentTab;
        const result = await efrisApi.getCompliancePayments(
          org.id,
          statusFilter,
          currentPage,
          PAGE_SIZE,
        );
        setData(result);
        // Update count for the current tab
        setCounts((prev) => ({ ...prev, [currentTab]: result.total }));
      } catch {
        toast.error("Failed to load EFRIS compliance data");
      } finally {
        setLoading(false);
      }
    },
    [org?.id],
  );

  // Load summary counts once on mount
  useEffect(() => {
    if (!org?.id) return;
    const tabs: EfrisTab[] = ["all", "issued", "failed", "pending"];
    tabs.forEach((t) => {
      const statusFilter = t === "all" ? undefined : t;
      efrisApi.getCompliancePayments(org.id, statusFilter, 1, 1).then((r) => {
        setCounts((prev) => ({ ...prev, [t]: r.total }));
      }).catch(() => {});
    });
  }, [org?.id]);

  useEffect(() => {
    fetchPage(tab, page);
  }, [fetchPage, tab, page]);

  function handleTabChange(value: string) {
    setTab(value as EfrisTab);
    setPage(1);
  }

  async function handleRetry(p: EfrisCompliancePayment) {
    setRetrying(p.id);
    try {
      await efrisApi.retryPayment(p.leaseId, p.id);
      toast.success("Queued for EFRIS resubmission");
      fetchPage(tab, page);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error("Retry failed", detail ?? "Please try again");
    } finally {
      setRetrying(null);
    }
  }

  const columns = buildColumns(handleRetry, retrying);

  if (!org) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="EFRIS Compliance"
        description="Track URA fiscal receipt submissions for all confirmed payments."
      />

      <SummaryCards counts={counts} />

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
          <TabsTrigger value="issued">Issued ({counts.issued})</TabsTrigger>
          <TabsTrigger value="failed">Failed ({counts.failed})</TabsTrigger>
          <TabsTrigger value="pending">Pending ({counts.pending})</TabsTrigger>
        </TabsList>

        {(["all", "issued", "failed", "pending", "skipped"] as EfrisTab[]).map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            {data && data.items.length === 0 && !loading ? (
              <EmptyState
                icon={ReceiptText}
                title="No transactions found"
                description={
                  t === "failed"
                    ? "No failed EFRIS submissions. All receipts are in order."
                    : "No EFRIS-tracked payments in this category yet."
                }
              />
            ) : (
              <DataTable
                columns={columns}
                data={data?.data ?? []}
                loading={loading}
                rowKey={(p) => p.id}
                totalItems={data?.total}
                currentPage={page}
                onPageChange={setPage}
                pageSize={PAGE_SIZE}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
