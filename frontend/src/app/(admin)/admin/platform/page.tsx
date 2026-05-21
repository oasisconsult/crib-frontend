"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Save, Loader2, Building2, Globe, Banknote } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { PermissionGate } from "@/components/common/PermissionGate";
import { settingsApi, type SystemSetting } from "@/services/api/settings";
import { toast } from "@/store/useUIStore";
import { cn } from "@/utils/cn";

// ── Single setting row (shared component) ─────────────────────────────────

function SettingRow({
  setting,
  onSave,
}: {
  setting: SystemSetting;
  onSave: (key: string, value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(setting.value);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    if (!editing) setValue(setting.value);
  }, [setting.value, editing]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(setting.key, value);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const isSecret = setting.isSecret;
  const displayValue = isSecret && !showSecret && !editing ? "••••••" : value || (isSecret ? "" : "—");

  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-3 py-3 border-b last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{setting.label}</span>
          {setting.isRequired && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">required</Badge>}
          {isSecret && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-amber-600 border-amber-300">secret</Badge>}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{setting.description}</p>
        <code className="text-[10px] text-muted-foreground/60 font-mono">{setting.key}</code>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {editing ? (
          <div className="flex items-center gap-2">
            <div className="relative">
              <Input
                type={isSecret && !showSecret ? "password" : "text"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-8 text-sm w-52"
                autoFocus
              />
              {isSecret && (
                <button type="button" className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground" onClick={() => setShowSecret(p => !p)}>
                  {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
            <Button size="sm" className="h-8 px-3" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {setting.valueType === "boolean" ? (
              <Badge variant={value === "true" ? "success" : "outline"} className="text-xs">
                {value === "true" ? "Enabled" : "Disabled"}
              </Badge>
            ) : (
              <span className={cn("text-sm font-mono truncate max-w-[180px]", !value ? "text-muted-foreground" : "text-foreground")}>
                {displayValue}
              </span>
            )}
            {isSecret && value && (
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setShowSecret(p => !p)}>
                {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            )}
            <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => setEditing(true)}>Edit</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsGroup({
  title, description, icon: Icon, settings, onSave,
}: {
  title: string; description: string; icon: React.ElementType;
  settings: SystemSetting[]; onSave: (key: string, value: string) => Promise<void>;
}) {
  if (settings.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {settings.map(s => <SettingRow key={s.key} setting={s} onSave={onSave} />)}
      </CardContent>
    </Card>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AdminPlatformPage() {
  const [data, setData] = useState<{ agency: SystemSetting[]; platform: SystemSetting[]; payments: SystemSetting[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    settingsApi.getAll()
      .then(all => setData({ agency: all.agency ?? [], platform: all.platform ?? [], payments: all.payments ?? [] }))
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = useCallback(async (key: string, value: string) => {
    const updated = await settingsApi.update(key, value);
    setData(prev => {
      if (!prev) return prev;
      const cat = updated.category as keyof typeof prev;
      if (!(cat in prev)) return prev;
      return { ...prev, [cat]: (prev[cat] as SystemSetting[]).map(s => s.key === key ? updated : s) };
    });
    toast.success(`${updated.label} updated`);
  }, []);

  return (
    <PermissionGate
      role="superadmin"
      fallback={<div className="flex items-center justify-center min-h-[300px]"><p className="text-muted-foreground text-sm">Access restricted.</p></div>}
    >
      <div className="space-y-6 max-w-4xl">
        <PageHeader
          title="Platform & Agency"
          description="Agency details, platform defaults, and lease payment rules."
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/settings"><ArrowLeft className="h-3.5 w-3.5" /> Back</Link>
            </Button>
          }
        />

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : data ? (
          <div className="space-y-6">
            <SettingsGroup
              title="Agency / Landlord Details"
              description="Name and contact info printed on tenancy agreements and communications."
              icon={Building2}
              settings={data.agency}
              onSave={handleSave}
            />
            <SettingsGroup
              title="Platform Defaults"
              description="Currency, timezone, support contacts, and other platform-wide defaults."
              icon={Globe}
              settings={data.platform}
              onSave={handleSave}
            />
            <SettingsGroup
              title="Lease Payment Defaults"
              description="Default advance rent, grace periods, and late fee rules applied to new leases."
              icon={Banknote}
              settings={data.payments}
              onSave={handleSave}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-8">Failed to load settings.</p>
        )}
      </div>
    </PermissionGate>
  );
}
