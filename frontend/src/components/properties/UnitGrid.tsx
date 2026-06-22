"use client";

import { useState, useRef } from "react";
import React from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  LayoutGrid,
  List,
  ChevronRight,
  BedDouble,
  Bath,
  Maximize2,
  Pencil,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BulkOperationsBar } from "./BulkOperationsBar";
import { FilterBar } from "@/components/common/FilterBar";
import { formatCurrency } from "@/utils/formatters";
import { cn } from "@/utils/cn";
import { useUnits, useUpdateUnit } from "@/hooks/useProperties";
import type { Unit, UnitStatus } from "@/types";

const STATUS_STYLES: Record<
  UnitStatus,
  { badge: string; card: string; dot: string }
> = {
  available: {
    badge:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-100/40 dark:text-emerald-300",
    card: "border-emerald-200 dark:border-emerald-200 hover:border-emerald-400",
    dot: "bg-emerald-500",
  },
  occupied: {
    badge:
      "bg-indigo-100 text-indigo-800 dark:bg-indigo-100/40 dark:text-indigo-300",
    card: "border-border hover:border-indigo-300",
    dot: "bg-indigo-500",
  },
  reserved: {
    badge:
      "bg-amber-100 text-amber-800 dark:bg-amber-100/40 dark:text-amber-300",
    card: "border-amber-200 dark:border-amber-200 hover:border-amber-400",
    dot: "bg-amber-500",
  },
  maintenance: {
    badge: "bg-red-100 text-red-800 dark:bg-red-100/40 dark:text-red-300",
    card: "border-red-200 dark:border-red-200 hover:border-red-400",
    dot: "bg-red-500",
  },
};

const ALL_STATUSES: UnitStatus[] = [
  "available",
  "occupied",
  "reserved",
  "maintenance",
];

// ── Inline rename ─────────────────────────────────────────────────────────────

function InlineName({
  unit,
  propertyId,
  className,
}: {
  unit: Unit;
  propertyId: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(unit.name);
  const { mutate: updateUnit, isPending } = useUpdateUnit();

  function commit() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === unit.name) {
      setDraft(unit.name);
      setEditing(false);
      return;
    }
    updateUnit(
      { propertyId, unitId: unit.id, data: { name: trimmed } },
      { onSuccess: () => setEditing(false), onError: () => { setDraft(unit.name); setEditing(false); } },
    );
  }

  if (editing) {
    return (
      <input
        className={cn("border rounded px-1 py-0.5 text-sm font-semibold leading-tight bg-background outline-none focus:ring-1 focus:ring-primary w-full", className)}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { setDraft(unit.name); setEditing(false); }
        }}
        disabled={isPending}
        autoFocus
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span
      className={cn("group/name flex items-center gap-1 cursor-text", className)}
      onClick={(e) => { e.stopPropagation(); setDraft(unit.name); setEditing(true); }}
      title="Click to rename"
    >
      <span className="font-semibold text-sm leading-tight">{unit.name}</span>
      <Pencil className="h-3 w-3 opacity-0 group-hover/name:opacity-40 transition-opacity shrink-0" />
    </span>
  );
}

// ── Grid card ─────────────────────────────────────────────────────────────────

const UnitCard = React.memo(function UnitCard({
  unit,
  propertyId,
  selected,
  onSelect,
  onClick,
}: {
  unit: Unit;
  propertyId: string;
  selected: boolean;
  onSelect: () => void;
  onClick: () => void;
}) {
  const styles = STATUS_STYLES[unit.status];
  return (
    <div
      className={cn(
        "relative rounded-[6px] border-2 p-4 cursor-pointer transition-all duration-150 hover:shadow-md",
        styles.card,
        selected && "ring-2 ring-primary ring-offset-2",
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      <div
        className="absolute top-2 left-2"
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
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
          <InlineName unit={unit} propertyId={propertyId} />
          <span
            className={cn(
              "text-xs font-medium rounded-full px-2 py-0.5 capitalize shrink-0",
              styles.badge,
            )}
          >
            {unit.status}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 capitalize">
          {unit.type.replace(/_/g, " ")}
        </p>
        {/* Uganda feature chips */}
        <div className="mt-1.5 flex flex-wrap gap-1">
          {unit.isSelfContained && (
            <span className="text-[10px] rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 font-medium">SC</span>
          )}
          {unit.hasDomesticQuarters && (
            <span className="chip">BQ</span>
          )}
          {unit.furnishedStatus && unit.furnishedStatus !== "unfurnished" && (
            <span className="chip capitalize">
              {unit.furnishedStatus === "semi_furnished" ? "Semi" : "Furnished"}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-end justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <BedDouble className="h-3 w-3" />
              {unit.bedrooms}
            </span>
            <span className="flex items-center gap-0.5">
              <Bath className="h-3 w-3" />
              {unit.bathrooms}
            </span>
            {unit.area && (
              <span className="flex items-center gap-0.5">
                <Maximize2 className="h-3 w-3" />
                {unit.area}m²
              </span>
            )}
          </div>
          <p className="text-sm font-bold">
            {formatCurrency(unit.monthlyRent, unit.currency)}
            <span className="text-xs font-normal text-muted-foreground">
              /mo
            </span>
          </p>
        </div>
      </div>
    </div>
  );
});

// ── List row ──────────────────────────────────────────────────────────────────

const UnitRow = React.memo(function UnitRow({
  unit,
  propertyId,
  selected,
  onSelect,
  onClick,
}: {
  unit: Unit;
  propertyId: string;
  selected: boolean;
  onSelect: () => void;
  onClick: () => void;
}) {
  const styles = STATUS_STYLES[unit.status];
  return (
    <tr
      className="group border-b last:border-0 hover:bg-primary/5 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <td
        className="py-3 px-4 w-8"
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          className="rounded border-border"
          aria-label={`Select ${unit.name}`}
        />
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full shrink-0", styles.dot)} />
          <InlineName unit={unit} propertyId={propertyId} />
          {unit.floor != null && (
            <span className="text-xs text-muted-foreground">
              Floor {unit.floor}
            </span>
          )}
        </div>
      </td>
      <td className="py-3 px-4 text-sm text-muted-foreground hidden sm:table-cell">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="capitalize">{unit.type.replace(/_/g, " ")}</span>
          {unit.isSelfContained && (
            <span className="text-[10px] rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 font-medium">SC</span>
          )}
          {unit.hasDomesticQuarters && (
            <span className="chip">BQ</span>
          )}
          {unit.furnishedStatus && unit.furnishedStatus !== "unfurnished" && (
            <span className="chip">
              {unit.furnishedStatus === "semi_furnished" ? "Semi" : "Furn."}
            </span>
          )}
        </div>
      </td>
      <td className="py-3 px-4">
        <span
          className={cn(
            "text-xs font-medium rounded-full px-2 py-0.5 capitalize",
            styles.badge,
          )}
        >
          {unit.status}
        </span>
      </td>
      <td className="py-3 px-4 text-sm text-muted-foreground hidden md:table-cell">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <BedDouble className="h-3.5 w-3.5" />
            {unit.bedrooms}
          </span>
          <span className="flex items-center gap-1">
            <Bath className="h-3.5 w-3.5" />
            {unit.bathrooms}
          </span>
        </div>
      </td>
      <td className="py-3 px-4 text-sm text-muted-foreground hidden lg:table-cell">
        {unit.area ? `${unit.area} m²` : "—"}
      </td>
      <td className="py-3 px-4 text-sm font-semibold text-right">
        {formatCurrency(unit.monthlyRent, unit.currency)}
        <span className="text-xs font-normal text-muted-foreground">/mo</span>
      </td>
      <td className="py-3 px-4 w-8">
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
      </td>
    </tr>
  );
});

// ── Main component ────────────────────────────────────────────────────────────

interface UnitGridProps {
  propertyId: string;
}

export function UnitGrid({ propertyId }: UnitGridProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [statusFilter, setStatusFilter] = useState<UnitStatus | "all">("all");
  const parentRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useUnits(propertyId);
  const units = data?.data ?? [];

  const filtered = units.filter((u) => {
    const matchesSearch =
      !search || u.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || u.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(filtered.length / 4),
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

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((u) => u.id)));
    }
  };

  const navigateTo = (unitId: string) =>
    router.push(`/properties/${propertyId}/units/${unitId}`);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex gap-2 items-center flex-wrap">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          placeholder="Search units..."
          className="flex-1 min-w-[180px]"
        />

        {/* Status filter */}
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as UnitStatus | "all")}>
          <SelectTrigger className="w-[130px]" aria-label="Filter by status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {ALL_STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* View toggle */}
        <div className="flex items-center gap-1 rounded-[6px] border p-1">
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

        <Button
          size="sm"
          onClick={() => router.push(`/properties/${propertyId}/units/new`)}
        >
          <Plus className="h-4 w-4" />
          Add Unit
        </Button>
      </div>

      {/* Status summary */}
      <div className="flex gap-2 flex-wrap text-xs">
        {ALL_STATUSES.map((s) => {
          const count = units.filter((u) => u.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
              className={cn(
                "rounded-full px-2.5 py-0.5 capitalize font-medium transition-opacity",
                STATUS_STYLES[s].badge,
                statusFilter !== "all" && statusFilter !== s && "opacity-40",
              )}
            >
              {count} {s}
            </button>
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

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[6px] border-2 border-border p-4 space-y-2 animate-pulse"
            >
              <div className="h-4 bg-muted rounded w-2/3" />
              <div className="h-3 bg-muted rounded w-1/2" />
              <div className="h-5 bg-muted rounded w-1/3 mt-3" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <p className="text-sm">No units match your filters</p>
          {(search || statusFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : viewMode === "grid" ? (
        <div
          ref={parentRef}
          className="overflow-y-auto"
          style={{ maxHeight: "calc(100vh - 320px)" }}
        >
          <div
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
            style={{ height: rowVirtualizer.getTotalSize() || "auto" }}
          >
            {filtered.map((unit) => (
              <UnitCard
                key={unit.id}
                unit={unit}
                propertyId={propertyId}
                selected={selected.has(unit.id)}
                onSelect={() => toggleSelect(unit.id)}
                onClick={() => navigateTo(unit.id)}
              />
            ))}
          </div>
        </div>
      ) : (
        /* List view */
        <div className="rounded-[6px] border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-primary/5">
                <th className="py-2.5 px-4 w-8 text-left">
                  <input
                    type="checkbox"
                    checked={
                      selected.size === filtered.length && filtered.length > 0
                    }
                    ref={(el) => {
                      if (el)
                        el.indeterminate =
                          selected.size > 0 && selected.size < filtered.length;
                    }}
                    onChange={toggleSelectAll}
                    className="rounded border-border"
                    aria-label="Select all"
                  />
                </th>
                <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">
                  Unit
                </th>
                <th className="py-2.5 px-4 text-left font-medium text-muted-foreground hidden sm:table-cell">
                  Type
                </th>
                <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">
                  Status
                </th>
                <th className="py-2.5 px-4 text-left font-medium text-muted-foreground hidden md:table-cell">
                  Beds / Baths
                </th>
                <th className="py-2.5 px-4 text-left font-medium text-muted-foreground hidden lg:table-cell">
                  Area
                </th>
                <th className="py-2.5 px-4 text-right font-medium text-muted-foreground">
                  Rent / mo
                </th>
                <th className="py-2.5 px-4 w-8" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((unit) => (
                <UnitRow
                  key={unit.id}
                  unit={unit}
                  propertyId={propertyId}
                  selected={selected.has(unit.id)}
                  onSelect={() => toggleSelect(unit.id)}
                  onClick={() => navigateTo(unit.id)}
                />
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t bg-primary/5 text-xs text-muted-foreground">
            {filtered.length} of {units.length} unit
            {units.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}
    </div>
  );
}
