"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VirtualList } from "@/components/common/VirtualList";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FilterBar } from "@/components/common/FilterBar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { InviteModal } from "./InviteModal";
import { OnboardingProgress } from "./OnboardingProgress";
import { formatDate, formatPhone, getInitials } from "@/utils/formatters";
import { useTenants } from "@/hooks/useTenants";
import type { Tenant } from "@/types";

const renderTenant = (tenant: Tenant) => (
  <div className="border-b hover:bg-muted/50 cursor-pointer transition-colors p-4">
    <div className="flex items-center gap-3">
      <Avatar className="h-8 w-8">
        <AvatarFallback className="text-xs">
          {getInitials(`${tenant.firstName} ${tenant.lastName}`)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-5 gap-4 items-center">
        <div>
          <p className="font-medium text-sm">{tenant.firstName} {tenant.lastName}</p>
          <p className="text-xs text-muted-foreground">{tenant.email}</p>
        </div>
        <div className="hidden sm:block">
          <div className="flex items-center gap-2">
            <StatusBadge state={tenant.onboardingState} domain="onboarding" />
            {(tenant.onboardingState === "invited" || tenant.onboardingState === "started" || tenant.onboardingState === "submitted") && (
              <OnboardingProgress state={tenant.onboardingState} compact />
            )}
          </div>
        </div>
        <div className="hidden sm:block text-sm">
          {formatPhone(tenant.phone)}
        </div>
        <div className="hidden sm:block">
          <span className={`text-xs font-medium capitalize ${
            tenant.status === "active" ? "text-emerald-600" :
            tenant.status === "blacklisted" ? "text-red-600" : "text-muted-foreground"
          }`}>
            {tenant.status}
          </span>
        </div>
        <div className="hidden sm:block text-sm text-muted-foreground">
          {formatDate(tenant.createdAt)}
        </div>
      </div>
    </div>
  </div>
);

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

      <VirtualList
        items={filtered}
        loading={isLoading}
        renderItem={(tenant) => renderTenant(tenant)}
        getItemKey={(tenant) => tenant.id}
        height="600px"
        estimateSize={80}
        emptyState={
          <div className="text-center py-12">
            <p className="text-lg font-medium mb-2">No tenants yet</p>
            <p className="text-sm text-muted-foreground mb-4">Invite your first tenant to get started</p>
            <Button onClick={() => setInviteOpen(true)} size="sm">
              <UserPlus className="h-4 w-4 mr-2" />
              Invite Your First Tenant
            </Button>
          </div>
        }
        onItemClick={(tenant) => router.push(`/tenants/${tenant.id}`)}
      />

      <InviteModal open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}
