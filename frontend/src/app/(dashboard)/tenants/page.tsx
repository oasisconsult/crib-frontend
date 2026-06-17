"use client";

import { useState } from "react";
import { Megaphone, Plus, Upload } from "lucide-react";
import { TenantTable } from "@/components/tenants/TenantTable";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { TenantImportModal } from "./components/TenantImportModal";
import { CreateTenantModal } from "./components/CreateTenantModal";
import { AnnounceModal } from "./components/AnnounceModal";

export default function TenantsPage() {
  const { canWrite, canDo } = usePermissions();
  const canInviteTenant = canDo("create", "tenant");
  const [showImport, setShowImport] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showAnnounce, setShowAnnounce] = useState(false);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tenants"
        description="Manage tenants, onboarding, and documents"
        actions={
          <div className="flex items-center gap-2">
            {canWrite && (
              <Button variant="outline" size="sm" onClick={() => setShowAnnounce(true)}>
                <Megaphone className="h-4 w-4" />
                Announce
              </Button>
            )}
            {canInviteTenant && (
              <>
                {canWrite && (
                  <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
                    <Upload className="h-4 w-4" />
                    Import CSV
                  </Button>
                )}
                <Button size="sm" onClick={() => setShowCreate(true)}>
                  <Plus className="h-4 w-4" />
                  New Tenant
                </Button>
              </>
            )}
          </div>
        }
      />
      <TenantTable />

      {showAnnounce && <AnnounceModal onClose={() => setShowAnnounce(false)} />}
      {showImport && <TenantImportModal onClose={() => setShowImport(false)} />}
      {showCreate && <CreateTenantModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
