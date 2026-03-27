"use client";

import { LeaseTable } from "@/components/leases/LeaseTable";

export default function LeasesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leases</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage lease agreements and their lifecycle
        </p>
      </div>
      <LeaseTable />
    </div>
  );
}
