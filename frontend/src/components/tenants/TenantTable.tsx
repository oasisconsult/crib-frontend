"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FilterBar } from "@/components/common/FilterBar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { InviteModal } from "./InviteModal";
import { OnboardingProgress } from "./OnboardingProgress";
import { formatDate, formatPhone, getInitials } from "@/utils/formatters";
import { useTenants } from "@/hooks/useTenants";
import type { Tenant } from "@/types";

const COLUMNS: Column<Tenant>[] = [
  {
    key: "firstName",
    header: "Tenant",
    sortable: true,
    render: (t) => (
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs">
            {getInitials(`${t.firstName} ${t.lastName}`)}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium text-sm">{t.firstName} {t.lastName}</p>
          <p className="text-xs text-muted-foreground">{t.email}</p>
        </div>
      </div>
    ),
  },
  {
    key: "onboardingState",
    header: "Onboarding",
    render: (t) => (
      <div className="flex items-center gap-2">
        <StatusBadge state={t.onboardingState} domain="onboarding" />
        {(t.onboardingState === "invited" || t.onboardingState === "started" || t.onboardingState === "submitted") && (
          <OnboardingProgress state={t.onboardingState} compact />
        )}
      </div>
    ),
  },
  {
    key: "phone",
    header: "Phone",
    render: (t) => (
      <span className="text-sm text-muted-foreground">{formatPhone(t.phone)}</span>
    ),
  },
  {
    key: "currentUnitId",
    header: "Unit",
    render: (t) => (
      <span className="text-sm">{t.currentUnitId ? `Unit #${t.currentUnitId.slice(-4)}` : "—"}</span>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (t) => (
      <span className={`text-xs font-medium capitalize ${
        t.status === "active" ? "text-emerald-600" :
        t.status === "blacklisted" ? "text-red-600" : "text-muted-foreground"
      }`}>
        {t.status}
      </span>
    ),
  },
  {
    key: "createdAt",
    header: "Added",
    sortable: true,
    render: (t) => <span className="text-sm text-muted-foreground">{formatDate(t.createdAt)}</span>,
  },
];

export function TenantTable() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const { data, isLoading } = useTenants();

  const tenants = data?.data ?? [];

  const filtered = tenants.filter(
    (t) =>
      !search ||
      `${t.firstName} ${t.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      t.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          placeholder="Search tenants..."
          className="flex-1"
        />
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm">
            <Mail className="h-4 w-4" />
            Bulk Message
          </Button>
          <Button onClick={() => setInviteOpen(true)} size="sm">
            <UserPlus className="h-4 w-4" />
            Invite Tenant
          </Button>
        </div>
      </div>

      <DataTable
        data={filtered}
        columns={COLUMNS}
        loading={isLoading}
        rowKey={(t) => t.id}
        onRowClick={(t) => router.push(`/tenants/${t.id}`)}
        selectable
        emptyTitle="No tenants yet"
        emptyDescription="Invite your first tenant to get started"
      />

      <InviteModal open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}
