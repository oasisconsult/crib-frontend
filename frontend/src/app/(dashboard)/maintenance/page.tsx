"use client";

import { useState } from "react";
import { Plus, Wrench, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FilterBar } from "@/components/common/FilterBar";
import { formatDate } from "@/utils/formatters";
import { useMaintenanceIssues, useCreateMaintenanceIssue } from "@/hooks/useInspections";
import { useProperties } from "@/hooks/useProperties";
import { useRouter } from "next/navigation";
import { cn } from "@/utils/cn";
import type { MaintenanceIssue, FilterConfig } from "@/types";

const PAGE_SIZE = 20;

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  urgent: { label: "Urgent", color: "text-red-600 bg-red-50 dark:bg-red-950/30 border-red-200" },
  high:   { label: "High",   color: "text-orange-600 bg-orange-50 dark:bg-orange-950/30 border-orange-200" },
  medium: { label: "Medium", color: "text-amber-600 bg-amber-50 dark:bg-amber-950/30 border-amber-200" },
  low:    { label: "Low",    color: "text-sky-600 bg-sky-50 dark:bg-sky-950/30 border-sky-200" },
};

const CATEGORIES = ["plumbing", "electrical", "structural", "appliance", "pest", "security", "other"];

function PriorityBadge({ priority }: { priority: string }) {
  const cfg = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.medium;
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", cfg.color)}>
      {cfg.label}
    </span>
  );
}

const COLUMNS: Column<MaintenanceIssue>[] = [
  {
    key: "title",
    header: "Issue",
    render: (i) => (
      <div className="flex items-center gap-2 min-w-0">
        <div className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          i.priority === "urgent" || i.priority === "high"
            ? "bg-red-100 dark:bg-red-950/30"
            : "bg-amber-100 dark:bg-amber-950/30",
        )}>
          <AlertTriangle className={cn(
            "h-3.5 w-3.5",
            i.priority === "urgent" || i.priority === "high" ? "text-red-600" : "text-amber-600",
          )} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{i.title}</p>
          <PriorityBadge priority={i.priority} />
        </div>
      </div>
    ),
  },
  {
    key: "state",
    header: "Status",
    render: (i) => <StatusBadge state={i.state} domain="maintenance" />,
  },
  {
    key: "category",
    header: "Category",
    render: (i) => (
      <span className="text-sm capitalize">{(i.category ?? "").replace(/_/g, " ")}</span>
    ),
  },
  {
    key: "propertyId",
    header: "Property / Unit",
    render: (i) => (
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{i.propertyName ?? i.propertyId}</p>
        {i.unitId && (
          <p className="text-xs text-muted-foreground truncate">{i.unitName ?? `Unit #${i.unitId.slice(-4)}`}</p>
        )}
      </div>
    ),
  },
  {
    key: "reportedAt",
    header: "Reported",
    sortable: true,
    render: (i) => (
      <span className="text-muted-foreground">{formatDate(i.reportedAt ?? i.createdAt)}</span>
    ),
  },
];

const OPEN_STATES = ["reported", "assigned", "in_progress"];
const RESOLVED_STATES = ["resolved", "closed"];

const TAB_FILTERS: Record<string, FilterConfig[]> = {
  open:     [{ field: "state", operator: "in", value: OPEN_STATES }],
  resolved: [{ field: "state", operator: "in", value: RESOLVED_STATES }],
  all:      [],
};

const TABS = ["open", "resolved", "all"] as const;
const TAB_LABELS: Record<typeof TABS[number], string> = {
  open: "Open", resolved: "Resolved", all: "All",
};

function NewIssueDialog({ onClose }: { onClose: () => void }) {
  const { mutate: create, isPending } = useCreateMaintenanceIssue();
  const { data: propertiesData } = useProperties();
  const properties = propertiesData?.data ?? [];

  const [propertyId, setPropertyId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("plumbing");
  const [priority, setPriority] = useState("medium");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!propertyId || !title) return;
    create(
      {
        propertyId,
        unitId: undefined,
        reportedBy: "landlord",
        reportedById: "landlord-1",
        title,
        description,
        category: category as "plumbing",
        priority: priority as "medium",
        reportedAt: new Date().toISOString(),
        photoUrls: [],
      },
      { onSuccess: onClose },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="space-y-1.5">
        <Label htmlFor="n-property">Property *</Label>
        <Select value={propertyId} onValueChange={setPropertyId} required>
          <SelectTrigger id="n-property"><SelectValue placeholder="Select property" /></SelectTrigger>
          <SelectContent>
            {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="n-title">Title *</Label>
        <Input id="n-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Leaking tap in kitchen" required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="n-desc">Description</Label>
        <Textarea id="n-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the issue in detail..." rows={3} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="n-cat">Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="n-cat"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="n-pri">Priority</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger id="n-pri"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["urgent", "high", "medium", "low"].map((p) => (
                <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={!propertyId || !title || isPending}>
          {isPending ? "Reporting…" : "Report Issue"}
        </Button>
      </div>
    </form>
  );
}

export default function MaintenancePage() {
  const router = useRouter();
  const [tab, setTab] = useState<typeof TABS[number]>("open");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading } = useMaintenanceIssues({
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Maintenance</h1>
          <p className="text-sm text-muted-foreground mt-1">Track and manage property maintenance issues</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              Report Issue
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Report Maintenance Issue</DialogTitle>
            </DialogHeader>
            <NewIssueDialog onClose={() => setDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Toolbar */}
      <FilterBar
        search={search}
        onSearchChange={handleSearchChange}
        placeholder="Search by title or property..."
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
              data={(data as any)?.data ?? []}
              columns={COLUMNS}
              loading={isLoading}
              rowKey={(i) => i.id}
              onRowClick={(i) => router.push(`/maintenance/${i.id}`)}
              emptyTitle="No issues found"
              emptyDescription={
                t === "open"
                  ? "All clear — no open maintenance issues"
                  : "No issues match this filter"
              }
              pageSize={PAGE_SIZE}
              totalItems={(data as any)?.total}
              currentPage={page}
              onPageChange={setPage}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
