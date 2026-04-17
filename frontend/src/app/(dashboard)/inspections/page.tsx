"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FilterBar } from "@/components/common/FilterBar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/utils/formatters";
import { useInspections } from "@/hooks/useInspections";
import type { Inspection, FilterConfig } from "@/types";

const PAGE_SIZE = 20;

const COLUMNS: Column<Inspection>[] = [
  {
    key: "id",
    header: "Reference",
    render: (i) => (
      <span className="font-mono text-xs font-medium">
        #{i.id.slice(-6).toUpperCase()}
      </span>
    ),
  },
  {
    key: "state",
    header: "Status",
    render: (i) => <StatusBadge state={i.state} domain="inspection" />,
  },
  {
    key: "type",
    header: "Type",
    render: (i) => (
      <span className="text-sm capitalize">{i.type.replace(/_/g, " ")}</span>
    ),
  },
  {
    key: "unitId",
    header: "Property / Unit",
    render: (i) => (
      <div className="min-w-0">
        {i.propertyName && (
          <p className="text-sm font-medium truncate">{i.propertyName}</p>
        )}
        <p className="text-xs text-muted-foreground truncate">
          {i.unitName ?? `Unit #${i.unitId.slice(-4)}`}
        </p>
      </div>
    ),
  },
  {
    key: "scheduledDate",
    header: "Scheduled",
    sortable: true,
    render: (i) => (
      <span className="text-muted-foreground">{formatDate(i.scheduledDate)}</span>
    ),
  },
  {
    key: "inspectorName",
    header: "Inspector",
    render: (i) => (
      <span className="text-sm">{i.inspectorName ?? "—"}</span>
    ),
  },
];

const TAB_FILTERS: Record<string, FilterConfig[]> = {
  all:         [],
  scheduled:   [{ field: "state", operator: "eq", value: "scheduled" }],
  in_progress: [{ field: "state", operator: "eq", value: "in_progress" }],
  completed:   [{ field: "state", operator: "eq", value: "completed" }],
};

const TABS = ["all", "scheduled", "in_progress", "completed"] as const;
const TAB_LABELS: Record<typeof TABS[number], string> = {
  all: "All", scheduled: "Scheduled", in_progress: "In Progress", completed: "Completed",
};

export default function InspectionsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<typeof TABS[number]>("all");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useInspections({
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    filters: TAB_FILTERS[tab],
  });

  const handleTabChange = (t: string) => {
    setTab(t as typeof TABS[number]);
    setPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inspections</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Property and unit inspections
          </p>
        </div>
        <Button onClick={() => router.push("/inspections/new")}>
          <Plus className="h-4 w-4" />
          Schedule Inspection
        </Button>
      </div>

      {/* Toolbar */}
      <FilterBar
        search={search}
        onSearchChange={handleSearchChange}
        placeholder="Search by reference or property..."
        className="max-w-sm"
      />

      {/* Tabs + Table */}
      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t} value={t}>{TAB_LABELS[t]}</TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((t) => (
          <TabsContent key={t} value={t} className="mt-3">
            <DataTable
              data={data?.data ?? []}
              columns={COLUMNS}
              loading={isLoading}
              rowKey={(i) => i.id}
              onRowClick={(i) => router.push(`/inspections/${i.id}`)}
              emptyTitle="No inspections found"
              emptyDescription={
                t === "all"
                  ? "Schedule an inspection to get started"
                  : "No inspections match this filter"
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
