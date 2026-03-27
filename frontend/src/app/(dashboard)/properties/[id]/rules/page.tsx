"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RulesBuilder } from "@/components/properties/RulesBuilder";
import { useProperty } from "@/hooks/useProperties";

interface Props {
  params: Promise<{ id: string }>;
}

export default function PropertyRulesPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const { data: property } = useProperty(id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Property Rules</h1>
          <p className="text-sm text-muted-foreground">
            Configure rent, late fees, and deposit rules for {property?.name ?? "this property"}
          </p>
        </div>
      </div>

      <RulesBuilder propertyId={id} />
    </div>
  );
}
