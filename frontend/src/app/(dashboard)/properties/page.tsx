"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Building2, MapPin, Home, LayoutGrid, List, ChevronRight, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CardSkeleton } from "@/components/common/LoadingSkeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { FilterBar } from "@/components/common/FilterBar";
import { formatCurrency } from "@/utils/formatters";
import { useProperties } from "@/hooks/useProperties";
import { useAppStore } from "@/store/useAppStore";
import { cn } from "@/utils/cn";
import type { Property, PropertyStatus, PropertyType } from "@/types";

const STATUS_STYLES: Record<PropertyStatus, string> = {
  active:      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  inactive:    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  maintenance: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

const STATUS_DOT: Record<PropertyStatus, string> = {
  active:      "bg-emerald-500",
  inactive:    "bg-zinc-400",
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

// ── Grid card ────────────────────────────────────────────────────────────────

function PropertyCard({ property, onClick }: { property: Property; onClick: () => void }) {
  const occupancyPct = property.totalUnits > 0
    ? Math.round((property.occupiedUnits / property.totalUnits) * 100)
    : 0;

  return (
    <Card
      className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all duration-200 group"
      onClick={onClick}
    >
      {/* Cover image or placeholder */}
      {property.coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={property.coverImage}
          alt={property.name}
          className="w-full h-32 object-cover rounded-t-lg"
        />
      ) : (
        <div className="w-full h-24 rounded-t-lg bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
          <Building2 className="h-8 w-8 text-primary/30" />
        </div>
      )}

      <CardHeader className="pb-2 pt-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-tight group-hover:text-primary transition-colors">
            {property.name}
          </CardTitle>
          <span className={cn("text-xs font-medium rounded-full px-2 py-0.5 capitalize shrink-0", STATUS_STYLES[property.status])}>
            {property.status}
          </span>
        </div>
        <CardDescription className="flex items-center gap-1 text-xs mt-0.5">
          <MapPin className="h-3 w-3 shrink-0" />
          {property.address.city}, {property.address.country}
        </CardDescription>
        <Badge variant="secondary" className="text-xs capitalize w-fit mt-1">
          {TYPE_LABELS[property.type] ?? property.type}
        </Badge>
      </CardHeader>

      <CardContent className="pt-0 pb-4">
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Units</p>
            <div className="flex items-center gap-1 font-medium">
              <Home className="h-3.5 w-3.5 text-muted-foreground" />
              {property.totalUnits}
            </div>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Occupied</p>
            <p className="font-medium text-indigo-600 dark:text-indigo-400">
              {property.occupiedUnits}/{property.totalUnits}
            </p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Occupancy</p>
            <p className={cn("font-medium", occupancyPct >= 80 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
              {occupancyPct}%
            </p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t">
          <p className="text-xs text-muted-foreground mb-0.5">Monthly Revenue</p>
          <p className="font-semibold text-base">
            {formatCurrency(property.monthlyRevenue, property.currency || "UGX")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── List row ─────────────────────────────────────────────────────────────────

function PropertyRow({ property, onClick }: { property: Property; onClick: () => void }) {
  const occupancyPct = property.totalUnits > 0
    ? Math.round((property.occupiedUnits / property.totalUnits) * 100)
    : 0;

  return (
    <tr
      className="group border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <p className="font-medium text-sm leading-tight group-hover:text-primary transition-colors">
              {property.name}
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-0.5 mt-0.5">
              <MapPin className="h-3 w-3" />{property.address.city}
            </p>
          </div>
        </div>
      </td>
      <td className="py-3 px-4 text-sm text-muted-foreground hidden sm:table-cell capitalize">
        {TYPE_LABELS[property.type] ?? property.type}
      </td>
      <td className="py-3 px-4 hidden md:table-cell">
        <div className="text-sm">
          <span className="font-medium">{property.occupiedUnits}</span>
          <span className="text-muted-foreground">/{property.totalUnits}</span>
          <span className="ml-2 text-xs text-muted-foreground">units</span>
        </div>
      </td>
      <td className="py-3 px-4 hidden lg:table-cell">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", occupancyPct >= 80 ? "bg-emerald-500" : occupancyPct >= 50 ? "bg-amber-500" : "bg-red-400")}
              style={{ width: `${occupancyPct}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{occupancyPct}%</span>
        </div>
      </td>
      <td className="py-3 px-4 text-sm font-semibold hidden md:table-cell">
        <div className="flex items-center gap-1">
          <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          {formatCurrency(property.monthlyRevenue, property.currency || "UGX")}
        </div>
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full shrink-0", STATUS_DOT[property.status])} />
          <span className={cn("text-xs font-medium rounded-full px-2 py-0.5 capitalize", STATUS_STYLES[property.status])}>
            {property.status}
          </span>
        </div>
      </td>
      <td className="py-3 px-4 w-8">
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

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
      <div className="space-y-6">
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
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Properties</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.total ?? 0} properties in your portfolio
          </p>
        </div>
        <Button onClick={() => router.push("/properties/new")}>
          <Plus className="h-4 w-4" />
          Add Property
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 items-center flex-wrap">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          placeholder="Search by name or city..."
          className="flex-1 min-w-[180px]"
        />

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as PropertyType | "all")}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">All types</option>
          {ALL_TYPES.map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as PropertyStatus | "all")}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">All statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>

        {/* View toggle */}
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
      </div>

      {/* Results count when filtering */}
      {(search || typeFilter !== "all" || statusFilter !== "all") && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {properties.map((property) => (
            <PropertyCard key={property.id} property={property} onClick={() => navigate(property)} />
          ))}
        </div>
      ) : (
        /* List view */
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">Property</th>
                <th className="py-2.5 px-4 text-left font-medium text-muted-foreground hidden sm:table-cell">Type</th>
                <th className="py-2.5 px-4 text-left font-medium text-muted-foreground hidden md:table-cell">Units</th>
                <th className="py-2.5 px-4 text-left font-medium text-muted-foreground hidden lg:table-cell">Occupancy</th>
                <th className="py-2.5 px-4 text-left font-medium text-muted-foreground hidden md:table-cell">Revenue / mo</th>
                <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">Status</th>
                <th className="py-2.5 px-4 w-8" />
              </tr>
            </thead>
            <tbody>
              {properties.map((property) => (
                <PropertyRow key={property.id} property={property} onClick={() => navigate(property)} />
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
            {properties.length} of {allProperties.length} propert{allProperties.length !== 1 ? "ies" : "y"}
          </div>
        </div>
      )}
    </div>
  );
}
