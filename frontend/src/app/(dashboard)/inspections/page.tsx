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
import type { Inspection } from "@/types";

const COLUMNS: Column<Inspection>[] = [
  {
    key: "id",
    header: "ID",
    render: (i) => <span className="font-mono text-xs font-medium">#{i.id.slice(-6).toUpperCase()}</span>,
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
    header: "Unit",
    render: (i) => <span className="text-sm">Unit #{i.unitId.slice(-4)}</span>,
  },
  {
    key: "scheduledDate",
    header: "Scheduled",
    sortable: true,
    render: (i) => formatDate(i.scheduledDate),
  },
  {
    key: "inspectorName",
    header: "Inspector",
    render: (i) => <span className="text-sm">{i.inspectorName ?? "—"}</span>,
  },
];

export default function InspectionsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const { data, isLoading } = useInspections();

  const inspections = (data?.data ?? []).filter((i) => {
    const tabMatch =
      tab === "all" ||
      (tab === "scheduled" && i.state === "scheduled") ||
      (tab === "in_progress" && i.state === "in_progress") ||
      (tab === "completed" && i.state === "completed");
    const searchMatch =
      !search || i.id.toLowerCase().includes(search.toLowerCase());
    return tabMatch && searchMatch;
  });

  return (
    <div className="space-y-6">
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

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search by reference..."
        className="max-w-sm"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
          <TabsTrigger value="in_progress">In Progress</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        {["all", "scheduled", "in_progress", "completed"].map((t) => (
          <TabsContent key={t} value={t} className="mt-3">
            <DataTable
              data={inspections}
              columns={COLUMNS}
              loading={isLoading}
              rowKey={(i) => i.id}
              onRowClick={(i) => router.push(`/inspections/${i.id}`)}
              emptyTitle="No inspections found"
              emptyDescription="Schedule an inspection to get started"

            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
