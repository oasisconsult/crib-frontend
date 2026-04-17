"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Building2, Home, MapPin, LayoutGrid, List, ChevronRight, TrendingUp,
  Warehouse, Hotel, Briefcase, Castle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardSkeleton } from "@/components/common/LoadingSkeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { FilterBar } from "@/components/common/FilterBar";
import { formatCurrencyCompact } from "@/utils/formatters";
import { useProperties } from "@/hooks/useProperties";
import { useAppStore } from "@/store/useAppStore";
import { cn } from "@/utils/cn";
import { PageHeader } from "@/components/common/PageHeader";
import type { Property, PropertyStatus, PropertyType } from "@/types";

// WCAG 1.4.1 — status is always shown as text label; colour is supplementary
const STATUS_STYLES: Record<PropertyStatus, string> = {
  active:      "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300",
  inactive:    "bg-muted text-muted-foreground",
  maintenance: "bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300",
};

const STATUS_DOT: Record<PropertyStatus, string> = {
  active:      "bg-emerald-500",
  inactive:    "bg-muted-foreground",
  maintenance: "bg-amber-500",
};

const TYPE_LABELS: Record<PropertyType, string> = {
  flat:       "Flat / Apartment",
  house:      "House",
  hostel:     "Hostel / Lodge",
  commercial: "Commercial",
  villa:      "Villa",
};

const ALL_TYPES: PropertyType[] = ["flat", "house", "hostel", "commercial", "villa"];
const ALL_STATUSES: PropertyStatus[] = ["active", "inactive", "maintenance"];

// ── Property type config ──────────────────────────────────────────────────

const TYPE_CONFIG: Record<PropertyType, { gradient: string; icon: React.ComponentType<{ className?: string }> }> = {
  flat:       { gradient: "from-[hsl(168,82%,32%)] to-[hsl(187,83%,28%)]", icon: Building2 },
  house:      { gradient: "from-[hsl(43,90%,40%)] to-[hsl(32,89%,44%)]",  icon: Home },
  hostel:     { gradient: "from-[hsl(230,28%,26%)] to-[hsl(230,28%,18%)]", icon: Hotel },
  commercial: { gradient: "from-[hsl(187,83%,26%)] to-[hsl(230,28%,22%)]", icon: Briefcase },
  villa:      { gradient: "from-[hsl(170,81%,28%)] to-[hsl(168,82%,20%)]", icon: Castle },
};

// ── Grid card ─────────────────────────────────────────────────────────────

function PropertyCard({ property, onClick }: { property: Property; onClick: () => void }) {
  const occupancyPct = property.totalUnits > 0
    ? Math.round((property.occupiedUnits / property.totalUnits) * 100)
    : 0;

  const typeConf = TYPE_CONFIG[property.type] ?? TYPE_CONFIG.flat;
  const TypeIcon = typeConf.icon;

  const occupancyColor = occupancyPct >= 80
    ? "bg-[hsl(var(--success))]"
    : occupancyPct >= 50
    ? "bg-[hsl(var(--warning))]"
    : "bg-[hsl(var(--danger))]";

  const occupancyTextColor = occupancyPct >= 80
    ? "text-[hsl(var(--success))]"
    : occupancyPct >= 50
    ? "text-[hsl(var(--warning))]"
    : "text-[hsl(var(--danger))]";

  return (
    <div
      className="group cursor-pointer rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200 overflow-hidden focus-within:ring-2 focus-within:ring-[hsl(var(--ring))] focus-within:ring-offset-2"
      onClick={onClick}
      role="article"
    >
      {/* ── Header ── */}
      {property.coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={property.coverImage}
          alt={`${property.name} cover`}
          className="w-full h-36 object-cover"
        />
      ) : (
        <div
          className={cn("relative h-36 bg-gradient-to-br", typeConf.gradient)}
          aria-hidden="true"
        >
          {/* Decorative circles */}
          <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full bg-white/10" />
          <div className="absolute -bottom-4 -left-4 h-16 w-16 rounded-full bg-white/10" />

          {/* Centred icon */}
          <div className="flex h-full items-center justify-center relative z-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 border border-white/30 backdrop-blur-sm">
              <TypeIcon className="h-7 w-7 text-white" />
            </div>
          </div>

          {/* Type pill — bottom left */}
          <span className="absolute bottom-3 left-3 text-[10px] font-semibold rounded-md bg-black/25 text-white/90 px-2 py-0.5 backdrop-blur-sm">
            {TYPE_LABELS[property.type] ?? property.type}
          </span>

          {/* Status — top right */}
          <span className={cn(
            "absolute top-3 right-3 flex items-center gap-1 text-[10px] font-semibold rounded-full px-2.5 py-1 capitalize",
            STATUS_STYLES[property.status],
          )}>
            <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[property.status])} />
            {property.status}
          </span>
        </div>
      )}

      {/* ── Body ── */}
      <div className="p-4">
        {/* Name + location */}
        <div className="mb-3">
          <h3 className="font-semibold text-[hsl(var(--foreground))] text-[15px] leading-snug group-hover:text-[hsl(var(--primary))] transition-colors">
            {property.name}
          </h3>
          <p className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
            {property.address.city}, {property.address.country}
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { label: "Units",    value: String(property.totalUnits) },
            { label: "Occupied", value: `${property.occupiedUnits}/${property.totalUnits}`, colored: true },
            { label: "Rate",     value: `${occupancyPct}%`, rate: true },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-[hsl(var(--muted))]/60 px-2 py-1.5">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-0.5">{s.label}</p>
              <p className={cn(
                "text-sm font-bold",
                s.colored ? "text-[hsl(var(--primary))]" : s.rate ? occupancyTextColor : "text-[hsl(var(--foreground))]",
              )}>
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* Occupancy bar */}
        <div
          className="h-1.5 w-full bg-[hsl(var(--muted))] rounded-full overflow-hidden mb-3"
          role="progressbar"
          aria-valuenow={occupancyPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${occupancyPct}% occupied`}
        >
          <div className={cn("h-full rounded-full transition-all duration-500", occupancyColor)} style={{ width: `${occupancyPct}%` }} />
        </div>

        {/* Revenue */}
        <div className="flex items-center justify-between pt-3 border-t border-[hsl(var(--border))]">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-0.5">Monthly Revenue</p>
            <p className="text-lg font-bold text-[hsl(var(--foreground))]">
              {formatCurrencyCompact(property.monthlyRevenue, property.currency || "UGX")}
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-[hsl(var(--success))]/10 px-2.5 py-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-[hsl(var(--success))]" aria-hidden="true" />
            <span className="text-xs font-semibold text-[hsl(var(--success))]">+12%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── List row ──────────────────────────────────────────────────────────────

function PropertyRow({ property, onClick }: { property: Property; onClick: () => void }) {
  const occupancyPct = property.totalUnits > 0
    ? Math.round((property.occupiedUnits / property.totalUnits) * 100)
    : 0;

  return (
    <tr
      className="group border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors focus-within:bg-muted/40"
      onClick={onClick}
    >
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground" aria-hidden="true">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <p className="font-medium text-sm leading-tight text-foreground group-hover:text-primary transition-colors">
              {property.name}
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-0.5 mt-0.5">
              <MapPin className="h-3 w-3" aria-hidden="true" />{property.address.city}
            </p>
          </div>
        </div>
      </td>
      <td className="py-3 px-4 text-sm text-muted-foreground hidden sm:table-cell capitalize">
        {TYPE_LABELS[property.type] ?? property.type}
      </td>
      <td className="py-3 px-4 hidden md:table-cell">
        <div className="text-sm text-foreground">
          <span className="font-medium">{property.occupiedUnits}</span>
          <span className="text-muted-foreground">/{property.totalUnits}</span>
          <span className="ml-2 text-xs text-muted-foreground">units</span>
        </div>
      </td>
      <td className="py-3 px-4 hidden lg:table-cell">
        <div className="flex items-center gap-2">
          {/* WCAG 4.1.3 — progress bar with aria attributes */}
          <div
            className="h-1.5 w-20 rounded-full bg-muted overflow-hidden"
            role="progressbar"
            aria-valuenow={occupancyPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${occupancyPct}% occupied`}
          >
            <div
              className={cn("h-full rounded-full transition-all",
                occupancyPct >= 80 ? "bg-emerald-500" : occupancyPct >= 50 ? "bg-amber-500" : "bg-red-400"
              )}
              style={{ width: `${occupancyPct}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{occupancyPct}%</span>
        </div>
      </td>
      <td className="py-3 px-4 text-sm font-semibold hidden md:table-cell text-foreground">
        <div className="flex items-center gap-1">
          <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          {formatCurrencyCompact(property.monthlyRevenue, property.currency || "UGX")}
        </div>
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full shrink-0", STATUS_DOT[property.status])} aria-hidden="true" />
          <span className={cn("text-xs font-medium rounded-full px-2 py-0.5 capitalize", STATUS_STYLES[property.status])}>
            {property.status}
          </span>
        </div>
      </td>
      <td className="py-3 px-4 w-8">
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" aria-hidden="true" />
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function PropertiesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<PropertyType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<PropertyStatus | "all">("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const { data, isLoading } = useProperties();
  const setActiveProperty = useAppStore((s) => s.setActiveProperty);

  const allProperties = data?.data ?? [];

  const properties = allProperties.filter((p) => {
    const matchesSearch = !search
      || p.name.toLowerCase().includes(search.toLowerCase())
      || p.address.city.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "all" || p.type === typeFilter;
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  function navigate(property: Property) {
    setActiveProperty(property);
    router.push(`/properties/${property.id}`);
  }

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading properties">
        <div className="flex items-center justify-between">
          <div className="h-8 w-40 bg-muted rounded animate-pulse" />
          <div className="h-9 w-32 bg-muted rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Properties"
        description={`${data?.total ?? 0} properties in your portfolio`}
        actions={
          <Button onClick={() => router.push("/properties/new")}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Property
          </Button>
        }
      />

      {/* Toolbar */}
      <div className="flex gap-2.5 items-center flex-wrap bg-white px-4 py-3 rounded-[10px] border border-border shadow-[0_1px_3px_rgba(15,23,42,0.05)] dark:bg-card dark:shadow-none">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          placeholder="Search by name or city..."
          className="flex-1 min-w-[200px]"
        />
        {/* WCAG 3.3.2 — labels are visually implicit but select has title for AT */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as PropertyType | "all")}
          aria-label="Filter by property type"
          className="h-9 rounded-[8px] border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-ring/20"
        >
          <option value="all">All types</option>
          {ALL_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as PropertyStatus | "all")}
          aria-label="Filter by status"
          className="h-9 rounded-[8px] border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-ring/20"
        >
          <option value="all">All statuses</option>
          {ALL_STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        {/* WCAG 1.3.3 — view toggle uses aria-pressed not just icon */}
        <div className="flex items-center gap-1 rounded-[8px] bg-muted p-1" role="group" aria-label="View mode">
          <Button
            variant={viewMode === "grid" ? "default" : "ghost"}
            size="icon-sm"
            onClick={() => setViewMode("grid")}
            aria-label="Grid view"
            aria-pressed={viewMode === "grid"}
          >
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "ghost"}
            size="icon-sm"
            onClick={() => setViewMode("list")}
            aria-label="List view"
            aria-pressed={viewMode === "list"}
          >
            <List className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Results count */}
      {(search || typeFilter !== "all" || statusFilter !== "all") && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          {/* aria-live so screen readers announce filter result count changes */}
          <span aria-live="polite" aria-atomic="true">
            {properties.length} result{properties.length !== 1 ? "s" : ""}
            {" "}of {allProperties.length}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSearch(""); setTypeFilter("all"); setStatusFilter("all"); }}
          >
            Clear filters
          </Button>
        </div>
      )}

      {properties.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={allProperties.length === 0 ? "No properties yet" : "No properties match"}
          description={
            allProperties.length === 0
              ? "Add your first property to get started managing your portfolio."
              : "Try adjusting your search or filters."
          }
          action={
            allProperties.length === 0
              ? { label: "Add Property", onClick: () => router.push("/properties/new") }
              : undefined
          }
        />
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {properties.map((property) => (
            <PropertyCard key={property.id} property={property} onClick={() => navigate(property)} />
          ))}
        </div>
      ) : (
        /* List view */
        <div className="rounded-[12px] border border-border overflow-hidden bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:bg-card dark:shadow-none">
          <table className="w-full text-sm" role="table" aria-label="Properties list">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th scope="col" className="py-2.5 px-4 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Property</th>
                <th scope="col" className="py-2.5 px-4 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hidden sm:table-cell">Type</th>
                <th scope="col" className="py-2.5 px-4 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hidden md:table-cell">Units</th>
                <th scope="col" className="py-2.5 px-4 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Occupancy</th>
                <th scope="col" className="py-2.5 px-4 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hidden md:table-cell">Revenue / mo</th>
                <th scope="col" className="py-2.5 px-4 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th scope="col" className="py-2.5 px-4 w-8"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {properties.map((property) => (
                <PropertyRow key={property.id} property={property} onClick={() => navigate(property)} />
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-border bg-muted/20 text-xs text-muted-foreground">
            {properties.length} of {allProperties.length} propert{allProperties.length !== 1 ? "ies" : "y"}
          </div>
        </div>
      )}
    </div>
  );
}
