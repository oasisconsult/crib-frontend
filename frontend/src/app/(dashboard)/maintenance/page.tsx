"use client";

import { useState, useRef } from "react";
import { Plus, AlertTriangle, Camera, ImageIcon, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { FilterPanel, type ActiveFilters, type FilterField } from "@/components/common/FilterPanel";
import { formatDate } from "@/utils/formatters";
import { useMaintenanceIssues, useCreateMaintenanceIssue } from "@/hooks/useInspections";
import { usePermissions } from "@/hooks/usePermissions";
import { useProperties } from "@/hooks/useProperties";
import { useRouter } from "next/navigation";
import { cn } from "@/utils/cn";
import { uploadsApi } from "@/services/api/uploads";
import { toast } from "@/store/useUIStore";
import type { MaintenanceIssue, FilterConfig } from "@/types";

function toDisplayUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("/api/v1/upload/") || url.startsWith("/api/upload/local/")) return url;
  const idx = url.indexOf("inspection_photo/");
  if (idx !== -1) return `/api/v1/upload/serve/${url.slice(idx)}`;
  return url;
}

const PAGE_SIZE = 20;

const PRIORITY_BADGE: Record<string, { variant: "danger" | "orange" | "warning" | "info"; label: string }> = {
  urgent: { variant: "danger",  label: "Urgent" },
  high:   { variant: "orange",  label: "High"   },
  medium: { variant: "warning", label: "Medium" },
  low:    { variant: "info",    label: "Low"    },
};

const CATEGORIES = ["plumbing", "electrical", "structural", "appliance", "pest", "security", "other"];

function PriorityBadge({ priority }: { priority: string }) {
  const cfg = PRIORITY_BADGE[priority] ?? { variant: "slate" as const, label: priority };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

const COLUMNS: Column<MaintenanceIssue>[] = [
  {
    key: "title",
    header: "Issue",
    render: (i) => (
      <div className="flex items-center gap-2 min-w-0">
        <div className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px]",
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

const FILTER_FIELDS: FilterField[] = [
  {
    key: "priority",
    label: "Priority",
    options: [
      { label: "Urgent", value: "urgent" },
      { label: "High", value: "high" },
      { label: "Medium", value: "medium" },
      { label: "Low", value: "low" },
    ],
  },
  {
    key: "category",
    label: "Category",
    options: CATEGORIES.map((c) => ({ label: c.charAt(0).toUpperCase() + c.slice(1), value: c })),
  },
];

function panelFiltersToConfig(active: ActiveFilters): FilterConfig[] {
  return Object.entries(active)
    .filter(([, v]) => v)
    .map(([field, value]) => ({ field, operator: "eq" as const, value }));
}

function NewIssueDialog({ onClose }: { onClose: () => void }) {
  const { mutate: create, isPending } = useCreateMaintenanceIssue();
  const { data: propertiesData } = useProperties();
  const properties = propertiesData?.data ?? [];

  const [propertyId, setPropertyId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("plumbing");
  const [priority, setPriority] = useState("medium");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = "";
    setUploading(true);
    try {
      const results = await Promise.all(
        files.map((f) => uploadsApi.uploadFile(f, { category: "inspection_photo" })),
      );
      setPhotoUrls((prev) => [...prev, ...results.map((r) => r.url)]);
    } catch {
      toast.error("Failed to upload photos");
    } finally {
      setUploading(false);
    }
  }

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
        photoUrls,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-6 pb-6 pt-4">
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

      {/* Photo upload */}
      <div className="space-y-2">
        <Label>Photos <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <div className="flex items-center gap-2">
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleFiles} disabled={uploading} />
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-[5px] border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-accent transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            Camera
          </button>
          <input ref={galleryRef} type="file" accept="image/*" multiple className="sr-only" onChange={handleFiles} disabled={uploading} />
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-[5px] border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-accent transition-colors disabled:opacity-50"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            Gallery
          </button>
          {uploading && <span className="text-xs text-muted-foreground">Uploading…</span>}
        </div>
        {photoUrls.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {photoUrls.map((url) => (
              <div key={url} className="group relative aspect-square rounded-[6px] overflow-hidden bg-muted border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={toDisplayUrl(url)} alt="Issue photo" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotoUrls((prev) => prev.filter((u) => u !== url))}
                  className="absolute top-1 right-1 hidden group-hover:flex items-center justify-center h-5 w-5 rounded-full bg-black/60 text-white hover:bg-destructive transition-colors"
                  aria-label="Remove photo"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={!propertyId || !title || isPending || uploading}>
          {isPending ? "Reporting…" : "Report Issue"}
        </Button>
      </div>
    </form>
  );
}

export default function MaintenancePage() {
  const router = useRouter();
  const { canWrite } = usePermissions();
  const [tab, setTab] = useState<typeof TABS[number]>("open");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({});
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading } = useMaintenanceIssues({
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    filters: [...TAB_FILTERS[tab], ...panelFiltersToConfig(activeFilters)],
  });

  const handleTabChange = (t: string) => {
    setTab(t as typeof TABS[number]);
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Maintenance</h1>
          <p className="text-sm text-muted-foreground mt-1">Track and manage property maintenance issues</p>
        </div>
        {canWrite && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4" />Report Issue</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Report Maintenance Issue</DialogTitle>
              </DialogHeader>
              <NewIssueDialog onClose={() => setDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Toolbar */}
      <div className="space-y-2">
        <FilterBar
          search={search}
          onSearchChange={handleSearchChange}
          placeholder="Search by title or property..."
          className="max-w-sm"
        />
        <FilterPanel
          fields={FILTER_FIELDS}
          value={activeFilters}
          onChange={handleFilterChange}
        />
      </div>

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
