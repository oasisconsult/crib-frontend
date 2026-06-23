"use client";

import { useState, useEffect, useCallback } from "react";
import { Shield, Lock, Plus, Trash2, Loader2, ChevronRight, Save, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { rbacApi, type RoleDetailOut, type RoleOut, type ResourceOut } from "@/services/api/rbac";
import { toast } from "@/store/useUIStore";

// ── Permission matrix ─────────────────────────────────────────────────────────

function PermissionMatrix({
  role,
  resources,
  onSaved,
}: {
  role: RoleDetailOut;
  resources: ResourceOut[];
  onSaved: (perms: RoleDetailOut["permissions"]) => void;
}) {
  // selected = set of currently-checked permission IDs
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(role.permissions.map((p) => p.id))
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Re-sync when the role switches
  useEffect(() => {
    setSelected(new Set(role.permissions.map((p) => p.id)));
    setDirty(false);
  }, [role.id, role.permissions]);

  const toggle = (permId: string) => {
    if (role.is_system) return;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(permId) ? next.delete(permId) : next.add(permId);
      return next;
    });
    setDirty(true);
  };

  const toggleResource = (permIds: string[]) => {
    if (role.is_system) return;
    const allSelected = permIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      permIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await rbacApi.replaceRolePermissions(role.id, Array.from(selected));
      onSaved(updated);
      setDirty(false);
      toast.success("Permissions saved");
    } catch {
      toast.error("Failed to save permissions");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSelected(new Set(role.permissions.map((p) => p.id)));
    setDirty(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Role header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-lg flex items-center gap-2">
            {role.display_name ?? role.name}
            {role.is_system && (
              <Badge variant="secondary" className="text-xs gap-1">
                <Lock className="h-2.5 w-2.5" /> System
              </Badge>
            )}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {selected.size} permission{selected.size !== 1 ? "s" : ""} selected
          </p>
        </div>
        <div className="flex gap-2">
          {dirty && (
            <>
              <Button variant="outline" size="sm" onClick={handleReset} disabled={saving}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Save className="h-3.5 w-3.5 mr-1" />
                )}
                Save changes
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Resource cards */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {resources.map((res) => {
          const permIds = res.permissions.map((p) => p.id);
          const checkedCount = permIds.filter((id) => selected.has(id)).length;
          const allChecked = permIds.length > 0 && checkedCount === permIds.length;

          return (
            <Card key={res.id}>
              <CardHeader className="py-2 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium capitalize">{res.name}</CardTitle>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {checkedCount}/{permIds.length}
                    </span>
                    {!role.is_system && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs"
                        onClick={() => toggleResource(permIds)}
                      >
                        {allChecked ? "None" : "All"}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="py-2 px-4">
                <div className="flex flex-wrap gap-4">
                  {res.permissions.map((perm) => (
                    <label
                      key={perm.id}
                      className={cn(
                        "flex items-center gap-1.5 group",
                        role.is_system ? "cursor-default" : "cursor-pointer",
                      )}
                    >
                      <Checkbox
                        checked={selected.has(perm.id)}
                        onCheckedChange={() => toggle(perm.id)}
                        disabled={role.is_system}
                        className="data-[state=checked]:bg-primary"
                      />
                      <span className="text-xs capitalize group-hover:text-foreground transition-colors">
                        {perm.action}
                      </span>
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {role.is_system && (
        <p className="text-xs text-muted-foreground mt-3 italic">
          System roles cannot be modified. Clone the role to create a custom variant.
        </p>
      )}
    </div>
  );
}

// ── Create role form ──────────────────────────────────────────────────────────

function CreateRoleForm({ onCreated }: { onCreated: (role: RoleOut) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [priority, setPriority] = useState("99");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const role = await rbacApi.createRole({
        name: name.trim().toLowerCase().replace(/\s+/g, "_"),
        display_name: displayName.trim() || undefined,
        priority: parseInt(priority, 10) || 99,
      });
      onCreated(role);
      setName("");
      setDisplayName("");
      setPriority("99");
      setOpen(false);
      toast.success(`Role '${role.display_name ?? role.name}' created`);
    } catch {
      toast.error("Failed to create role");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="h-7 text-xs w-full" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5 mr-1" /> New Role
      </Button>
    );
  }

  return (
    <div className="border border-primary/15 rounded-[6px] p-3 space-y-2 bg-primary/5">
      <p className="text-xs font-medium">New Role</p>
      <Input
        placeholder="Display name (e.g. Field Agent)"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        className="h-7 text-xs"
        autoFocus
      />
      <Input
        placeholder="Slug (e.g. field_agent)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-7 text-xs font-mono"
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

export function RbacPanel() {
  const [roles, setRoles] = useState<RoleOut[]>([]);
  const [resources, setResources] = useState<ResourceOut[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
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
    rbacApi
      .getRole(selectedRoleId)
      .then(setRoleDetail)
      .catch(() => toast.error("Failed to load role details"))
      .finally(() => setDetailLoading(false));
  }, [selectedRoleId]);

  const handlePermsSaved = useCallback(
    (perms: RoleDetailOut["permissions"]) => {
      setRoleDetail((prev) => (prev ? { ...prev, permissions: perms } : prev));
    },
    [],
  );

  const handleDeleteRole = async (roleId: string, roleName: string) => {
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
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
        <div className="space-y-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-[6px]" />
          ))}
        </div>
        <Skeleton className="h-[500px] rounded-[6px]" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[500px]">
      {/* ── Role list (left) ───────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 overflow-hidden">
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {roles.map((role) => (
            <div
              key={role.id}
              className={cn(
                "group flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border cursor-pointer text-sm transition-colors",
                selectedRoleId === role.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card hover:bg-accent border-border",
              )}
              onClick={() => setSelectedRoleId(role.id)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Shield className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="font-medium truncate">
                  {role.display_name ?? role.name}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {role.is_system ? (
                  <Lock
                    className={cn(
                      "h-3 w-3",
                      selectedRoleId === role.id ? "opacity-70" : "text-muted-foreground",
                    )}
                  />
                ) : (
                  <button
                    type="button"
                    className={cn(
                      "opacity-0 group-hover:opacity-100 transition-opacity",
                      selectedRoleId === role.id
                        ? "text-primary-foreground/70 hover:text-primary-foreground"
                        : "text-muted-foreground hover:text-destructive",
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteRole(role.id, role.display_name ?? role.name);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
                <span
                  className={cn(
                    "text-xs",
                    selectedRoleId === role.id ? "text-primary-foreground/60" : "text-muted-foreground",
                  )}
                >
                  Priority {role.priority}
                </span>
              </div>
            </div>
          ))}
        </div>
        <CreateRoleForm onCreated={handleRoleCreated} />
      </div>

      {/* ── Permission matrix (right) ──────────────────────────────────────── */}
      <div className="overflow-y-auto">
        {detailLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : roleDetail ? (
          <PermissionMatrix
            role={roleDetail}
            resources={resources}
            onSaved={handlePermsSaved}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Shield className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Select a role to view permissions</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
