"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Home, Settings, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PageSkeleton } from "@/components/common/LoadingSkeleton";
import { formatCurrency } from "@/utils/formatters";
import { useProperty } from "@/hooks/useProperties";

interface Props {
  params: Promise<{ id: string }>;
}

export default function PropertyDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const { data: property, isLoading } = useProperty(id);

  if (isLoading) return <PageSkeleton />;
  if (!property) return null;

  const occupancyRate =
    property.totalUnits > 0
      ? Math.round((property.occupiedUnits / property.totalUnits) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{property.name}</h1>
          <p className="text-sm text-muted-foreground">
            {property.address.street}, {property.address.city}
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/properties/${id}/rules`)}>
            <Settings className="h-4 w-4" />
            Rules
          </Button>
          <Button onClick={() => router.push(`/properties/${id}/units`)}>
            <Home className="h-4 w-4" />
            View Units
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Units", value: property.totalUnits, color: "text-foreground" },
          { label: "Occupied", value: property.occupiedUnits, color: "text-emerald-600 dark:text-emerald-400" },
          { label: "Vacant", value: property.totalUnits - property.occupiedUnits, color: "text-amber-600 dark:text-amber-400" },
          { label: "Occupancy", value: `${occupancyRate}%`, color: occupancyRate >= 80 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Property Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Type</span>
              <Badge variant="secondary" className="capitalize">
                {property.type.replace(/_/g, " ")}
              </Badge>
            </div>
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Address</span>
              <span className="text-right">
                {property.address.street}, {property.address.city}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Country</span>
              <span>{property.address.country}</span>
            </div>
            {property.address.postalCode && (
              <>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Postal Code</span>
                  <span>{property.address.postalCode}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Financial Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Monthly Revenue</span>
              <span className="font-semibold">
                {formatCurrency(property.monthlyRevenue, "UGX")}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Expected Monthly</span>
              <span className="font-semibold">
                {formatCurrency(property.monthlyRevenue, "UGX")}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Collection Rate</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {occupancyRate}%
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="gap-2" onClick={() => router.push(`/properties/${id}/units`)}>
          <Home className="h-4 w-4" />
          Manage Units
        </Button>
        <Button variant="outline" className="gap-2" onClick={() => router.push(`/inspections?propertyId=${id}`)}>
          <ClipboardList className="h-4 w-4" />
          Inspections
        </Button>
      </div>
    </div>
  );
}
