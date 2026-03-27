"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeaseDetailPanel } from "@/components/leases/LeaseDetailPanel";
import { PageSkeleton } from "@/components/common/LoadingSkeleton";
import { useLease } from "@/hooks/useLeases";

interface Props {
  params: Promise<{ id: string }>;
}

export default function LeaseDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const { data: lease, isLoading } = useLease(id);

  if (isLoading) return <PageSkeleton />;
  if (!lease) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">
            {lease.reference}
          </h1>
          <p className="text-sm text-muted-foreground">Lease Agreement</p>
        </div>
      </div>

      <LeaseDetailPanel lease={lease} />
    </div>
  );
}
