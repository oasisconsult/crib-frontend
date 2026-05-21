"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Save, Loader2, Mail, MessageSquare, HardDrive, FlaskConical, CheckCircle2, XCircle, Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/PageHeader";
import { PermissionGate } from "@/components/common/PermissionGate";
import { settingsApi, type SystemSetting, type SettingsByCategory } from "@/services/api/settings";
import { toast } from "@/store/useUIStore";
import { cn } from "@/utils/cn";

// ── Shared SettingRow ─────────────────────────────────────────────────────

function SettingRow({ setting, onSave }: { setting: SystemSetting; onSave: (key: string, value: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(setting.value);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => { if (!editing) setValue(setting.value); }, [setting.value, editing]);

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(setting.key, value); setEditing(false); } finally { setSaving(false); }
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
              <Input type={isSecret && !showSecret ? "password" : "text"} value={value} onChange={e => setValue(e.target.value)} className="h-8 text-sm w-52" autoFocus />
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
              <Badge variant={value === "true" ? "success" : "outline"} className="text-xs">{value === "true" ? "Enabled" : "Disabled"}</Badge>
            ) : (
              <span className={cn("text-sm font-mono truncate max-w-[180px]", !value ? "text-muted-foreground" : "text-foreground")}>{displayValue}</span>
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

// ── Test button ───────────────────────────────────────────────────────────

function TestButton({ label, onTest }: { label: string; onTest: () => Promise<{ success: boolean; message: string }> }) {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "fail">("idle");
  const [msg, setMsg] = useState("");
  const run = async () => {
    setState("loading");
    try {
      const result = await onTest();
      setState(result.success ? "ok" : "fail");
      setMsg(result.message);
    } catch (err: unknown) { setState("fail"); setMsg((err as Error).message ?? "Unknown error"); }
  };
  return (
    <div className="flex items-center gap-2">
      {state === "ok" && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
      {state === "fail" && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
      {msg && <span className="text-xs text-muted-foreground hidden sm:inline max-w-[160px] truncate">{msg}</span>}
      <Button size="sm" variant="outline" className="h-8" onClick={run} disabled={state === "loading"}>
        {state === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <FlaskConical className="h-3.5 w-3.5 mr-1" />}
        {label}
      </Button>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AdminIntegrationsPage() {
  const [data, setData] = useState<Pick<SettingsByCategory, "storage" | "email" | "sms"> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    settingsApi.getAll()
      .then(all => setData({ storage: all.storage ?? [], email: all.email ?? [], sms: all.sms ?? [] }))
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
          title="Integrations"
          description="Configure email, SMS, and file storage providers."
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

            {/* Email */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /> Email</CardTitle>
                    <CardDescription className="text-xs">Transactional email for invites, rent reminders, and notifications.</CardDescription>
                  </div>
                  <TestButton
                    label="Send Test"
                    onTest={async () => {
                      const phone = data.sms.find(s => s.key === "platform.support_phone")?.value || "admin@crib.ug";
                      return settingsApi.testEmail(phone);
                    }}
                  />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {data.email.map(s => <SettingRow key={s.key} setting={s} onSave={handleSave} />)}
              </CardContent>
            </Card>

            {/* SMS */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /> SMS</CardTitle>
                    <CardDescription className="text-xs">SMS provider for OTPs, rent reminders, and tenant alerts.</CardDescription>
                  </div>
                  <TestButton
                    label="Send Test SMS"
                    onTest={async () => {
                      const phone = data.sms.find(s => s.key === "platform.support_phone")?.value || "";
                      if (!phone) return { success: false, message: "Set platform.support_phone first" };
                      return settingsApi.testSms(phone);
                    }}
                  />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {data.sms.map(s => <SettingRow key={s.key} setting={s} onSave={handleSave} />)}
              </CardContent>
            </Card>

            {/* Storage */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2"><HardDrive className="h-4 w-4 text-primary" /> Storage</CardTitle>
                    <CardDescription className="text-xs">Where uploaded files (documents, photos) are stored.</CardDescription>
                  </div>
                  <TestButton label="Test Connection" onTest={settingsApi.testStorage} />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {data.storage.map(s => <SettingRow key={s.key} setting={s} onSave={handleSave} />)}
                <div className="mt-3 rounded-[6px] border border-primary/15 bg-primary/5 p-3 text-xs text-muted-foreground space-y-1">
                  <p><strong>local</strong> — stores files on disk (development only).</p>
                  <p><strong>s3</strong> — AWS S3. Set bucket, region, access key ID, and secret.</p>
                  <p><strong>r2</strong> — Cloudflare R2 (zero egress). Set endpoint URL to your R2 account endpoint.</p>
                  <p><strong>minio</strong> — self-hosted MinIO. Set endpoint to <code>http://minio:9000</code>.</p>
                </div>
              </CardContent>
            </Card>

          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-8">Failed to load settings.</p>
        )}
      </div>
    </PermissionGate>
  );
}
