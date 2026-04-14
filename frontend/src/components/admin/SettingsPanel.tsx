"use client";

import { useState, useEffect, useCallback } from "react";
import {
  HardDrive,
  Mail,
  MessageSquare,
  Settings,
  ToggleLeft,
  Globe,
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  Save,
  FlaskConical,
  Building2,
  Banknote,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/utils/cn";
import { settingsApi, type SystemSetting, type SettingsByCategory } from "@/services/api/settings";
import { toast } from "@/store/useUIStore";

// ── Single setting row ────────────────────────────────────────────────────────

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

  // Reset if parent setting changes (after a save)
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

  const handleCancel = () => {
    setValue(setting.value);
    setEditing(false);
  };

  const isSecret = setting.isSecret;
  const displayValue = isSecret && !showSecret && !editing
    ? "••••••"
    : value || (isSecret ? "" : "—");

  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-3 py-3 border-b last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{setting.label}</span>
          {setting.isRequired && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">required</Badge>
          )}
          {isSecret && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-amber-600 border-amber-300">secret</Badge>
          )}
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
                placeholder={isSecret ? "Enter new value…" : ""}
                autoFocus
              />
              {isSecret && (
                <button
                  type="button"
                  className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowSecret((p) => !p)}
                >
                  {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
            <Button size="sm" className="h-8 px-3" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {setting.valueType === "boolean" ? (
              <Badge
                variant={value === "true" ? "success" : "outline"}
                className="text-xs"
              >
                {value === "true" ? "Enabled" : "Disabled"}
              </Badge>
            ) : (
              <span className={cn(
                "text-sm font-mono truncate max-w-[180px]",
                !value || value === "••••••" ? "text-muted-foreground" : "text-foreground",
              )}>
                {displayValue}
              </span>
            )}
            {isSecret && value !== "••••••" && value && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setShowSecret((p) => !p)}
              >
                {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-xs"
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Category section ─────────────────────────────────────────────────────────

function SettingsSection({
  title,
  description,
  settings,
  onSave,
  testButton,
}: {
  title: string;
  description: string;
  settings: SystemSetting[];
  onSave: (key: string, value: string) => Promise<void>;
  testButton?: React.ReactNode;
}) {
  if (settings.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
          </div>
          {testButton}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {settings.map((s) => (
          <SettingRow key={s.key} setting={s} onSave={onSave} />
        ))}
      </CardContent>
    </Card>
  );
}

// ── Test button ───────────────────────────────────────────────────────────────

function TestButton({
  label,
  onTest,
}: {
  label: string;
  onTest: () => Promise<{ success: boolean; message: string }>;
}) {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "fail">("idle");
  const [msg, setMsg] = useState("");

  const run = async () => {
    setState("loading");
    try {
      const result = await onTest();
      setState(result.success ? "ok" : "fail");
      setMsg(result.message);
    } catch (err: unknown) {
      setState("fail");
      setMsg((err as Error).message ?? "Unknown error");
    }
  };

  return (
    <div className="flex items-center gap-2">
      {state === "ok" && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
      {state === "fail" && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
      {msg && <span className="text-xs text-muted-foreground hidden sm:inline max-w-[160px] truncate">{msg}</span>}
      <Button size="sm" variant="outline" className="h-8" onClick={run} disabled={state === "loading"}>
        {state === "loading" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
        ) : (
          <FlaskConical className="h-3.5 w-3.5 mr-1" />
        )}
        {label}
      </Button>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

const CATEGORY_TABS = [
  { id: "agency",   label: "Agency",   icon: Building2    },
  { id: "storage",  label: "Storage",  icon: HardDrive    },
  { id: "email",    label: "Email",    icon: Mail         },
  { id: "sms",      label: "SMS",      icon: MessageSquare },
  { id: "payments", label: "Payments", icon: Banknote     },
  { id: "platform", label: "Platform", icon: Globe        },
  { id: "features", label: "Features", icon: ToggleLeft   },
] as const;

type CategoryId = typeof CATEGORY_TABS[number]["id"];

export function SettingsPanel() {
  const [data, setData] = useState<SettingsByCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<CategoryId>("agency");

  useEffect(() => {
    settingsApi.getAll()
      .then(setData)
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = useCallback(async (key: string, value: string) => {
    const updated = await settingsApi.update(key, value);
    setData((prev) => {
      if (!prev) return prev;
      const category = updated.category as keyof SettingsByCategory;
      return {
        ...prev,
        [category]: prev[category].map((s) => s.key === key ? updated : s),
      };
    });
    toast.success(`${updated.label} updated`);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">Failed to load settings.</p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
          <Settings className="h-4.5 w-4.5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-base font-semibold">Platform Settings</h2>
          <p className="text-xs text-muted-foreground">
            Configure storage, email, SMS, and feature flags. Secret values are Fernet-encrypted at rest.
          </p>
        </div>
      </div>

      <Tabs value={cat} onValueChange={(v) => setCat(v as CategoryId)}>
        <TabsList className="flex-wrap h-auto gap-1">
          {CATEGORY_TABS.map(({ id, label, icon: Icon }) => (
            <TabsTrigger key={id} value={id} className="text-xs">
              <Icon className="h-3.5 w-3.5 mr-1.5" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Agency */}
        <TabsContent value="agency" className="mt-4">
          <SettingsSection
            title="Agency / Landlord Details"
            description="Name and contact info printed on tenancy agreements and tenant communications."
            settings={data.agency ?? []}
            onSave={handleSave}
          />
        </TabsContent>

        {/* Storage */}
        <TabsContent value="storage" className="mt-4 space-y-4">
          <SettingsSection
            title="Storage Provider"
            description="Configure where uploaded files (documents, photos) are stored."
            settings={data.storage}
            onSave={handleSave}
            testButton={
              <TestButton
                label="Test Connection"
                onTest={settingsApi.testStorage}
              />
            }
          />
          <div className="rounded-lg border border-muted bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
            <p><strong>local</strong> — stores files on disk inside the container. Development only.</p>
            <p><strong>s3</strong> — AWS S3. Set bucket, region, access key ID, and secret access key.</p>
            <p><strong>r2</strong> — Cloudflare R2 (zero egress). Set endpoint URL to your R2 account endpoint.</p>
            <p><strong>minio</strong> — self-hosted MinIO. Set endpoint URL to <code>http://minio:9000</code> (or your host).</p>
          </div>
        </TabsContent>

        {/* Email */}
        <TabsContent value="email" className="mt-4">
          <SettingsSection
            title="Email Provider"
            description="Configure transactional email (invites, rent reminders, notifications)."
            settings={data.email}
            onSave={handleSave}
            testButton={
              <TestButton
                label="Send Test"
                onTest={async () => {
                  const recipient = data.platform.find((s) => s.key === "platform.support_email")?.value
                    || "admin@crib.app";
                  return settingsApi.testEmail(recipient);
                }}
              />
            }
          />
        </TabsContent>

        {/* SMS */}
        <TabsContent value="sms" className="mt-4">
          <SettingsSection
            title="SMS Provider"
            description="Configure SMS for OTPs, rent reminders, and tenant alerts."
            settings={data.sms}
            onSave={handleSave}
            testButton={
              <TestButton
                label="Send Test SMS"
                onTest={async () => {
                  const phone = data.platform.find((s) => s.key === "platform.support_phone")?.value || "";
                  if (!phone) return { success: false, message: "Set platform.support_phone first" };
                  return settingsApi.testSms(phone);
                }}
              />
            }
          />
        </TabsContent>

        {/* Payments */}
        <TabsContent value="payments" className="mt-4">
          <SettingsSection
            title="Payment Defaults"
            description="Advance rent months, grace periods, and late fee defaults applied to new leases."
            settings={data.payments ?? []}
            onSave={handleSave}
          />
        </TabsContent>

        {/* Platform */}
        <TabsContent value="platform" className="mt-4">
          <SettingsSection
            title="Platform Defaults"
            description="Business defaults applied across the platform."
            settings={data.platform}
            onSave={handleSave}
          />
        </TabsContent>

        {/* Features */}
        <TabsContent value="features" className="mt-4">
          <SettingsSection
            title="Feature Flags"
            description="Enable or disable platform features. Set value to 'true' or 'false'."
            settings={data.features}
            onSave={handleSave}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
