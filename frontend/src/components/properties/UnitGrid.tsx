"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, LayoutGrid, List } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BulkOperationsBar } from "./BulkOperationsBar";
import { FilterBar } from "@/components/common/FilterBar";
import { formatCurrency } from "@/utils/formatters";
import { cn } from "@/utils/cn";
import { useUnits } from "@/hooks/useProperties";
import type { Unit, UnitStatus } from "@/types";

const STATUS_STYLES: Record<UnitStatus, { badge: string; card: string }> = {
  available: {
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30",
    card: "border-emerald-200 dark:border-emerald-800 hover:border-emerald-400",
  },
  occupied: {
    badge: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30",
    card: "border-border hover:border-indigo-300",
  },
  reserved: {
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/30",
    card: "border-amber-200 dark:border-amber-800 hover:border-amber-400",
  },
  maintenance: {
    badge: "bg-red-100 text-red-800 dark:bg-red-900/30",
    card: "border-red-200 dark:border-red-800 hover:border-red-400",
  },
};

interface UnitCardProps {
  unit: Unit;
  selected: boolean;
  onSelect: () => void;
  onClick: () => void;
}

function UnitCard({ unit, selected, onSelect, onClick }: UnitCardProps) {
  const styles = STATUS_STYLES[unit.status];
  return (
    <div
      className={cn(
        "relative rounded-xl border-2 p-4 cursor-pointer transition-all duration-150",
        "hover:shadow-md",
        styles.card,
        selected && "ring-2 ring-primary ring-offset-2",
      )}
      onClick={onClick}
      role="button"
      aria-label={`Unit ${unit.name}`}
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      {/* Select checkbox */}
      <div
        className="absolute top-2 left-2"
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          className="rounded border-border"
          aria-label={`Select ${unit.name}`}
        />
      </div>

      <div className="mt-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm leading-tight">{unit.name}</h3>
          <span className={cn("text-xs font-medium rounded-full px-2 py-0.5 capitalize shrink-0", styles.badge)}>
            {unit.status}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 capitalize">{unit.type.replace("_", " ")}</p>
        <div className="mt-3 flex items-end justify-between">
          <div className="text-xs text-muted-foreground">
            {unit.bedrooms}bd · {unit.area ?? "—"}m²
          </div>
          <p className="text-sm font-bold">
            {formatCurrency(unit.monthlyRent, unit.currency)}<span className="text-xs font-normal text-muted-foreground">/mo</span>
          </p>
        </div>
      </div>
    </div>
  );
}

interface UnitGridProps {
  propertyId: string;
}

export function UnitGrid({ propertyId }: UnitGridProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const parentRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useUnits(propertyId);
  const units = data?.data ?? [];

  const filtered = units.filter((u) =>
    !search || u.name.toLowerCase().includes(search.toLowerCase()),
  );

  // Virtualizer for large lists
  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(filtered.length / 3),
    getScrollElement: () => parentRef.current,
    estimateSize: () => 140,
    overscan: 5,
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          placeholder="Search units..."
          className="flex-1"
        />
        <div className="flex items-center gap-1 rounded-lg border p-1">
          <Button
            variant={viewMode === "grid" ? "default" : "ghost"}
            size="icon-sm"
            onClick={() => setViewMode("grid")}
            aria-label="Grid view"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "ghost"}
            size="icon-sm"
            onClick={() => setViewMode("list")}
            aria-label="List view"
          >
            <List className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Button size="sm" onClick={() => router.push(`/properties/${propertyId}/units/new`)}>
          <Plus className="h-4 w-4" />
          Add Unit
        </Button>
      </div>

      {/* Summary */}
      <div className="flex gap-2 flex-wrap text-xs">
        {(["available", "occupied", "reserved", "maintenance"] as UnitStatus[]).map((s) => {
          const count = units.filter((u) => u.status === s).length;
          return (
            <Badge key={s} variant="slate" className={cn("capitalize gap-1", STATUS_STYLES[s].badge)}>
              <span>{count}</span> {s}
            </Badge>
          );
        })}
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <BulkOperationsBar
          selectedCount={selected.size}
          propertyId={propertyId}
          selectedIds={Array.from(selected)}
          onClear={() => setSelected(new Set())}
        />
      )}

      {/* Grid — virtualised for 100+ units */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border-2 border-border p-4 space-y-2 animate-pulse">
              <div className="h-4 bg-muted rounded w-2/3" />
              <div className="h-3 bg-muted rounded w-1/2" />
              <div className="h-5 bg-muted rounded w-1/3 mt-3" />
            </div>
          ))}
        </div>
      ) : (
        <div
          ref={parentRef}
          className="overflow-y-auto"
          style={{ maxHeight: "calc(100vh - 300px)" }}
        >
          <div
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
            style={{ height: rowVirtualizer.getTotalSize() }}
          >
            {filtered.map((unit) => (
              <UnitCard
                key={unit.id}
                unit={unit}
                selected={selected.has(unit.id)}
                onSelect={() => toggleSelect(unit.id)}
                onClick={() => router.push(`/properties/${propertyId}/units/${unit.id}`)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
