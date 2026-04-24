"use client";

import { useState } from "react";
import { Plus, Upload } from "lucide-react";
import { TenantTable } from "@/components/tenants/TenantTable";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { TenantImportModal } from "./components/TenantImportModal";
import { CreateTenantModal } from "./components/CreateTenantModal";

export default function TenantsPage() {
  const { canWrite } = usePermissions();
  const [showImport, setShowImport] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tenants"
        description="Manage tenants, onboarding, and documents"
        actions={
          canWrite ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setShowImport(true)}>
                <Upload className="h-4 w-4" />
                Import CSV
              </Button>
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" />
                New Tenant
              </Button>
            </div>
          ) : undefined
        }
      />
      <TenantTable />

      {showImport && <TenantImportModal onClose={() => setShowImport(false)} />}
      {showCreate && <CreateTenantModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
