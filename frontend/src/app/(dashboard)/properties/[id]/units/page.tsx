"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Layers, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UnitGrid } from "@/components/properties/UnitGrid";
import { useProperty } from "@/hooks/useProperties";

interface Props {
  params: Promise<{ id: string }>;
}

export default function UnitsPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const { data: property } = useProperty(id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Units</h1>
            <p className="text-sm text-muted-foreground">
              {property?.name ?? "Property"} — {property?.totalUnits ?? 0} units
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/properties/${id}/units/bulk-add`)}
          >
            <Layers className="h-4 w-4" />
            Bulk Add
          </Button>
          <Button
            size="sm"
            onClick={() => router.push(`/properties/${id}/units/new`)}
          >
            <Plus className="h-4 w-4" />
            Add Unit
          </Button>
        </div>
      </div>

      <UnitGrid propertyId={id} />
    </div>
  );
}
