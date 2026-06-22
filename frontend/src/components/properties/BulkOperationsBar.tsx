"use client";

import { useState } from "react";
import { X, CheckSquare, Trash2, Pencil, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useBatchDeleteUnits, useBatchRenameUnits, useBulkUpdateUnits } from "@/hooks/useProperties";
import type { UnitStatus } from "@/types";

interface BulkOperationsBarProps {
  selectedCount: number;
  propertyId: string;
  selectedIds: string[];
  onClear: () => void;
}

type ActivePanel = "status" | "rename" | null;

export function BulkOperationsBar({
  selectedCount,
  propertyId,
  selectedIds,
  onClear,
}: BulkOperationsBarProps) {
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);

  // Status panel
  const [statusValue, setStatusValue] = useState<UnitStatus | "">("");
  const { mutate: bulkUpdate, isPending: isStatusPending } = useBulkUpdateUnits();

  // Rename panel
  const [prefix, setPrefix] = useState("");
  const [startNumber, setStartNumber] = useState(1);
  const [padding, setPadding] = useState(3);
  const { mutate: batchRename, isPending: isRenamePending } = useBatchRenameUnits();
  const previewFirst = prefix ? `${prefix} ${String(startNumber).padStart(padding, "0")}` : "";
  const previewLast =
    prefix && selectedCount > 1
      ? `${prefix} ${String(startNumber + selectedCount - 1).padStart(padding, "0")}`
      : "";

  // Delete
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const { mutate: batchDelete, isPending: isDeletePending } = useBatchDeleteUnits();

  function togglePanel(panel: ActivePanel) {
    setActivePanel((prev) => (prev === panel ? null : panel));
  }

  function applyStatus() {
    if (!statusValue) return;
    bulkUpdate(
      { propertyId, unitIds: selectedIds, data: { status: statusValue as UnitStatus } },
      { onSuccess: onClear },
    );
  }

  function applyRename() {
    if (!prefix.trim()) return;
    batchRename(
      { propertyId, unitIds: selectedIds, prefix: prefix.trim(), startNumber, padding },
      { onSuccess: onClear },
    );
  }

  function applyDelete() {
    batchDelete({ propertyId, unitIds: selectedIds }, { onSuccess: onClear });
  }

  return (
    <>
      <div
        className="rounded-[6px] border bg-primary/5 border-primary/20 px-4 py-3 space-y-3"
        role="toolbar"
        aria-label="Bulk actions"
      >
        {/* Action row */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-primary mr-1">
            {selectedCount} unit{selectedCount !== 1 ? "s" : ""} selected
          </span>

          <Button
            size="sm"
            variant={activePanel === "status" ? "default" : "outline"}
            onClick={() => togglePanel("status")}
            className="h-7 px-2 text-xs gap-1"
          >
            Change Status
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>

          <Button
            size="sm"
            variant={activePanel === "rename" ? "default" : "outline"}
            onClick={() => togglePanel("rename")}
            className="h-7 px-2 text-xs gap-1"
          >
            <Pencil className="h-3.5 w-3.5" />
            Rename
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={isDeletePending}
            loading={isDeletePending}
            className="h-7 px-2 text-xs gap-1 text-destructive border-destructive/40 hover:bg-destructive hover:text-destructive-foreground"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>

          <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Clear selection" className="ml-auto h-7 w-7">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Status panel */}
        {activePanel === "status" && (
          <div className="flex items-center gap-2 pt-2 border-t border-primary/10">
            <Select value={statusValue} onValueChange={(v) => setStatusValue(v as UnitStatus)}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="Choose status…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="reserved">Reserved</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={applyStatus}
              disabled={!statusValue || isStatusPending}
              loading={isStatusPending}
              className="h-8"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              Apply
            </Button>
          </div>
        )}

        {/* Rename panel */}
        {activePanel === "rename" && (
          <div className="space-y-2 pt-2 border-t border-primary/10">
            <p className="text-xs text-muted-foreground">
              Units are numbered sequentially in creation order. Enter a prefix to generate names like{" "}
              <span className="font-mono">Room 001</span>.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="h-8 w-40 text-xs"
                placeholder="Prefix e.g. Room"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                autoFocus
              />
              <span className="text-xs text-muted-foreground">from</span>
              <Input
                className="h-8 w-16 text-xs"
                type="number"
                min={1}
                value={startNumber}
                onChange={(e) => setStartNumber(Math.max(1, parseInt(e.target.value) || 1))}
              />
              <span className="text-xs text-muted-foreground">digits</span>
              <Select value={String(padding)} onValueChange={(v) => setPadding(Number(v))}>
                <SelectTrigger className="h-8 w-16 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={applyRename}
                disabled={!prefix.trim() || isRenamePending}
                loading={isRenamePending}
                className="h-8"
              >
                <Pencil className="h-3.5 w-3.5" />
                Rename All
              </Button>
            </div>
            {previewFirst && (
              <p className="text-xs text-muted-foreground">
                Preview:{" "}
                <span className="font-mono font-medium text-foreground">{previewFirst}</span>
                {previewLast && (
                  <>
                    {" "}→{" "}
                    <span className="font-mono font-medium text-foreground">{previewLast}</span>
                  </>
                )}
              </p>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={`Delete ${selectedCount} unit${selectedCount !== 1 ? "s" : ""}?`}
        description="Occupied units will be skipped automatically. All other selected units will be archived and can be restored by a superadmin."
        variant="destructive"
        confirmLabel="Delete Vacant Units"
        onConfirm={() => {
          setConfirmDeleteOpen(false);
          applyDelete();
        }}
      />
    </>
  );
}
