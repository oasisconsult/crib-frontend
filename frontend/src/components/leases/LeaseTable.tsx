"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FilterBar } from "@/components/common/FilterBar";
import { formatCurrency, formatDate, formatDateRange } from "@/utils/formatters";
import { useLeases } from "@/hooks/useLeases";
import type { Lease } from "@/types";
import type { LeaseState } from "@/types/states";
import { LeaseWorkflowStepper } from "./WorkflowStepper";

const TABS: { value: string; label: string; states: LeaseState[] }[] = [
  { value: "all", label: "All", states: [] },
  { value: "active", label: "Active", states: ["active"] },
  { value: "pending", label: "Pending", states: ["payment_pending", "payment_secured", "agreement_signed"] },
  { value: "draft", label: "Drafts", states: ["draft"] },
  { value: "notice", label: "Notice", states: ["onboarding_started", "agreement_previewed", "terms_accepted"] },
  { value: "closed", label: "Closed / Terminated", states: ["expired", "terminated"] },
];

const COLUMNS: Column<Lease>[] = [
  {
    key: "reference",
    header: "Reference",
    sortable: true,
    render: (lease) => (
      <span className="font-mono text-xs font-medium">{lease.reference}</span>
    ),
  },
  {
    key: "state",
    header: "Status",
    render: (lease) => <StatusBadge state={lease.state} domain="lease" />,
  },
  {
    key: "tenantId",
    header: "Tenant",
    render: (lease) => (
      <span className="text-sm">{lease.tenantName ?? `Tenant #${lease.tenantId.slice(-4)}`}</span>
    ),
  },
  {
    key: "unitId",
    header: "Unit",
    render: (lease) => (
      <span className="text-sm">
        {lease.unitName
          ? lease.propertyName
            ? `${lease.propertyName} — ${lease.unitName}`
            : lease.unitName
          : `Unit #${lease.unitId.slice(-4)}`}
      </span>
    ),
  },
  {
    key: "terms",
    header: "Period",
    render: (lease) =>
      formatDateRange(lease.terms.startDate, lease.terms.endDate),
  },
  {
    key: "monthlyRent",
    header: "Rent / mo",
    sortable: true,
    render: (lease) =>
      formatCurrency(lease.terms.monthlyRent, lease.terms.currency),
  },
  {
    key: "createdAt",
    header: "Created",
    sortable: true,
    render: (lease) => formatDate(lease.createdAt),
  },
];

export function LeaseTable() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const { data, isLoading } = useLeases();

  const allLeases = data?.data ?? [];

  const filtered = allLeases.filter((l) => {
    const tabConfig = TABS.find((t) => t.value === activeTab);
    const tabMatch =
      !tabConfig?.states.length || tabConfig.states.includes(l.state);
    const searchMatch =
      !search ||
      l.reference.toLowerCase().includes(search.toLowerCase()) ||
      l.tenantId.includes(search);
    return tabMatch && searchMatch;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          placeholder="Search by reference or tenant..."
          className="flex-1"
        />
        <Button onClick={() => router.push("/leases/new")} className="shrink-0">
          <Plus className="h-4 w-4" />
          New Lease
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="text-xs">
              {tab.label}
              {tab.states.length > 0 && (
                <span className="ml-1.5 text-muted-foreground">
                  ({allLeases.filter((l) => tab.states.includes(l.state)).length})
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="mt-3">
            <DataTable
              data={filtered}
              columns={COLUMNS}
              loading={isLoading}
              rowKey={(l) => l.id}
              onRowClick={(l) => router.push(`/leases/${l.id}`)}
              emptyTitle="No leases found"
              emptyDescription="Create a lease to get started"
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
