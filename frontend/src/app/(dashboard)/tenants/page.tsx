"use client";

import { TenantTable } from "@/components/tenants/TenantTable";
import { PageHeader } from "@/components/common/PageHeader";

export default function TenantsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Tenants"
        description="Manage tenants, onboarding, and documents"
      />
      <TenantTable />
    </div>
  );
}
