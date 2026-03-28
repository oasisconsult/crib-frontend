"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, TrendingUp, AlertTriangle, CheckCircle2, Download, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FilterBar } from "@/components/common/FilterBar";
import { formatCurrency, formatDate } from "@/utils/formatters";
import { usePayments, useDashboardStats } from "@/hooks/usePayments";
import { paymentsApi } from "@/services/api/payments";
import { toast } from "@/store/useUIStore";
import type { Payment } from "@/types";

const COLUMNS: Column<Payment>[] = [
  {
    key: "reference",
    header: "Reference",
    render: (p) => <span className="font-mono text-xs font-medium">{p.reference}</span>,
  },
  {
    key: "state",
    header: "Status",
    render: (p) => <StatusBadge state={p.state} domain="payment" />,
  },
  {
    key: "category",
    header: "Type",
    render: (p) => (
      <span className="text-sm capitalize">
        {((p as any).type ?? p.category ?? "").replace(/_/g, " ")}
      </span>
    ),
  },
  {
    key: "amount",
    header: "Amount",
    sortable: true,
    render: (p) => (
      <span className="font-medium">{formatCurrency(p.amount, p.currency)}</span>
    ),
  },
  {
    key: "dueDate",
    header: "Due Date",
    sortable: true,
    render: (p) => formatDate(p.dueDate),
  },
  {
    key: "paidAt",
    header: "Paid On",
    render: (p) => (p.paidAt ? formatDate(p.paidAt) : "—"),
  },
];

export default function PaymentsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [exporting, setExporting] = useState(false);
  const { data, isLoading } = usePayments();
  const { data: stats } = useDashboardStats();

  const allPayments = data?.data ?? [];

  const payments = allPayments.filter((p) => {
    const state = p.state as string;
    const tabMatch =
      tab === "all" ||
      (tab === "pending" && ["pending", "initiated"].includes(state)) ||
      (tab === "completed" && ["completed", "reconciled"].includes(state)) ||
      (tab === "overdue" && state === "overdue") ||
      (tab === "failed" && state === "failed");
    const searchMatch =
      !search || p.reference.toLowerCase().includes(search.toLowerCase());
    return tabMatch && searchMatch;
  });

  async function handleExport(format: "csv" | "pdf") {
    setExporting(true);
    try {
      const blob = await paymentsApi.exportPayments(undefined, format);
      const url = URL.createObjectURL(blob as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payments-export.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Rent collection, deposits, and payment tracking
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={() => handleExport("csv")}
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={() => handleExport("pdf")}
          >
            <Download className="h-3.5 w-3.5" />
            Export PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: "Expected",
            value: formatCurrency(
              (stats?.monthlyRevenue ?? 0) / ((stats?.collectionRate ?? 100) / 100),
              "UGX",
            ),
            icon: TrendingUp,
            color: "text-blue-600",
            bg: "bg-blue-50 dark:bg-blue-950/30",
          },
          {
            label: "Collected",
            value: formatCurrency(stats?.monthlyRevenue ?? 0, "UGX"),
            icon: CheckCircle2,
            color: "text-emerald-600",
            bg: "bg-emerald-50 dark:bg-emerald-950/30",
          },
          {
            label: "Overdue",
            value: formatCurrency(stats?.overdueAmount ?? 0, "UGX"),
            icon: AlertTriangle,
            color: "text-red-600",
            bg: "bg-red-50 dark:bg-red-950/30",
          },
          {
            label: "Collection Rate",
            value: `${stats?.collectionRate ?? 0}%`,
            icon: CreditCard,
            color: "text-violet-600",
            bg: "bg-violet-50 dark:bg-violet-950/30",
          },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4">
              <div className={`inline-flex p-2 rounded-lg mb-2 ${s.bg}`}>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-lg font-bold mt-0.5 ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search by reference..."
        className="max-w-sm"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="overdue">Overdue</TabsTrigger>
          <TabsTrigger value="failed">Failed</TabsTrigger>
        </TabsList>

        {["all", "pending", "completed", "overdue", "failed"].map((t) => (
          <TabsContent key={t} value={t} className="mt-3">
            <DataTable
              data={payments}
              columns={COLUMNS}
              loading={isLoading}
              rowKey={(p) => p.id}
              onRowClick={(p) => router.push(`/payments/${p.id}`)}
              emptyTitle="No payments found"
              emptyDescription="Payments will appear here once leases are active"
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
