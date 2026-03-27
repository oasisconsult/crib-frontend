"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Wrench, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatDate } from "@/utils/formatters";
import { useMaintenanceIssues, useCreateMaintenanceIssue } from "@/hooks/useInspections";
import { useProperties } from "@/hooks/useProperties";
import { cn } from "@/utils/cn";
import type { MaintenanceIssue } from "@/types";

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

function IssueCard({ issue }: { issue: MaintenanceIssue }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-4 hover:bg-muted/30 transition-colors">
      <div className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
        issue.priority === "urgent" || issue.priority === "high"
          ? "bg-red-100 dark:bg-red-950/30"
          : "bg-amber-100 dark:bg-amber-950/30",
      )}>
        <AlertTriangle className={cn(
          "h-4 w-4",
          issue.priority === "urgent" || issue.priority === "high" ? "text-red-600" : "text-amber-600",
        )} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{issue.title}</p>
          <PriorityBadge priority={issue.priority} />
          <StatusBadge state={issue.state as "open"} domain="maintenance" />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{issue.description}</p>
        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
          <span>Property: {issue.propertyId}</span>
          {issue.unitId && <span>· Unit: {issue.unitId}</span>}
          <span>· Reported {formatDate(issue.reportedAt ?? issue.createdAt)}</span>
          {issue.resolvedAt && <span>· Resolved {formatDate(issue.resolvedAt)}</span>}
        </div>
      </div>
    </div>
  );
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!propertyId || !title) return;
    create(
      {
        state: "open" as const,
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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
        <Button type="submit" loading={isPending} disabled={!propertyId || !title}>Report Issue</Button>
      </div>
    </form>
  );
}

export default function MaintenancePage() {
  const [tab, setTab] = useState("open");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data, isLoading } = useMaintenanceIssues();

  const issues = (data?.data ?? []) as MaintenanceIssue[];

  const filtered = issues.filter((i) => {
    const tabMatch =
      tab === "all" ||
      (tab === "open" && (i.state === "open" || i.state === "in_progress")) ||
      (tab === "resolved" && (i.state === "resolved" || i.state === "closed"));
    const searchMatch = !search || i.title.toLowerCase().includes(search.toLowerCase());
    return tabMatch && searchMatch;
  });

  const openCount = issues.filter((i) => i.state === "open" || i.state === "in_progress").length;
  const urgentCount = issues.filter((i) => i.priority === "urgent" || (i.priority === "high" && i.state === "open")).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Wrench className="h-6 w-6" />
            Maintenance
          </h1>
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

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Open Issues", value: openCount, color: "text-amber-600" },
          { label: "Urgent / High", value: urgentCount, color: "text-red-600" },
          { label: "Resolved (30d)", value: issues.filter((i) => i.state === "resolved").length, color: "text-emerald-600" },
          { label: "Total Issues", value: issues.length, color: "text-foreground" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={cn("text-2xl font-bold mt-1", s.color)}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search issues..."
        className="flex h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="open">
            Open
            {openCount > 0 && <Badge variant="destructive" className="ml-1.5 text-xs">{openCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        {["open", "resolved", "all"].map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 rounded-lg border bg-muted/30 animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Wrench className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium">No issues found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {tab === "open" ? "All clear — no open maintenance issues" : "No issues match your search"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filtered.map((issue) => <IssueCard key={issue.id} issue={issue} />)}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
