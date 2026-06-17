"use client";

import { useState, useEffect, useCallback } from "react";
import { Shield, Plus, Trash2, Loader2, ChevronRight, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/cn";
import { rbacApi, type RoleDetailOut, type RoleOut, type ResourceOut } from "@/services/api/rbac";
import { toast } from "@/store/useUIStore";

const ACTIONS = ["create", "read", "update", "delete"] as const;
type Action = typeof ACTIONS[number];

// ── Permission matrix ─────────────────────────────────────────────────────────

function PermissionMatrix({
  role,
  resources,
  onToggle,
}: {
  role: RoleDetailOut;
  resources: ResourceOut[];
  onToggle: (resourceName: string, action: Action, granted: boolean) => Promise<void>;
}) {
  const grantedSet = new Set(role.permissions.map((p) => `${p.resource}:${p.action}`));
  const [pending, setPending] = useState<Set<string>>(new Set());

  const handleToggle = async (resourceName: string, action: Action) => {
    const key = `${resourceName}:${action}`;
    const granted = grantedSet.has(key);
    setPending((prev) => new Set(prev).add(key));
    try {
      await onToggle(resourceName, action, granted);
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 pr-3 font-medium text-muted-foreground w-40">Resource</th>
            {ACTIONS.map((a) => (
              <th key={a} className="text-center py-2 px-3 font-medium text-muted-foreground capitalize w-20">
                {a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {resources.map((res) => (
            <tr key={res.name} className="border-b last:border-0 hover:bg-primary/5">
              <td className="py-2 pr-3 font-mono text-[11px] text-foreground">{res.name}</td>
              {ACTIONS.map((action) => {
                const key = `${res.name}:${action}`;
                const granted = grantedSet.has(key);
                const isLoading = pending.has(key);
                return (
                  <td key={action} className="text-center py-2 px-3">
                    <button
                      type="button"
                      disabled={isLoading || role.name === "superadmin"}
                      onClick={() => handleToggle(res.name, action)}
                      className={cn(
                        "inline-flex h-5 w-5 items-center justify-center rounded transition-colors",
                        granted
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                          : "bg-muted/50 text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                      )}
                      aria-label={`${granted ? "Revoke" : "Grant"} ${action} on ${res.name}`}
                      title={`${granted ? "Revoke" : "Grant"} ${action} on ${res.name}`}
                    >
                      {isLoading ? (
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      ) : granted ? (
                        <Check className="h-2.5 w-2.5" />
                      ) : (
                        <X className="h-2.5 w-2.5 opacity-30" />
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {role.name === "superadmin" && (
        <p className="text-xs text-muted-foreground mt-2 italic">
          Superadmin always has full access — permissions cannot be modified.
        </p>
      )}
    </div>
  );
}

// ── Create role form ──────────────────────────────────────────────────────────

function CreateRoleForm({ onCreated }: { onCreated: (role: RoleOut) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("99");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const role = await rbacApi.createRole({
        name: name.trim().toLowerCase().replace(/\s+/g, "_"),
        description: description.trim() || undefined,
        priority: parseInt(priority, 10) || 99,
      });
      onCreated(role);
      setName("");
      setDescription("");
      setPriority("99");
      setOpen(false);
      toast.success(`Role '${role.name}' created`);
    } catch {
      toast.error("Failed to create role");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5 mr-1" /> New Role
      </Button>
    );
  }

  return (
    <div className="border border-primary/15 rounded-[6px] p-3 space-y-2 bg-primary/5">
      <p className="text-xs font-medium">New Role</p>
      <Input
        placeholder="role_name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-7 text-xs"
        autoFocus
      />
      <Input
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="h-7 text-xs"
      />
      <div className="flex items-center gap-2">
        <Input
          type="number"
          placeholder="Priority (0=highest)"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="h-7 text-xs w-40"
          min={0}
          max={999}
        />
        <Button size="sm" className="h-7 text-xs" onClick={handleSubmit} disabled={saving || !name.trim()}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          Create
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

const BUILTIN_ROLES = new Set(["superadmin", "owner", "manager", "tenant", "maintenance"]);

export function RbacPanel() {
  const [roles, setRoles] = useState<RoleOut[]>([]);
  const [resources, setResources] = useState<ResourceOut[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [roleDetail, setRoleDetail] = useState<RoleDetailOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    Promise.all([rbacApi.listRoles(), rbacApi.listResources()])
      .then(([r, res]) => {
        setRoles(r);
        setResources(res);
        if (r.length > 0) setSelectedRoleId(r[0].id);
      })
      .catch(() => toast.error("Failed to load RBAC data"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedRoleId == null) return;
    setDetailLoading(true);
    setRoleDetail(null);
    rbacApi.getRole(selectedRoleId)
      .then(setRoleDetail)
      .catch(() => toast.error("Failed to load role details"))
      .finally(() => setDetailLoading(false));
  }, [selectedRoleId]);

  const handleToggle = useCallback(async (
    resourceName: string,
    action: Action,
    currentlyGranted: boolean,
  ) => {
    if (!roleDetail) return;

    // Find the permission ID from the resources list
    const permId = roleDetail.permissions.find(
      (p) => p.resource === resourceName && p.action === action
    )?.id ?? null;

    if (currentlyGranted && permId != null) {
      await rbacApi.revokePermission(roleDetail.id, permId);
      setRoleDetail((prev) =>
        prev ? { ...prev, permissions: prev.permissions.filter((p) => p.id !== permId) } : prev
      );
    } else if (!currentlyGranted) {
      // Find permission id from resources data
      // We need to find the permission id; in mock it's resource_idx*4+action_idx
      // The real API returns permission IDs in GET /resources — we need to load them.
      // Use grant endpoint with the permission found by scanning resources.
      // Since we don't have perm IDs in ResourceOut directly, call grantPermission by
      // doing a bulk replace approach instead.
      const allGrantedKeys = new Set(
        roleDetail.permissions.map((p) => `${p.resource}:${p.action}`)
      );
      allGrantedKeys.add(`${resourceName}:${action}`);

      // Get all perm IDs via listRolePermissions then build new set
      // Simpler: use the detail permissions + the new one
      // We need the ID of the new permission — fetch resources with IDs if needed.
      // For now: use the grant endpoint which takes permission_id.
      // We need to know the permission_id — fetch it from the full resource list.
      // The resources endpoint doesn't return permission IDs (just names+actions).
      // So we use the PUT /permissions bulk endpoint which takes IDs.
      // We need the permission IDs — fetch from GET /roles/{id}/permissions (current)
      // then also need IDs for the new one.
      // Best approach: fetch role detail fresh to get current perm IDs, add new perm.
      const freshDetail = await rbacApi.getRole(roleDetail.id);
      const currentIds = freshDetail.permissions.map((p) => p.id);

      // We need the permission ID for resourceName:action — it's not directly available
      // from the API without an additional endpoint. We'll scan ALL resources' permissions
      // by fetching the superadmin role (which has all permissions) to find the right ID.
      const superadminDetail = await rbacApi.getRole(1); // superadmin always has all perms
      const targetPerm = superadminDetail.permissions.find(
        (p) => p.resource === resourceName && p.action === action
      );
      if (!targetPerm) {
        toast.error(`Permission ${action} on ${resourceName} not found`);
        return;
      }
      const newPerms = await rbacApi.replaceRolePermissions(
        roleDetail.id,
        [...new Set([...currentIds, targetPerm.id])]
      );
      setRoleDetail((prev) => prev ? { ...prev, permissions: newPerms } : prev);
    }
  }, [roleDetail]);

  const handleDeleteRole = async (roleId: number, roleName: string) => {
    if (!confirm(`Delete role '${roleName}'? This cannot be undone.`)) return;
    try {
      await rbacApi.deleteRole(roleId);
      setRoles((prev) => prev.filter((r) => r.id !== roleId));
      if (selectedRoleId === roleId) {
        const remaining = roles.filter((r) => r.id !== roleId);
        setSelectedRoleId(remaining[0]?.id ?? null);
      }
      toast.success(`Role '${roleName}' deleted`);
    } catch {
      toast.error("Failed to delete role");
    }
  };

  const handleRoleCreated = (role: RoleOut) => {
    setRoles((prev) => [...prev, role].sort((a, b) => a.priority - b.priority));
    setSelectedRoleId(role.id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-primary/10">
          <Shield className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-base font-semibold">Access Control</h2>
          <p className="text-xs text-muted-foreground">
            Manage roles and their permissions. Changes take effect within 5 minutes (cache TTL).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
        {/* Role list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Roles</p>
          </div>
          <div className="space-y-1">
            {roles.map((role) => (
              <div
                key={role.id}
                className={cn(
                  "group flex items-center justify-between gap-2 px-3 py-2 rounded-[6px] cursor-pointer text-sm transition-colors",
                  selectedRoleId === role.id
                    ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-semibold ring-1 ring-inset ring-emerald-600/50"
                    : "text-foreground hover:bg-primary/5",
                )}
                onClick={() => setSelectedRoleId(role.id)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ChevronRight className={cn(
                    "h-3.5 w-3.5 shrink-0 transition-transform",
                    selectedRoleId === role.id ? "rotate-90" : "opacity-40",
                  )} />
                  <span className="font-medium truncate">{role.name}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] px-1 py-0 h-3.5",
                      selectedRoleId === role.id
                        ? "border-primary-foreground/40 text-primary-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    p{role.priority}
                  </Badge>
                  {!BUILTIN_ROLES.has(role.name) && (
                    <button
                      type="button"
                      className={cn(
                        "opacity-0 group-hover:opacity-100 transition-opacity",
                        selectedRoleId === role.id ? "text-primary-foreground/70 hover:text-primary-foreground" : "text-muted-foreground hover:text-destructive",
                      )}
                      onClick={(e) => { e.stopPropagation(); handleDeleteRole(role.id, role.name); }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <CreateRoleForm onCreated={handleRoleCreated} />
        </div>

        {/* Permission matrix */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  {roleDetail?.name ?? "Select a role"}
                </CardTitle>
                {roleDetail?.description && (
                  <CardDescription className="text-xs mt-0.5">
                    {roleDetail.description}
                  </CardDescription>
                )}
              </div>
              {roleDetail && (
                <Badge variant="outline" className="text-xs">
                  {roleDetail.permissions.length} permission{roleDetail.permissions.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {detailLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : roleDetail ? (
              <PermissionMatrix
                role={roleDetail}
                resources={resources}
                onToggle={handleToggle}
              />
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Select a role to view and edit its permissions.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
