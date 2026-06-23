import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/PageHeader";
import { PermissionGate } from "@/components/common/PermissionGate";
import { RbacPanel } from "@/components/admin/RbacPanel";

export default function RolesPage() {
  return (
    <PermissionGate role={["superadmin"]}>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/admin">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <Shield className="h-5 w-5 text-muted-foreground shrink-0" />
          <PageHeader
            title="Roles & Permissions"
            description="Select a role to edit its permissions. System roles cannot be deleted."
          />
        </div>

        <RbacPanel />
      </div>
    </PermissionGate>
  );
}
