"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, ToggleLeft, ShieldCheck, Loader2, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/common/PageHeader";
import { PermissionGate } from "@/components/common/PermissionGate";
import { settingsApi, type SystemSetting } from "@/services/api/settings";
import { rbacApi, type RoleOut, type ResourceOut } from "@/services/api/rbac";
import { toast } from "@/store/useUIStore";

// ── Feature Flags Tab ──────────────────────────────────────────────────────

function FeatureFlagsTab() {
  const [features, setFeatures] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    settingsApi.getAll()
      .then(all => setFeatures(all.features ?? []))
      .catch(() => toast.error("Failed to load feature flags"))
      .finally(() => setLoading(false));
  }, []);

  const toggle = useCallback(async (setting: SystemSetting) => {
    const newValue = setting.value === "true" ? "false" : "true";
    setSaving(setting.key);
    try {
      const updated = await settingsApi.update(setting.key, newValue);
      setFeatures(prev => prev.map(s => s.key === setting.key ? updated : s));
      toast.success(`${updated.label} ${newValue === "true" ? "enabled" : "disabled"}`);
    } catch {
      toast.error("Failed to update feature flag");
    } finally {
      setSaving(null);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading feature flags…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ToggleLeft className="h-4 w-4 text-primary" /> Platform Feature Flags
          </CardTitle>
          <CardDescription className="text-xs">
            Toggling a flag immediately affects all users on the platform.
            Use with care in production.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          {features.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No feature flags configured.</p>
          ) : (
            <div className="divide-y">
              {features.map(feat => {
                const isEnabled = feat.value === "true";
                const isSavingThis = saving === feat.key;
                return (
                  <div key={feat.key} className="flex items-center justify-between gap-4 py-3.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{feat.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{feat.description}</p>
                      <code className="text-[10px] text-muted-foreground/60 font-mono">{feat.key}</code>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge
                        variant={isEnabled ? "success" : "outline"}
                        className="text-xs min-w-[60px] justify-center"
                      >
                        {isEnabled ? "Enabled" : "Disabled"}
                      </Badge>
                      <Button
                        size="sm"
                        variant={isEnabled ? "outline" : "default"}
                        className="h-7 px-3 text-xs"
                        onClick={() => toggle(feat)}
                        disabled={!!saving}
                      >
                        {isSavingThis ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          isEnabled ? "Disable" : "Enable"
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="rounded-[6px] border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
        <strong>Note:</strong> Feature flags control backend behaviour across the entire platform.
        Disabling a feature like maintenance workflows will hide it for ALL organisations.
        Always test changes in a staging environment first.
      </div>
    </div>
  );
}

// ── Roles & Permissions Tab ────────────────────────────────────────────────

const ACTIONS = ["create", "read", "update", "delete"] as const;
type Action = typeof ACTIONS[number];

// Maps "resourceName:action" → permissionId for quick lookup
type PermMatrix = Map<string, number>;

function buildPermMatrix(resources: ResourceOut[]): PermMatrix {
  const map = new Map<string, number>();
  for (const r of resources) {
    for (const p of r.permissions) {
      map.set(`${r.name}:${p.action}`, p.id);
    }
  }
  return map;
}

function RolesPermissionsTab() {
  const [roles, setRoles] = useState<RoleOut[]>([]);
  const [resources, setResources] = useState<ResourceOut[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingRole, setLoadingRole] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load roles + resources once on mount
  useEffect(() => {
    Promise.all([rbacApi.listRoles(), rbacApi.listResources()])
      .then(([roleList, resourceList]) => {
        setRoles(roleList);
        setResources(resourceList);
        if (roleList.length > 0) setSelectedRoleId(String(roleList[0].id));
      })
      .catch(() => toast.error("Failed to load RBAC data"))
      .finally(() => setLoading(false));
  }, []);

  // Load permissions whenever the selected role changes
  useEffect(() => {
    if (!selectedRoleId) return;
    setLoadingRole(true);
    rbacApi.listRolePermissions(Number(selectedRoleId))
      .then(perms => {
        const ids = new Set(perms.map(p => p.id));
        setSavedIds(ids);
        setPendingIds(new Set(ids));
      })
      .catch(() => toast.error("Failed to load role permissions"))
      .finally(() => setLoadingRole(false));
  }, [selectedRoleId]);

  const permMatrix = useMemo(() => buildPermMatrix(resources), [resources]);
  const selectedRole = roles.find(r => String(r.id) === selectedRoleId);
  const isSuperadmin = selectedRole?.name === "superadmin";
  const hasChanges = !isSuperadmin && [...pendingIds].some(id => !savedIds.has(id)) ||
    [...savedIds].some(id => !pendingIds.has(id));

  const toggle = useCallback((permId: number, checked: boolean) => {
    setPendingIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(permId); else next.delete(permId);
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    if (!selectedRoleId) return;
    setSaving(true);
    try {
      await rbacApi.replaceRolePermissions(Number(selectedRoleId), [...pendingIds]);
      setSavedIds(new Set(pendingIds));
      toast.success(`Permissions updated for ${selectedRole?.name}`);
    } catch {
      toast.error("Failed to save permissions");
    } finally {
      setSaving(false);
    }
  }, [selectedRoleId, pendingIds, selectedRole?.name]);

  const discard = useCallback(() => {
    setPendingIds(new Set(savedIds));
  }, [savedIds]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading roles…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Role selector */}
      <div className="flex items-center gap-3">
        <div className="w-[240px]">
          <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
            <SelectTrigger className="h-8 text-sm" aria-label="Select role">
              <SelectValue placeholder="Select a role" />
            </SelectTrigger>
            <SelectContent>
              {roles.map(r => (
                <SelectItem key={r.id} value={String(r.id)}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedRole?.description && (
          <p className="text-xs text-muted-foreground">{selectedRole.description}</p>
        )}
      </div>

      {isSuperadmin && (
        <div className="rounded-[6px] border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-300">
          The <strong>superadmin</strong> role always has full access. Its permissions
          cannot be modified to prevent accidental platform lockout.
        </div>
      )}

      {/* Permission matrix */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loadingRole ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading permissions…
            </div>
          ) : (
            <table className="w-full text-sm" aria-label={`Permission matrix for ${selectedRole?.name ?? ""} role`}>
              <caption className="sr-only">
                Permission matrix for the {selectedRole?.name ?? ""} role.
                Rows are resources; columns are actions (create, read, update, delete).
              </caption>
              <thead>
                <tr className="border-b bg-muted/40">
                  <th
                    scope="col"
                    className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground w-[180px]"
                  >
                    Resource
                  </th>
                  {ACTIONS.map(action => (
                    <th
                      key={action}
                      scope="col"
                      className="px-4 py-2.5 font-medium text-xs text-muted-foreground capitalize text-center"
                    >
                      {action}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {resources.map(resource => (
                  <tr key={resource.id} className="hover:bg-muted/20 transition-colors">
                    <th
                      scope="row"
                      className="text-left px-4 py-2.5 font-mono text-xs font-normal text-foreground"
                    >
                      {resource.name}
                    </th>
                    {ACTIONS.map((action: Action) => {
                      const permId = permMatrix.get(`${resource.name}:${action}`);
                      if (permId === undefined) {
                        return (
                          <td key={action} className="px-4 py-2.5 text-center">
                            <span className="text-muted-foreground/30 text-xs" aria-label="not available">—</span>
                          </td>
                        );
                      }
                      const isChecked = pendingIds.has(permId);
                      return (
                        <td key={action} className="px-4 py-2.5 text-center">
                          <Checkbox
                            id={`perm-${resource.id}-${action}`}
                            checked={isChecked}
                            disabled={isSuperadmin || saving}
                            onCheckedChange={(checked) => toggle(permId, !!checked)}
                            aria-label={`${action} on ${resource.name}`}
                            className="mx-auto"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Save / discard */}
      {!isSuperadmin && (
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={save}
            disabled={!hasChanges || saving}
            className="h-8 px-4 text-xs"
          >
            {saving ? (
              <><Loader2 className="h-3 w-3 animate-spin mr-1.5" /> Saving…</>
            ) : (
              <><Save className="h-3 w-3 mr-1.5" /> Save changes</>
            )}
          </Button>
          {hasChanges && (
            <Button
              size="sm"
              variant="ghost"
              onClick={discard}
              disabled={saving}
              className="h-8 px-3 text-xs"
            >
              Discard
            </Button>
          )}
          {hasChanges && (
            <span className="text-xs text-amber-600 dark:text-amber-400" role="status">
              Unsaved changes
            </span>
          )}
        </div>
      )}

      <div className="rounded-[6px] border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
        <strong>Note:</strong> Permission changes take effect immediately — the server cache
        is invalidated on save. Users must refresh their session to see updated access levels.
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AdminFeaturesPage() {
  return (
    <PermissionGate
      role="superadmin"
      fallback={
        <div className="flex items-center justify-center min-h-[300px]">
          <p className="text-muted-foreground text-sm">Access restricted to platform administrators.</p>
        </div>
      }
    >
      <div className="space-y-6 max-w-4xl">
        <PageHeader
          title="Platform Configuration"
          description="Manage feature flags and role-based access permissions."
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/settings"><ArrowLeft className="h-3.5 w-3.5" /> Back</Link>
            </Button>
          }
        />

        <Tabs defaultValue="features">
          <TabsList className="mb-4">
            <TabsTrigger value="features" className="flex items-center gap-1.5 text-xs">
              <ToggleLeft className="h-3.5 w-3.5" /> Feature Flags
            </TabsTrigger>
            <TabsTrigger value="rbac" className="flex items-center gap-1.5 text-xs">
              <ShieldCheck className="h-3.5 w-3.5" /> Roles &amp; Permissions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="features">
            <FeatureFlagsTab />
          </TabsContent>

          <TabsContent value="rbac">
            <RolesPermissionsTab />
          </TabsContent>
        </Tabs>
      </div>
    </PermissionGate>
  );
}
