"use client";

/**
 * OrgSwitcher — dropdown to switch between organisations the user belongs to.
 *
 * Reads available orgs from the user's JWT claims (decoded client-side from
 * the in-memory token). Calls useAuth.switchOrg() on selection.
 */

import { useState } from "react";
import { Building2, ChevronDown, Loader2, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAppStore } from "@/store/useAppStore";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface OrgOption {
  id: string;
  name: string;
}

function getOrgsFromToken(): OrgOption[] {
  // Token is in an httpOnly cookie (BFF pattern) — not accessible from JS.
  // Org list is populated via user profile from the backend.
  return [];
}

export function OrgSwitcher() {
  const { switchOrg } = useAuth();
  const activeOrgId = useAppStore((s) => s.activeOrgId);
  const [loading, setLoading] = useState<string | null>(null);

  const orgs = getOrgsFromToken();
  if (orgs.length <= 1) return null; // nothing to switch to

  async function handleSwitch(orgId: string) {
    if (orgId === activeOrgId) return;
    setLoading(orgId);
    await switchOrg(orgId);
    setLoading(null);
  }

  const activeOrg = orgs.find((o) => o.id === activeOrgId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 max-w-[180px]">
          <Building2 className="h-4 w-4 shrink-0" />
          <span className="truncate">{activeOrg?.name ?? "Select org"}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Switch organisation</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onSelect={() => handleSwitch(org.id)}
            className="gap-2"
            disabled={loading === org.id}
          >
            {loading === org.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : org.id === activeOrgId ? (
              <Check className="h-4 w-4 text-primary" />
            ) : (
              <Building2 className="h-4 w-4 opacity-40" />
            )}
            <span className="truncate">{org.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
