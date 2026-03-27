"use client";

import { useState } from "react";
import { X, Wrench, CheckSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useBulkUpdateUnits } from "@/hooks/useProperties";
import type { UnitStatus } from "@/types";

interface BulkOperationsBarProps {
  selectedCount: number;
  propertyId: string;
  selectedIds: string[];
  onClear: () => void;
}

export function BulkOperationsBar({
  selectedCount,
  propertyId,
  selectedIds,
  onClear,
}: BulkOperationsBarProps) {
  const [statusValue, setStatusValue] = useState<UnitStatus | "">("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { mutate: bulkUpdate, isPending } = useBulkUpdateUnits();

  const applyStatus = () => {
    if (!statusValue) return;
    bulkUpdate(
      { propertyId, unitIds: selectedIds, data: { status: statusValue as UnitStatus } },
      { onSuccess: onClear },
    );
  };

  return (
    <>
      <div
        className="flex flex-wrap items-center gap-3 rounded-xl border bg-primary/5 border-primary/20 px-4 py-3"
        role="toolbar"
        aria-label="Bulk actions"
      >
        <span className="text-sm font-semibold text-primary">
          {selectedCount} unit{selectedCount !== 1 ? "s" : ""} selected
        </span>

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={statusValue} onValueChange={(v) => setStatusValue(v as UnitStatus)}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="Change status…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
              <SelectItem value="reserved">Reserved</SelectItem>
            </SelectContent>
          </Select>

          <Button
            size="sm"
            variant="outline"
            onClick={applyStatus}
            disabled={!statusValue}
            loading={isPending}
          >
            <CheckSquare className="h-3.5 w-3.5" />
            Apply
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmOpen(true)}
            className="text-destructive border-destructive/40 hover:bg-destructive hover:text-destructive-foreground"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>

        <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Clear selection" className="ml-auto">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${selectedCount} unit${selectedCount !== 1 ? "s" : ""}?`}
        description="This will permanently delete the selected units. Active leases on these units will be affected."
        variant="destructive"
        confirmLabel="Delete All"
        onConfirm={() => { setConfirmOpen(false); onClear(); }}
      />
    </>
  );
}
