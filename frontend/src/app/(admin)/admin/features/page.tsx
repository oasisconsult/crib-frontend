"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, ToggleLeft, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/PageHeader";
import { PermissionGate } from "@/components/common/PermissionGate";
import { settingsApi, type SystemSetting } from "@/services/api/settings";
import { toast } from "@/store/useUIStore";

// ── Page ───────────────────────────────────────────────────────────────────

export default function AdminFeaturesPage() {
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

  return (
    <PermissionGate
      role="superadmin"
      fallback={
        <div className="flex items-center justify-center min-h-[300px]">
          <p className="text-muted-foreground text-sm">Access restricted to platform administrators.</p>
        </div>
      }
    >
      <div className="space-y-6 max-w-3xl">
        <PageHeader
          title="Feature Flags"
          description="Enable or disable platform features. Changes take effect immediately."
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/settings"><ArrowLeft className="h-3.5 w-3.5" /> Back</Link>
            </Button>
          }
        />

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading feature flags…
          </div>
        ) : (
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
        )}

        <div className="rounded-[6px] border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
          <strong>Note:</strong> Feature flags control backend behaviour across the entire platform.
          Disabling a feature like maintenance workflows will hide it for ALL organisations.
          Always test changes in a staging environment first.
        </div>
      </div>
    </PermissionGate>
  );
}
