"use client";

import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface FeatureUpgradeCTAProps {
  feature: string;
  requiredPlan: string;
  description?: string;
}

export function FeatureUpgradeCTA({ feature, requiredPlan, description }: FeatureUpgradeCTAProps) {
  const router = useRouter();
  return (
    <Card className="p-8 flex flex-col items-center gap-4 text-center max-w-md mx-auto mt-8">
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
        <Lock className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <p className="font-semibold text-base">{feature} requires {requiredPlan}</p>
        <p className="text-sm text-muted-foreground mt-1">
          {description ?? `Upgrade your subscription to unlock ${feature}.`}
        </p>
      </div>
      <Button onClick={() => router.push("/subscription/plans")}>View Plans</Button>
    </Card>
  );
}
