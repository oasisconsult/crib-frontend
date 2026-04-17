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

const PAGE_SIZE = 20;

const COLUMNS: Column<Tenant>[] = [
  {
    key: "firstName",
    header: "Tenant",
    render: (t) => (
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="text-xs font-semibold bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
            {getInitials(`${t.firstName} ${t.lastName}`)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">
            {t.firstName} {t.lastName}
          </p>
          <p className="text-xs text-muted-foreground truncate">{t.email}</p>
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
        {(t.onboardingState === "invited" ||
          t.onboardingState === "started" ||
          t.onboardingState === "submitted") && (
          <OnboardingProgress state={t.onboardingState} compact />
        )}
      </div>
    ),
  },
  {
    key: "phone",
    header: "Phone",
    render: (t) => (
      <span className="text-sm text-muted-foreground">
        {t.phone ? formatPhone(t.phone) : "—"}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (t) => <StatusBadge state={t.status} domain="tenant" />,
  },
  {
    key: "createdAt",
    header: "Joined",
    sortable: true,
    render: (t) => (
      <span className="text-sm text-muted-foreground">{formatDate(t.createdAt)}</span>
    ),
  },
];

export function TenantTable() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data, isLoading } = useTenants({
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
  });

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterBar
          search={search}
          onSearchChange={handleSearchChange}
          placeholder="Search by name or email..."
          className="sm:max-w-sm"
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

      {/* Table */}
      <DataTable
        data={data?.data ?? []}
        columns={COLUMNS}
        loading={isLoading}
        rowKey={(t) => t.id}
        onRowClick={(t) => router.push(`/tenants/${t.id}`)}
        emptyTitle="No tenants yet"
        emptyDescription="Invite your first tenant to get started"
        pageSize={PAGE_SIZE}
        totalItems={data?.total}
        currentPage={page}
        onPageChange={setPage}
      />

      <InviteModal open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}
