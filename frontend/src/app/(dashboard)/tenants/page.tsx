"use client";

import { TenantTable } from "@/components/tenants/TenantTable";

export default function TenantsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tenants</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage tenants, onboarding, and documents
        </p>
      </div>
      <TenantTable />
    </div>
  );
}
