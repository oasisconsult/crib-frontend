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
import { cn } from "@/utils/cn";
import { useTenants } from "@/hooks/useTenants";
import type { Tenant } from "@/types";

const renderTenant = (tenant: Tenant) => (
  <div className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] cursor-pointer transition-colors p-4">
    <div className="flex items-center gap-4">
      <Avatar className="h-10 w-10">
        <AvatarFallback className="text-sm font-medium bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
          {getInitials(`${tenant.firstName} ${tenant.lastName}`)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-5 gap-4 items-center">
        <div>
          <p className="font-semibold text-base text-[hsl(var(--foreground))]">{tenant.firstName} {tenant.lastName}</p>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">{tenant.email}</p>
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
          <span className={cn(
            "text-sm font-medium capitalize px-3 py-1 rounded-full",
            tenant.status === "active"
              ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]"
              : tenant.status === "blacklisted"
              ? "bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]"
              : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
          )}>
            {tenant.status}
          </span>
        </div>
        <div className="hidden sm:block text-sm text-[hsl(var(--muted-foreground))]">
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[hsl(var(--foreground))]">Tenants</h1>
          <p className="text-base text-[hsl(var(--muted-foreground))] mt-1">
            Manage tenants, onboarding, and documents
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="sm">
            <Mail className="h-4 w-4 mr-2" />
            Bulk Message
          </Button>
          <Button onClick={() => setInviteOpen(true)} size="sm">
            <UserPlus className="h-4 w-4 mr-2" />
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
          <div className="text-center py-16 bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))]">
            <div className="w-16 h-16 bg-[hsl(var(--muted))] rounded-full flex items-center justify-center mx-auto mb-4">
              <UserPlus className="h-6 w-6 text-[hsl(var(--muted-foreground))]" />
            </div>
            <h3 className="text-lg font-semibold text-[hsl(var(--foreground))] mb-2">No tenants yet</h3>
            <p className="text-base text-[hsl(var(--muted-foreground))] mb-4">Invite your first tenant to get started</p>
            <Button onClick={() => setInviteOpen(true)} size="lg">
              <UserPlus className="h-5 w-5 mr-2" />
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
