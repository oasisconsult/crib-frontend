"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Search,
  Shield,
  Users,
  Loader2,
  Plus,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/common/PageHeader";
import { PermissionGate } from "@/components/common/PermissionGate";
import { cn } from "@/utils/cn";
import { formatDate } from "@/utils/formatters";
import { toast } from "@/store/useUIStore";
import {
  adminUserRolesApi,
  type AdminUser,
  type AdminUserDetail,
} from "@/services/api/adminUserRoles";

// ── Role colour map ────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  superadmin:  "bg-purple-100 text-purple-800 border-purple-200",
  owner:       "bg-blue-100 text-blue-800 border-blue-200",
  manager:     "bg-indigo-100 text-indigo-800 border-indigo-200",
  landlord:    "bg-cyan-100 text-cyan-800 border-cyan-200",
  caretaker:   "bg-teal-100 text-teal-800 border-teal-200",
  maintenance: "bg-amber-100 text-amber-800 border-amber-200",
  tenant:      "bg-slate-100 text-slate-700 border-slate-200",
};

function RoleBadge({ role }: { role: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("text-xs capitalize", ROLE_COLORS[role] ?? "bg-muted text-muted-foreground")}
    >
      {role}
    </Badge>
  );
}

// ── User list (left panel) ─────────────────────────────────────────────────────

function UserList({
  selectedSub,
  onSelect,
}: {
  selectedSub: string | null;
  onSelect: (user: AdminUser) => void;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadUsers = useCallback(async (p: number, q: string) => {
    setLoading(true);
    try {
      const res = await adminUserRolesApi.listUsers({ search: q || undefined, page: p, pageSize: 40 });
      setUsers(p === 1 ? res.data : (prev) => [...prev, ...res.data]);
      setHasNext(res.hasNext);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setUsers([]);
    loadUsers(1, debouncedSearch);
  }, [debouncedSearch, loadUsers]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    loadUsers(next, debouncedSearch);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y">
        {loading && users.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">No users found</p>
        ) : (
          users.map((u) => (
            <button
              key={u.logtoSub}
              type="button"
              onClick={() => onSelect(u)}
              className={cn(
                "w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors hover:bg-accent/50",
                selectedSub === u.logtoSub && "bg-primary/5 border-l-2 border-primary",
              )}
            >
              {/* Avatar */}
              <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                {(u.displayName ?? u.email ?? "?").slice(0, 1).toUpperCase()}
              </div>
              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{u.displayName ?? u.email ?? "—"}</p>
                <p className="text-xs text-muted-foreground truncate">{u.email ?? u.logtoSub}</p>
              </div>
              {/* Role */}
              <RoleBadge role={u.role} />
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            </button>
          ))
        )}

        {hasNext && !loading && (
          <button
            type="button"
            onClick={loadMore}
            className="w-full py-2 text-xs text-primary hover:bg-accent/50 text-center"
          >
            Load more
          </button>
        )}
      </div>
    </div>
  );
}

// ── Role detail panel (right panel) ───────────────────────────────────────────

function UserRoleDetail({
  sub,
  onUpdate,
}: {
  sub: string;
  onUpdate: (user: AdminUser) => void;
}) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [assignRole, setAssignRole] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, roles] = await Promise.all([
        adminUserRolesApi.getUser(sub),
        adminUserRolesApi.availableRoles(),
      ]);
      setDetail(d);
      setAvailableRoles(roles);
    } catch {
      toast.error("Failed to load user detail");
    } finally {
      setLoading(false);
    }
  }, [sub]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAssign = async () => {
    if (!assignRole || !detail) return;
    setAssigning(true);
    try {
      const updated = await adminUserRolesApi.assignRole(detail.logtoSub, assignRole);
      setDetail(updated);
      onUpdate(updated);
      setAssignRole("");
      toast.success(`Role "${assignRole}" assigned — session invalidated`);
    } catch {
      toast.error("Failed to assign role");
    } finally {
      setAssigning(false);
    }
  };

  const handleRevoke = async (roleName: string) => {
    if (!detail) return;
    setRevoking(roleName);
    try {
      const updated = await adminUserRolesApi.revokeRole(detail.logtoSub, roleName);
      setDetail(updated);
      onUpdate(updated);
      toast.success(`Role "${roleName}" revoked — session invalidated`);
    } catch {
      toast.error("Failed to revoke role");
    } finally {
      setRevoking(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (!detail) return null;

  const activeRoles = detail.rbacRoles.filter((r) => r.isActive);
  const inactiveRoles = detail.rbacRoles.filter((r) => !r.isActive);

  return (
    <div className="h-full overflow-y-auto p-4 space-y-5">
      {/* User header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">{detail.displayName ?? detail.email}</h2>
          <RoleBadge role={detail.role} />
        </div>
        <p className="text-xs text-muted-foreground">{detail.email}</p>
        <p className="text-xs font-mono text-muted-foreground">{detail.logtoSub}</p>
      </div>

      {/* Assign role */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Assign Role
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Select value={assignRole} onValueChange={setAssignRole}>
              <SelectTrigger className="flex-1 h-8 text-sm">
                <SelectValue placeholder="Select a role…" />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((r) => (
                  <SelectItem key={r} value={r} className="text-sm capitalize">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={handleAssign}
              disabled={!assignRole || assigning}
            >
              {assigning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Assign"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active role assignments */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
          Active Assignments ({activeRoles.length})
        </Label>
        {activeRoles.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            No active RBAC assignments — role resolved from JWT claims
          </p>
        ) : (
          <div className="divide-y border rounded-md">
            {activeRoles.map((r) => (
              <div
                key={r.roleName}
                className="flex items-center justify-between px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <RoleBadge role={r.roleName} />
                  {r.assignedAt && (
                    <span className="text-xs text-muted-foreground">
                      {formatDate(r.assignedAt)}
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  disabled={revoking === r.roleName}
                  onClick={() => handleRevoke(r.roleName)}
                  aria-label={`Revoke ${r.roleName} role`}
                >
                  {revoking === r.roleName ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Revoked / inactive assignments */}
      {inactiveRoles.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">
            Revoked Assignments ({inactiveRoles.length})
          </Label>
          <div className="divide-y border rounded-md opacity-50">
            {inactiveRoles.map((r) => (
              <div key={r.roleName} className="flex items-center gap-2 px-3 py-2">
                <RoleBadge role={r.roleName} />
                <span className="text-xs text-muted-foreground line-through">
                  {r.assignedAt ? formatDate(r.assignedAt) : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer note */}
      <p className="text-xs text-muted-foreground border-t pt-3">
        Role changes are effective on the user&apos;s next authenticated API request.
        The session is invalidated immediately — the user&apos;s browser will silently refresh its token.
      </p>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function UserRolesPage() {
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  const handleUserUpdate = useCallback((updated: AdminUser) => {
    setSelectedUser(updated);
  }, []);

  return (
    <PermissionGate role={["superadmin"]}>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/admin">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <Users className="h-5 w-5 text-muted-foreground shrink-0" />
          <PageHeader
            title="User Role Assignments"
            description="Manage Crib role assignments for platform users"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-180px)] min-h-[500px]">
          {/* Left — user list */}
          <Card className="overflow-hidden flex flex-col">
            <CardHeader className="pb-2 shrink-0">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-primary" />
                Platform Users
              </CardTitle>
              <CardDescription className="text-xs">
                Select a user to manage their roles
              </CardDescription>
            </CardHeader>
            <div className="flex-1 overflow-hidden border-t">
              <UserList selectedSub={selectedUser?.logtoSub ?? null} onSelect={setSelectedUser} />
            </div>
          </Card>

          {/* Right — role detail */}
          <Card className="overflow-hidden flex flex-col">
            {selectedUser ? (
              <>
                <CardHeader className="pb-2 shrink-0 border-b">
                  <CardTitle className="text-sm">Role Assignments</CardTitle>
                  <CardDescription className="text-xs">
                    RBAC DB assignments take precedence over JWT claims
                  </CardDescription>
                </CardHeader>
                <div className="flex-1 overflow-hidden">
                  <UserRoleDetail
                    sub={selectedUser.logtoSub}
                    onUpdate={handleUserUpdate}
                  />
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted-foreground gap-3">
                <Shield className="h-10 w-10 opacity-20" />
                <div>
                  <p className="text-sm font-medium">Select a user</p>
                  <p className="text-xs mt-1">
                    Choose a user from the list to view and manage their role assignments
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </PermissionGate>
  );
}
