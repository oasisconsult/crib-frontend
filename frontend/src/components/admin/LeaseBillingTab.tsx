"use client";

import { useState, useCallback } from "react";
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
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
import { DataTable, type Column } from "@/components/common/DataTable";
import { useQueryClient } from "@tanstack/react-query";
import { useAdminLeases, usePatchLeaseBillingRules } from "@/hooks/useAdminLeases";
import { adminLeasesApi, type AdminLease, type LeaseBillingRulesPatch } from "@/services/api/adminLeases";
import { toast } from "@/store/useUIStore";
import { cn } from "@/utils/cn";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  active:               "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  draft:                "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700",
  terminated:           "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
  expired:              "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  onboarding_started:   "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  payment_pending:      "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
  payment_secured:      "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800",
  agreement_signed:     "bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800",
};

function formatLateFee(type: string, value: number) {
  if (value === 0) return "None";
  return type === "percent" ? `${value}%` : `UGX ${value.toLocaleString()}`;
}

function LateFeeCell({ type, value }: { type: string; value: number }) {
  const isZero = value === 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium text-sm",
        isZero
          ? "text-amber-600 dark:text-amber-400"
          : "text-foreground",
      )}
    >
      {isZero && <AlertTriangle className="h-3 w-3 shrink-0" />}
      {isZero ? "Not set" : formatLateFee(type, value)}
    </span>
  );
}

// ── Edit Dialog ───────────────────────────────────────────────────────────────

interface EditDialogProps {
  lease: AdminLease | null;
  open: boolean;
  onClose: () => void;
}

function EditDialog({ lease, open, onClose }: EditDialogProps) {
  const { mutate: patch, isPending } = usePatchLeaseBillingRules();
  const [syncFromProperty, setSyncFromProperty] = useState(false);
  const [form, setForm] = useState<{
    lateFeeType: string;
    lateFeeValue: string;
    gracePeriodDays: string;
    rentDayOfMonth: string;
    noticePeriodDays: string;
  }>({ lateFeeType: "flat", lateFeeValue: "", gracePeriodDays: "", rentDayOfMonth: "", noticePeriodDays: "" });

  // Populate form when lease changes
  const handleOpen = useCallback(() => {
    if (!lease) return;
    setSyncFromProperty(false);
    setForm({
      lateFeeType: lease.lateFeeType,
      lateFeeValue: String(lease.lateFeeValue),
      gracePeriodDays: String(lease.gracePeriodDays),
      rentDayOfMonth: String(lease.rentDayOfMonth),
      noticePeriodDays: String(lease.noticePeriodDays),
    });
  }, [lease]);

  function handleSubmit() {
    if (!lease) return;

    const body: LeaseBillingRulesPatch = syncFromProperty
      ? { syncFromProperty: true }
      : {
          lateFeeType: form.lateFeeType || undefined,
          lateFeeValue: form.lateFeeValue !== "" ? parseFloat(form.lateFeeValue) : undefined,
          gracePeriodDays: form.gracePeriodDays !== "" ? parseInt(form.gracePeriodDays) : undefined,
          rentDayOfMonth: form.rentDayOfMonth !== "" ? parseInt(form.rentDayOfMonth) : undefined,
          noticePeriodDays: form.noticePeriodDays !== "" ? parseInt(form.noticePeriodDays) : undefined,
        };

    patch(
      { leaseId: lease.id, body },
      {
        onSuccess: () => {
          toast.success(
            "Billing rules updated",
            syncFromProperty
              ? "Rules synced from property/unit configuration"
              : "Billing rules saved for this lease",
          );
          onClose();
        },
        onError: (err: any) =>
          toast.error("Update failed", err?.response?.data?.detail ?? "Please try again"),
      },
    );
  }

  if (!lease) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); else handleOpen(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            Edit Billing Rules
          </DialogTitle>
          <DialogDescription>
            {lease.tenantName ? (
              <>
                <span className="font-medium text-foreground">{lease.tenantName}</span>
                {lease.unitName && <> — {lease.unitName}</>}
                {lease.propertyName && <>, {lease.propertyName}</>}
              </>
            ) : (
              "Updating billing rules will affect future invoices and PDF agreements."
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Sync shortcut */}
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors duration-150",
            syncFromProperty
              ? "border-primary/50 bg-primary/5"
              : "border-border hover:border-primary/30 hover:bg-muted/40",
          )}
          onClick={() => setSyncFromProperty((p) => !p)}
        >
          <div className={cn(
            "h-4 w-4 rounded border-2 flex items-center justify-center transition-colors shrink-0",
            syncFromProperty ? "bg-primary border-primary" : "border-muted-foreground/40",
          )}>
            {syncFromProperty && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
          </div>
          <div>
            <p className="text-sm font-medium">Sync from property / unit</p>
            <p className="text-xs text-muted-foreground">
              Auto-detect all rules from the unit configuration (recommended)
            </p>
          </div>
        </div>

        {/* Manual fields */}
        <div className={cn(
          "space-y-4 transition-opacity duration-200",
          syncFromProperty ? "opacity-40 pointer-events-none select-none" : "opacity-100",
        )}>
          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Late Fee Type</Label>
              <Select
                value={form.lateFeeType}
                onValueChange={(v) => setForm((f) => ({ ...f, lateFeeType: v }))}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flat">Flat (UGX amount)</SelectItem>
                  <SelectItem value="percent">Percentage (%)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Late Fee Value{" "}
                <span className="text-muted-foreground font-normal">
                  ({form.lateFeeType === "percent" ? "%" : "UGX"})
                </span>
              </Label>
              <Input
                type="number"
                min={0}
                step={form.lateFeeType === "percent" ? 0.1 : 1000}
                value={form.lateFeeValue}
                onChange={(e) => setForm((f) => ({ ...f, lateFeeValue: e.target.value }))}
                placeholder="0"
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Rent Day of Month</Label>
              <Input
                type="number"
                min={1}
                max={28}
                value={form.rentDayOfMonth}
                onChange={(e) => setForm((f) => ({ ...f, rentDayOfMonth: e.target.value }))}
                placeholder="1"
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Grace Period (days)</Label>
              <Input
                type="number"
                min={0}
                value={form.gracePeriodDays}
                onChange={(e) => setForm((f) => ({ ...f, gracePeriodDays: e.target.value }))}
                placeholder="5"
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Notice Period (days)</Label>
              <Input
                type="number"
                min={0}
                value={form.noticePeriodDays}
                onChange={(e) => setForm((f) => ({ ...f, noticePeriodDays: e.target.value }))}
                placeholder="30"
                className="h-9 text-sm"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {syncFromProperty ? "Sync from Property" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Tab ──────────────────────────────────────────────────────────────────

export function LeaseBillingTab() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
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

  // Client-side search filter (on top of server pagination)
  const displayItems = (data?.items ?? []).filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.tenantName?.toLowerCase().includes(q) ||
      l.unitName?.toLowerCase().includes(q) ||
      l.propertyName?.toLowerCase().includes(q) ||
      l.organisationName?.toLowerCase().includes(q)
    );
  });

  const zeroFeeCount = (data?.items ?? []).filter((l) => l.lateFeeValue === 0).length;
  const selectedList = Array.from(selectedKeys);

  function syncOne(leaseId: string) {
    patch(
      { leaseId, body: { syncFromProperty: true } },
      {
        onSuccess: () => {
          setSelectedKeys((prev) => { const s = new Set(prev); s.delete(leaseId); return s; });
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
      } catch {
        // individual failures don't block the rest
      }
    }
    toast.success(
      `Synced ${succeeded} of ${selectedList.length} leases`,
      "Billing rules updated from property configuration",
    );
    setSelectedKeys(new Set());
    queryClient.invalidateQueries({ queryKey: ["admin-leases"] });
  }

  // ── Table columns ─────────────────────────────────────────────────────────

  const columns: Column<AdminLease>[] = [
    {
      key: "tenantName",
      header: "Tenant",
      render: (row) => (
        <div className="min-w-[140px]">
          <p className="font-medium text-sm truncate max-w-[180px]">
            {row.tenantName ?? <span className="text-muted-foreground italic">No tenant</span>}
          </p>
          <p className="text-xs text-muted-foreground truncate max-w-[180px]">
            {row.organisationName ?? "—"}
          </p>
        </div>
      ),
    },
    {
      key: "unitName",
      header: "Unit / Property",
      render: (row) => (
        <div className="min-w-[140px]">
          <p className="text-sm truncate max-w-[180px]">{row.unitName ?? "—"}</p>
          <p className="text-xs text-muted-foreground truncate max-w-[180px]">{row.propertyName ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge
          variant="outline"
          className={cn("capitalize text-xs", STATUS_STYLES[row.status] ?? "")}
        >
          {row.status.replace(/_/g, " ")}
        </Badge>
      ),
    },
    {
      key: "lateFeeValue",
      header: "Late Fee",
      render: (row) => <LateFeeCell type={row.lateFeeType} value={row.lateFeeValue} />,
    },
    {
      key: "gracePeriodDays",
      header: "Grace / Due Day",
      render: (row) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {row.gracePeriodDays}d grace · day {row.rentDayOfMonth}
        </span>
      ),
    },
    {
      key: "noticePeriodDays",
      header: "Notice",
      render: (row) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {row.noticePeriodDays} days
        </span>
      ),
    },
    {
      key: "id",
      header: "",
      className: "text-right",
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); setEditLease(row); }}
          >
            <PenLine className="h-3 w-3" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs gap-1"
            onClick={(e) => { e.stopPropagation(); syncOne(row.id); }}
            disabled={patching}
          >
            <RefreshCw className="h-3 w-3" />
            Sync
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="space-y-4">
        {/* ── Alert banner (zero-fee leases detected) ───────────────────── */}
        {!isLoading && zeroFeeCount > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {zeroFeeCount} lease{zeroFeeCount !== 1 ? "s" : ""} on this page have no late fee configured
              </p>
              <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-0.5">
                These were likely created via CSV import before the billing rules fix was deployed.
                Use <strong>Sync</strong> per row or select multiple and bulk-sync.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/30 h-7 text-xs gap-1"
              onClick={() => setZeroOnly((p) => !p)}
            >
              <FileText className="h-3 w-3" />
              {zeroOnly ? "Show all" : "Show only these"}
            </Button>
          </div>
        )}

        {/* ── Filter bar ────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">Lease Billing Rules</CardTitle>
                <CardDescription>
                  Correct billing fields across all organisations. Changes apply to future invoices
                  and regenerated PDF agreements.
                </CardDescription>
              </div>
              {zeroOnly && (
                <Badge
                  variant="outline"
                  className="w-fit border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:bg-amber-950/30 gap-1 cursor-pointer"
                  onClick={() => setZeroOnly(false)}
                >
                  <AlertTriangle className="h-3 w-3" />
                  Showing zero-fee only
                  <X className="h-3 w-3 ml-0.5" />
                </Badge>
              )}
            </div>

            <Separator className="mt-3" />

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center pt-1">
              {/* Search */}
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search tenant, unit, property…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Status filter */}
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[160px] h-8 text-sm">
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
                onClick={() => { setZeroOnly((p) => !p); setPage(1); }}
              >
                <AlertTriangle className="h-3 w-3" />
                Zero late fee only
              </Button>

              <div className="sm:ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                {data && (
                  <span>{data.total.toLocaleString()} lease{data.total !== 1 ? "s" : ""}</span>
                )}
              </div>
            </div>
          </CardHeader>

          {/* ── Bulk action bar (visible when rows selected) ────────────── */}
          {selectedKeys.size > 0 && (
            <div className="mx-4 mb-3 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
              <span className="text-sm font-medium text-primary">
                {selectedKeys.size} selected
              </span>
              <Separator orientation="vertical" className="h-4" />
              <Button
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={syncSelected}
                disabled={patching}
              >
                {patching ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Download className="h-3 w-3" />
                )}
                Sync {selectedKeys.size} from property
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs ml-auto"
                onClick={() => setSelectedKeys(new Set())}
              >
                Clear selection
              </Button>
            </div>
          )}

          <CardContent className="pt-0">
            <DataTable<AdminLease>
              data={displayItems}
              columns={columns}
              loading={isLoading}
              rowKey={(row) => row.id}
              selectable
              selectedKeys={selectedKeys}
              onSelectionChange={setSelectedKeys}
              totalItems={data?.total ?? 0}
              currentPage={page}
              onPageChange={setPage}
              emptyTitle={zeroOnly ? "No zero-fee leases found" : "No leases found"}
              emptyDescription={
                zeroOnly
                  ? "All leases on this page have a late fee configured."
                  : "Try adjusting your filters."
              }
            />
          </CardContent>
        </Card>
      </div>

      {/* ── Edit dialog ────────────────────────────────────────────────────── */}
      <EditDialog
        lease={editLease}
        open={!!editLease}
        onClose={() => setEditLease(null)}
      />
    </>
  );
}

