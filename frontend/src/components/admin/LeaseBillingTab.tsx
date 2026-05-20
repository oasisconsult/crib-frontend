"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  PenLine,
  Loader2,
  Search,
  X,
  SlidersHorizontal,
  Download,
  FileText,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { useAdminLeases, usePatchLeaseBillingRules } from "@/hooks/useAdminLeases";
import { adminLeasesApi, type AdminLease, type LeaseBillingRulesPatch } from "@/services/api/adminLeases";
import { EmptyState } from "@/components/common/EmptyState";
import { toast } from "@/store/useUIStore";
import { cn } from "@/utils/cn";

// ── Status styles ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  active:             "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  draft:              "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700",
  terminated:         "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
  expired:            "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  onboarding_started: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  payment_pending:    "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
  payment_secured:    "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800",
  agreement_signed:   "bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800",
};

// ── Edit Dialog ───────────────────────────────────────────────────────────────

interface EditDialogProps {
  lease: AdminLease | null;
  open: boolean;
  onClose: () => void;
}

function EditDialog({ lease, open, onClose }: EditDialogProps) {
  const { mutate: patch, isPending } = usePatchLeaseBillingRules();
  const [syncFromProperty, setSyncFromProperty] = useState(false);
  const [form, setForm] = useState({
    lateFeeType: "flat",
    lateFeeValue: "",
    gracePeriodDays: "",
    rentDayOfMonth: "",
    noticePeriodDays: "",
  });

  function handleOpenChange(v: boolean) {
    if (!v) { onClose(); return; }
    if (!lease) return;
    setSyncFromProperty(false);
    setForm({
      lateFeeType: lease.lateFeeType,
      lateFeeValue: String(lease.lateFeeValue),
      gracePeriodDays: String(lease.gracePeriodDays),
      rentDayOfMonth: String(lease.rentDayOfMonth),
      noticePeriodDays: String(lease.noticePeriodDays),
    });
  }

  function handleSubmit() {
    if (!lease) return;
    const body: LeaseBillingRulesPatch = syncFromProperty
      ? { syncFromProperty: true }
      : {
          lateFeeType:      form.lateFeeType || undefined,
          lateFeeValue:     form.lateFeeValue     !== "" ? parseFloat(form.lateFeeValue)     : undefined,
          gracePeriodDays:  form.gracePeriodDays  !== "" ? parseInt(form.gracePeriodDays)    : undefined,
          rentDayOfMonth:   form.rentDayOfMonth   !== "" ? parseInt(form.rentDayOfMonth)     : undefined,
          noticePeriodDays: form.noticePeriodDays !== "" ? parseInt(form.noticePeriodDays)   : undefined,
        };

    patch({ leaseId: lease.id, body }, {
      onSuccess: () => {
        toast.success(
          "Billing rules updated",
          syncFromProperty ? "Synced from property/unit configuration" : "Changes saved",
        );
        onClose();
      },
      onError: (err: any) =>
        toast.error("Update failed", err?.response?.data?.detail ?? "Please try again"),
    });
  }

  if (!lease) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            Edit Billing Rules
          </DialogTitle>
          <DialogDescription>
            {lease.tenantName
              ? <><span className="font-medium text-foreground">{lease.tenantName}</span>
                  {lease.unitName && <> — {lease.unitName}</>}
                  {lease.propertyName && <>, {lease.propertyName}</>}</>
              : "Update billing configuration for this lease."}
          </DialogDescription>
        </DialogHeader>

        {/* Sync shortcut toggle */}
        <button
          type="button"
          onClick={() => setSyncFromProperty(p => !p)}
          className={cn(
            "w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors duration-150",
            syncFromProperty
              ? "border-primary/50 bg-primary/5"
              : "border-border hover:border-primary/30 hover:bg-muted/40",
          )}
        >
          <div className={cn(
            "h-4 w-4 rounded-[3px] border-2 flex items-center justify-center shrink-0 transition-colors",
            syncFromProperty ? "bg-primary border-primary" : "border-muted-foreground/40",
          )}>
            {syncFromProperty && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">Sync from property / unit</p>
            <p className="text-xs text-muted-foreground">
              Auto-inherit all rules from the unit or property configuration
            </p>
          </div>
        </button>

        {/* Manual fields */}
        <div className={cn("space-y-4 transition-opacity duration-200", syncFromProperty && "opacity-40 pointer-events-none select-none")}>
          <Separator />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Late Fee Type</Label>
              <Select value={form.lateFeeType} onValueChange={v => setForm(f => ({ ...f, lateFeeType: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="flat">Flat (UGX)</SelectItem>
                  <SelectItem value="percent">Percentage (%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Late Fee Value <span className="text-muted-foreground font-normal">({form.lateFeeType === "percent" ? "%" : "UGX"})</span>
              </Label>
              <Input type="number" min={0} value={form.lateFeeValue}
                onChange={e => setForm(f => ({ ...f, lateFeeValue: e.target.value }))}
                placeholder="0" className="h-9 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Rent Day</Label>
              <Input type="number" min={1} max={28} value={form.rentDayOfMonth}
                onChange={e => setForm(f => ({ ...f, rentDayOfMonth: e.target.value }))}
                placeholder="1" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Grace (days)</Label>
              <Input type="number" min={0} value={form.gracePeriodDays}
                onChange={e => setForm(f => ({ ...f, gracePeriodDays: e.target.value }))}
                placeholder="5" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Notice (days)</Label>
              <Input type="number" min={0} value={form.noticePeriodDays}
                onChange={e => setForm(f => ({ ...f, noticePeriodDays: e.target.value }))}
                placeholder="30" className="h-9 text-sm" />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {syncFromProperty ? "Sync from Property" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Inline table ──────────────────────────────────────────────────────────────

// Header cell — shared style matching DataTable
const TH = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] whitespace-nowrap select-none";

function LeaseTable({
  items,
  loading,
  selectedKeys,
  onSelectionChange,
  onSync,
  onEdit,
  isSyncing,
  page,
  total,
  pageSize,
  onPageChange,
}: {
  items: AdminLease[];
  loading: boolean;
  selectedKeys: Set<string>;
  onSelectionChange: (s: Set<string>) => void;
  onSync: (id: string) => void;
  onEdit: (lease: AdminLease) => void;
  isSyncing: boolean;
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showPagination = !loading && totalPages > 1;
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  function toggleAll() {
    const allKeys = items.map(l => l.id);
    const allSelected = allKeys.every(k => selectedKeys.has(k));
    const next = new Set(selectedKeys);
    if (allSelected) allKeys.forEach(k => next.delete(k));
    else allKeys.forEach(k => next.add(k));
    onSelectionChange(next);
  }

  function toggleRow(id: string) {
    const next = new Set(selectedKeys);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectionChange(next);
  }

  if (!loading && items.length === 0) {
    return (
      <div className="overflow-hidden rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-sm)]">
        <EmptyState title="No leases found" description="Try adjusting the filters." />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-sm)] transition-shadow duration-200 hover:shadow-[var(--shadow-md)]">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[740px]" role="table">

          {/* ── Header ─────────────────────────────────────────── */}
          <thead>
            <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
              <th className="w-12 px-4 py-3">
                <input
                  type="checkbox"
                  className="rounded border-[hsl(var(--border))] accent-[hsl(var(--primary))]"
                  checked={items.length > 0 && items.every(l => selectedKeys.has(l.id))}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <th className={TH}>Tenant</th>
              <th className={TH}>Unit / Property</th>
              <th className={TH}>Status</th>
              <th className={TH}>Late Fee</th>
              <th className={TH}>Grace / Due Day</th>
              <th className={TH}>Notice</th>
              <th className={cn(TH, "text-right")}>Actions</th>
            </tr>
          </thead>

          {/* ── Body ───────────────────────────────────────────── */}
          <tbody className="divide-y divide-[hsl(var(--border))]">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td className="w-12 px-4 py-3.5">
                      <Skeleton className="h-4 w-4" />
                    </td>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3.5">
                        <Skeleton className="h-4 w-full max-w-[120px]" />
                      </td>
                    ))}
                  </tr>
                ))
              : items.map((lease, rowIdx) => {
                  const isZero = lease.lateFeeValue === 0;
                  const isSelected = selectedKeys.has(lease.id);
                  return (
                    <tr
                      key={lease.id}
                      className={cn(
                        "transition-colors",
                        rowIdx % 2 === 1 && !isSelected && "bg-[hsl(var(--muted))]/30",
                        "hover:bg-[hsl(var(--accent))]",
                        isSelected && "bg-[hsl(var(--accent))] hover:bg-[hsl(var(--accent))]",
                      )}
                    >
                      {/* Checkbox */}
                      <td className="w-12 px-4 py-3.5" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="rounded border-[hsl(var(--border))] accent-[hsl(var(--primary))]"
                          checked={isSelected}
                          onChange={() => toggleRow(lease.id)}
                        />
                      </td>

                      {/* Tenant */}
                      <td className="px-4 py-3.5 max-w-[160px] text-[hsl(var(--foreground))]">
                        <p className="font-medium text-sm truncate">
                          {lease.tenantName || <span className="text-muted-foreground italic text-xs">No tenant</span>}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {lease.organisationName || "—"}
                        </p>
                      </td>

                      {/* Unit / Property */}
                      <td className="px-4 py-3.5 max-w-[160px] text-[hsl(var(--foreground))]">
                        <p className="text-sm truncate">{lease.unitName || "—"}</p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{lease.propertyName || "—"}</p>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-[hsl(var(--foreground))]">
                        <Badge
                          variant="outline"
                          className={cn("capitalize text-xs px-1.5 py-0", STATUS_STYLES[lease.status] ?? "")}
                        >
                          {lease.status.replace(/_/g, " ")}
                        </Badge>
                      </td>

                      {/* Late fee */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-[hsl(var(--foreground))]">
                        {isZero ? (
                          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium text-xs">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            Not set
                          </span>
                        ) : (
                          <span className="text-sm font-medium">
                            {lease.lateFeeType === "percent"
                              ? `${lease.lateFeeValue}%`
                              : `UGX ${lease.lateFeeValue.toLocaleString()}`}
                          </span>
                        )}
                      </td>

                      {/* Grace / Due day */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-sm text-muted-foreground">
                        {lease.gracePeriodDays}d grace · day {lease.rentDayOfMonth}
                      </td>

                      {/* Notice */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-sm text-muted-foreground">
                        {lease.noticePeriodDays}d
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap text-[hsl(var(--foreground))]">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                            onClick={() => onEdit(lease)}
                          >
                            <PenLine className="h-3 w-3" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => onSync(lease.id)}
                            disabled={isSyncing}
                          >
                            <RefreshCw className="h-3 w-3" />
                            Sync
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {/* ── Pagination footer (matches DataTable's footer) ─────── */}
      {showPagination && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {total === 0 ? "No results" : (
              <>
                Showing{" "}
                <span className="font-medium text-[hsl(var(--foreground))]">{startItem}–{endItem}</span>
                {" "}of{" "}
                <span className="font-medium text-[hsl(var(--foreground))]">{total.toLocaleString()}</span>
                {" "}results
              </>
            )}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <div className="flex items-center gap-0.5">
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5)          pageNum = i + 1;
                else if (page <= 3)           pageNum = i + 1;
                else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
                else                          pageNum = page - 2 + i;
                return (
                  <button
                    key={pageNum}
                    onClick={() => onPageChange(pageNum)}
                    className={cn(
                      "h-7 min-w-[28px] px-1.5 rounded-[6px] text-xs font-medium transition-colors",
                      page === pageNum
                        ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                        : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]",
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page === totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Tab ──────────────────────────────────────────────────────────────────

export function LeaseBillingTab() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [zeroOnly, setZeroOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [editLease, setEditLease] = useState<AdminLease | null>(null);

  const queryClient = useQueryClient();
  const { mutate: patch, isPending: patching } = usePatchLeaseBillingRules();

  const { data, isLoading } = useAdminLeases({
    page,
    pageSize: 50,
    ...(statusFilter !== "all" && { status: statusFilter }),
    ...(zeroOnly && { zeroLateFeeOnly: true }),
  });

  const allItems = data?.items ?? [];
  const displayItems = search
    ? allItems.filter(l => {
        const q = search.toLowerCase();
        return (
          l.tenantName?.toLowerCase().includes(q) ||
          l.unitName?.toLowerCase().includes(q) ||
          l.propertyName?.toLowerCase().includes(q) ||
          l.organisationName?.toLowerCase().includes(q)
        );
      })
    : allItems;

  const zeroFeeCount = allItems.filter(l => l.lateFeeValue === 0).length;
  const selectedList = Array.from(selectedKeys);

  function syncOne(leaseId: string) {
    patch(
      { leaseId, body: { syncFromProperty: true } },
      {
        onSuccess: () => {
          setSelectedKeys(prev => { const s = new Set(prev); s.delete(leaseId); return s; });
          toast.success("Synced", "Billing rules updated from property configuration");
        },
        onError: (err: any) =>
          toast.error("Sync failed", err?.response?.data?.detail ?? "Please try again"),
      },
    );
  }

  async function syncSelected() {
    let succeeded = 0;
    for (const id of selectedList) {
      try {
        await adminLeasesApi.patchBillingRules(id, { syncFromProperty: true });
        succeeded++;
      } catch { /* continue */ }
    }
    toast.success(`Synced ${succeeded} of ${selectedList.length} leases`, "Rules pulled from property/unit configuration");
    setSelectedKeys(new Set());
    queryClient.invalidateQueries({ queryKey: ["admin-leases"] });
  }

  return (
    <>
      <div className="space-y-4">

        {/* ── Page title ─────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-base font-semibold">Lease Billing Rules</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Correct billing fields across all organisations. Changes apply to future invoices and regenerated PDF agreements.
          </p>
        </div>

        {/* ── Zero-fee alert ─────────────────────────────────────────────── */}
        {!isLoading && zeroFeeCount > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {zeroFeeCount} lease{zeroFeeCount !== 1 ? "s" : ""} on this page {zeroFeeCount === 1 ? "has" : "have"} no late fee configured
              </p>
              <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-0.5">
                Likely created via CSV import before the billing-rules fix. Use <strong>Sync</strong> per row, or select rows and bulk-sync.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/30 h-7 text-xs gap-1.5 whitespace-nowrap"
              onClick={() => { setZeroOnly(p => !p); setPage(1); }}
            >
              <FileText className="h-3 w-3" />
              {zeroOnly ? "Show all" : "Show only these"}
            </Button>
          </div>
        )}

        {/* ── Filter bar ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search tenant, unit, property…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Status */}
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[140px] h-8 text-sm">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>

          {/* Zero-fee toggle */}
          <Button
            size="sm"
            variant={zeroOnly ? "default" : "outline"}
            className="h-8 text-xs gap-1.5 whitespace-nowrap"
            onClick={() => { setZeroOnly(p => !p); setPage(1); }}
          >
            <AlertTriangle className="h-3 w-3" />
            Zero late fee
          </Button>

          {/* Spacer + count */}
          <div className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
            {data ? `${data.total.toLocaleString()} lease${data.total !== 1 ? "s" : ""}` : null}
          </div>
        </div>

        {/* ── Bulk action bar ─────────────────────────────────────────────── */}
        {selectedKeys.size > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
            <span className="text-sm font-medium text-primary">{selectedKeys.size} selected</span>
            <Separator orientation="vertical" className="h-4" />
            <Button size="sm" className="h-7 text-xs gap-1.5" onClick={syncSelected} disabled={patching}>
              {patching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              Sync {selectedKeys.size} from property
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs ml-auto" onClick={() => setSelectedKeys(new Set())}>
              Clear
            </Button>
          </div>
        )}

        {/* ── Table (with pagination built in) ───────────────────────────── */}
        <LeaseTable
          items={displayItems}
          loading={isLoading}
          selectedKeys={selectedKeys}
          onSelectionChange={setSelectedKeys}
          onSync={syncOne}
          onEdit={setEditLease}
          isSyncing={patching}
          page={page}
          total={data?.total ?? 0}
          pageSize={50}
          onPageChange={setPage}
        />
      </div>

      {/* ── Edit dialog ──────────────────────────────────────────────────── */}
      <EditDialog lease={editLease} open={!!editLease} onClose={() => setEditLease(null)} />
    </>
  );
}
