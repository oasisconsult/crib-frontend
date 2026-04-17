"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FilterBar } from "@/components/common/FilterBar";
import { FilterPanel, type ActiveFilters, type FilterField } from "@/components/common/FilterPanel";
import { formatCurrency, formatDate, formatDateRange } from "@/utils/formatters";
import { useLeases } from "@/hooks/useLeases";
import type { Lease, FilterConfig } from "@/types";
import type { LeaseState } from "@/types/states";

const PAGE_SIZE = 20;

const TABS: { value: string; label: string; states: LeaseState[] }[] = [
  { value: "all",     label: "All",               states: [] },
  { value: "active",  label: "Active",             states: ["active"] },
  { value: "pending", label: "Pending",            states: ["payment_pending", "payment_secured", "agreement_signed"] },
  { value: "draft",   label: "Drafts",             states: ["draft"] },
  { value: "notice",  label: "Notice",             states: ["onboarding_started", "agreement_previewed", "terms_accepted"] },
  { value: "closed",  label: "Closed / Terminated", states: ["expired", "terminated"] },
];

const FILTER_FIELDS: FilterField[] = [
  {
    key: "type",
    label: "Type",
    options: [
      { label: "Fixed Term", value: "fixed_term" },
      { label: "Periodic", value: "periodic" },
    ],
  },
];

const COLUMNS: Column<Lease>[] = [
  {
    key: "reference",
    header: "Reference",
    sortable: true,
    render: (l) => <span className="font-mono text-xs font-medium">{l.reference}</span>,
  },
  {
    key: "state",
    header: "Status",
    render: (l) => <StatusBadge state={l.state} domain="lease" />,
  },
  {
    key: "tenantId",
    header: "Tenant",
    render: (l) => (
      <span className="text-sm">{l.tenantName ?? `Tenant #${l.tenantId.slice(-4)}`}</span>
    ),
  },
  {
    key: "unitId",
    header: "Unit",
    render: (l) => (
      <span className="text-sm">
        {l.unitName
          ? l.propertyName
            ? `${l.propertyName} — ${l.unitName}`
            : l.unitName
          : `Unit #${l.unitId.slice(-4)}`}
      </span>
    ),
  },
  {
    key: "terms",
    header: "Period",
    render: (l) => formatDateRange(l.terms.startDate, l.terms.endDate),
  },
  {
    key: "monthlyRent",
    header: "Rent / mo",
    sortable: true,
    render: (l) => (
      <span className="font-medium">{formatCurrency(l.terms.monthlyRent, l.terms.currency)}</span>
    ),
  },
  {
    key: "createdAt",
    header: "Created",
    sortable: true,
    render: (l) => <span className="text-muted-foreground">{formatDate(l.createdAt)}</span>,
  },
];

function tabFilters(tab: string): FilterConfig[] {
  const t = TABS.find((x) => x.value === tab);
  if (!t || t.states.length === 0) return [];
  if (t.states.length === 1) return [{ field: "state", operator: "eq", value: t.states[0] }];
  return [{ field: "state", operator: "in", value: t.states }];
}

function panelFiltersToConfig(active: ActiveFilters): FilterConfig[] {
  return Object.entries(active)
    .filter(([, v]) => v)
    .map(([field, value]) => ({ field, operator: "eq" as const, value }));
}

export function LeaseTable() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({});

  const { data, isLoading } = useLeases({
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    filters: [...tabFilters(activeTab), ...panelFiltersToConfig(activeFilters)],
  });

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleFilterChange = (filters: ActiveFilters) => {
    setActiveFilters(filters);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterBar
          search={search}
          onSearchChange={handleSearchChange}
          placeholder="Search by reference or tenant..."
          className="flex-1 max-w-sm"
        />
        <Button onClick={() => router.push("/leases/new")} className="shrink-0">
          <Plus className="h-4 w-4" />
          New Lease
        </Button>
      </div>

      <FilterPanel
        fields={FILTER_FIELDS}
        value={activeFilters}
        onChange={handleFilterChange}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="flex-wrap h-auto gap-1">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="text-xs">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="mt-3">
            <DataTable
              data={data?.data ?? []}
              columns={COLUMNS}
              loading={isLoading}
              rowKey={(l) => l.id}
              onRowClick={(l) => router.push(`/leases/${l.id}`)}
              emptyTitle="No leases found"
              emptyDescription={
                activeTab === "all"
                  ? "Create a lease to get started"
                  : "No leases match this filter"
              }
              pageSize={PAGE_SIZE}
              totalItems={data?.total}
              currentPage={page}
              onPageChange={setPage}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
