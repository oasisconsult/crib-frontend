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
  <div className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors p-4">
    <div className="flex items-center gap-4">
      <Avatar className="h-10 w-10">
        <AvatarFallback className="text-sm font-medium bg-blue-600 text-white">
          {getInitials(`${tenant.firstName} ${tenant.lastName}`)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-5 gap-4 items-center">
        <div>
          <p className="font-semibold text-base text-gray-900">{tenant.firstName} {tenant.lastName}</p>
          <p className="text-sm text-gray-600">{tenant.email}</p>
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
          <span className={`text-sm font-medium capitalize px-3 py-1 rounded-full ${
            tenant.status === "active" ? "bg-green-100 text-green-700" :
            tenant.status === "blacklisted" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"
          }`}>
            {tenant.status}
          </span>
        </div>
        <div className="hidden sm:block text-sm text-gray-600">
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
          <h1 className="text-3xl font-bold text-gray-900">Tenants</h1>
          <p className="text-base text-gray-600 mt-1">
            Manage tenants, onboarding, and documents
          </p>
        </div>
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            size="sm"
            className="border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            <Mail className="h-4 w-4 mr-2" />
            Bulk Message
          </Button>
          <Button 
            onClick={() => setInviteOpen(true)} 
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
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
          <div className="text-center py-16 bg-white rounded-lg">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <UserPlus className="h-6 w-6 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No tenants yet</h3>
            <p className="text-base text-gray-600 mb-4">Invite your first tenant to get started</p>
            <Button 
              onClick={() => setInviteOpen(true)} 
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium"
            >
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
