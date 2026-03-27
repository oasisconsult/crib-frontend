"use client";

import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LedgerView } from "@/components/payments/LedgerView";

export default function LedgerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const leaseId = searchParams.get("leaseId") ?? "";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payment Ledger</h1>
          <p className="text-sm text-muted-foreground">Running account balance</p>
        </div>
      </div>

      <LedgerView leaseId={leaseId} />
    </div>
  );
}
