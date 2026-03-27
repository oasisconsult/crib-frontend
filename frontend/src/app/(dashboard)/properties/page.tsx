"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Building2, MapPin, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CardSkeleton } from "@/components/common/LoadingSkeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { FilterBar } from "@/components/common/FilterBar";
import { formatCurrency } from "@/utils/formatters";
import { useProperties } from "@/hooks/useProperties";
import { useAppStore } from "@/store/useAppStore";

export default function PropertiesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const { data, isLoading } = useProperties();
  const setActiveProperty = useAppStore((s) => s.setActiveProperty);

  const properties = (data?.data ?? []).filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.address.city.toLowerCase().includes(search.toLowerCase()),
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-40 bg-muted rounded animate-pulse" />
          <div className="h-9 w-32 bg-muted rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search by name or city..."
        className="max-w-sm"
      />

      {properties.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No properties yet"
          description="Add your first property to get started managing your portfolio."
          action={{ label: "Add Property", onClick: () => router.push("/properties/new") }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {properties.map((property) => (
            <Card
              key={property.id}
              className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all duration-200 group"
              onClick={() => {
                setActiveProperty(property);
                router.push(`/properties/${property.id}`);
              }}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <Badge variant="secondary" className="text-xs capitalize">
                    {property.type.replace(/_/g, " ")}
                  </Badge>
                </div>
                <CardTitle className="text-base mt-2">{property.name}</CardTitle>
                <CardDescription className="flex items-center gap-1 text-xs">
                  <MapPin className="h-3 w-3" />
                  {property.address.city}, {property.address.country}
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-0">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Units</p>
                    <div className="flex items-center gap-1">
                      <Home className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{property.totalUnits}</span>
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Occupied</p>
                    <p className="font-medium text-emerald-600 dark:text-emerald-400">
                      {property.occupiedUnits}/{property.totalUnits}
                    </p>
                  </div>
                  <div className="space-y-0.5 col-span-2">
                    <p className="text-xs text-muted-foreground">Monthly Revenue</p>
                    <p className="font-semibold text-base">
                      {formatCurrency(property.monthlyRevenue, "KES")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
