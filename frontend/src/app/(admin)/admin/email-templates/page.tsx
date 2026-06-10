"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, Loader2, Mail, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader } from "@/components/common/PageHeader";
import { PermissionGate } from "@/components/common/PermissionGate";
import { formatDateTime } from "@/utils/formatters";
import {
  emailTemplatesApi,
  type EmailTemplate,
  type EmailTemplatePreview,
} from "@/services/api/emailTemplates";
import { toast } from "@/store/useUIStore";

function errorDetail(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return detail ?? fallback;
}

/* ── List view ──────────────────────────────────────────────────────────── */

const TEMPLATE_COLUMNS: Column<EmailTemplate>[] = [
  {
    key: "name",
    header: "Template",
    sortable: true,
    render: (t) => (
      <div className="min-w-0 max-w-md">
        <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground truncate">{t.description}</p>
      </div>
    ),
  },
  {
    key: "slug",
    header: "Slug",
    render: (t) => (
      <code className="rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-xs">{t.slug}</code>
    ),
  },
  {
    key: "isActive",
    header: "Status",
    render: (t) => (
      <Badge variant={t.isActive ? "success" : "secondary"} className="text-xs">
        {t.isActive ? "Custom copy" : "Using default"}
      </Badge>
    ),
  },
  {
    key: "updatedAt",
    header: "Last updated",
    sortable: true,
    render: (t) =>
      t.updatedBy ? (
        <div className="text-xs text-muted-foreground">
          <p className="text-foreground">{formatDateTime(t.updatedAt)}</p>
          <p>by {t.updatedBy}</p>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">Never edited</span>
      ),
  },
];

function TemplateList({
  templates,
  loading,
  onSelect,
}: {
  templates: EmailTemplate[];
  loading: boolean;
  onSelect: (slug: string) => void;
}) {
  return (
    <DataTable
      data={templates}
      columns={TEMPLATE_COLUMNS}
      loading={loading}
      rowKey={(t) => t.slug}
      onRowClick={(t) => onSelect(t.slug)}
      emptyTitle="No email templates found"
      emptyDescription="The platform's email-template registry will appear here."
    />
  );
}

/* ── Editor view ────────────────────────────────────────────────────────── */

function TemplateEditor({
  template,
  onBack,
  onSaved,
}: {
  template: EmailTemplate;
  onBack: () => void;
  onSaved: (updated: EmailTemplate) => void;
}) {
  const [subject, setSubject] = useState(template.subject);
  const [htmlBody, setHtmlBody] = useState(template.htmlBody);
  const [textBody, setTextBody] = useState(template.textBody);
  const [isActive, setIsActive] = useState(template.isActive);
  const [saving, setSaving] = useState(false);

  const [preview, setPreview] = useState<EmailTemplatePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const [recipient, setRecipient] = useState("");
  const [testSending, setTestSending] = useState(false);

  useEffect(() => {
    setSubject(template.subject);
    setHtmlBody(template.htmlBody);
    setTextBody(template.textBody);
    setIsActive(template.isActive);
    setPreview(null);
  }, [template]);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await emailTemplatesApi.update(template.slug, {
        subject,
        htmlBody,
        textBody,
        isActive,
      });
      onSaved(updated);
      toast.success("Template saved", "The new copy will be used for the next email sent.");
    } catch (err) {
      toast.error("Couldn't save template", errorDetail(err, "Check your template syntax and try again."));
    } finally {
      setSaving(false);
    }
  }

  async function handlePreview() {
    setPreviewing(true);
    try {
      const rendered = await emailTemplatesApi.preview(template.slug);
      setPreview(rendered);
    } catch (err) {
      toast.error("Couldn't render preview", errorDetail(err, "Please try again."));
    } finally {
      setPreviewing(false);
    }
  }

  async function handleTestSend() {
    if (!recipient.trim()) {
      toast.error("Enter a recipient email address first");
      return;
    }
    setTestSending(true);
    try {
      const result = await emailTemplatesApi.testSend(template.slug, recipient.trim());
      if (result.success) {
        toast.success("Test email sent", result.message || `Sent to ${recipient.trim()}`);
      } else {
        toast.error("Test send failed", result.message || "The email provider reported a failure.");
      }
    } catch (err) {
      toast.error("Couldn't send test email", errorDetail(err, "Please try again."));
    } finally {
      setTestSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={template.name}
        description={template.description}
        actions={
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to templates
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="pt-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Active</Label>
                  <p className="text-xs text-muted-foreground">
                    When off, the built-in default copy is used instead — your draft is kept.
                  </p>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label htmlFor="subject" className="text-sm font-medium">Subject</Label>
                <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="text-body" className="text-sm font-medium">Plain-text body</Label>
                <Textarea
                  id="text-body"
                  value={textBody}
                  onChange={(e) => setTextBody(e.target.value)}
                  rows={10}
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="html-body" className="text-sm font-medium">
                  HTML body <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="html-body"
                  value={htmlBody}
                  onChange={(e) => setHtmlBody(e.target.value)}
                  rows={10}
                  className="font-mono text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={handlePreview} disabled={previewing}>
                  {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                  Preview
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save changes
                </Button>
              </div>
            </CardContent>
          </Card>

          {preview && (
            <Card>
              <CardContent className="pt-5 space-y-3">
                <div>
                  <Label className="text-sm font-medium">Preview (rendered with sample data)</Label>
                  <p className="mt-1 text-sm text-foreground">
                    <span className="text-muted-foreground">Subject:</span> {preview.subject}
                  </p>
                </div>
                {preview.htmlBody ? (
                  <iframe
                    title="Email preview"
                    srcDoc={preview.htmlBody}
                    sandbox=""
                    className="h-[420px] w-full rounded-md border border-[hsl(var(--border))] bg-white"
                  />
                ) : (
                  <pre className="max-h-[420px] overflow-auto rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-3 text-xs whitespace-pre-wrap">
                    {preview.textBody}
                  </pre>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="pt-5 space-y-2">
              <Label className="text-sm font-medium">Available variables</Label>
              <p className="text-xs text-muted-foreground">
                Use these inside <code className="rounded bg-[hsl(var(--muted))] px-1 py-0.5">{"{{ ... }}"}</code> placeholders.
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {template.availableVariables.map((v) => (
                  <code key={v} className="rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-xs">{`{{ ${v} }}`}</code>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 space-y-3">
              <div>
                <Label htmlFor="test-recipient" className="text-sm font-medium">Send a test email</Label>
                <p className="text-xs text-muted-foreground">
                  Renders the live copy with sample data and sends it for real.
                </p>
              </div>
              <Input
                id="test-recipient"
                type="email"
                placeholder="you@example.com"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
              />
              <Button variant="outline" size="sm" className="w-full" onClick={handleTestSend} disabled={testSending}>
                {testSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send test
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */

export default function AdminEmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    emailTemplatesApi
      .list()
      .then((res) => { if (!cancelled) setTemplates(res); })
      .catch(() => { if (!cancelled) toast.error("Failed to load email templates"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function handleSaved(updated: EmailTemplate) {
    setTemplates((prev) => prev.map((t) => (t.slug === updated.slug ? updated : t)));
  }

  const selected = selectedSlug ? templates.find((t) => t.slug === selectedSlug) ?? null : null;

  return (
    <PermissionGate
      role="superadmin"
      fallback={
        <div className="flex items-center justify-center min-h-[300px]">
          <p className="text-muted-foreground text-sm">Access restricted to platform administrators.</p>
        </div>
      }
    >
      {selected ? (
        <TemplateEditor
          template={selected}
          onBack={() => setSelectedSlug(null)}
          onSaved={handleSaved}
        />
      ) : (
        <div className="space-y-6">
          <PageHeader
            title="Email Templates"
            description="Edit the copy of the automated emails sent by the demo-booking flow."
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link href="/settings"><ArrowLeft className="h-3.5 w-3.5" /> Back</Link>
              </Button>
            }
          />

          <TemplateList templates={templates} loading={loading} onSelect={setSelectedSlug} />

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Mail className="h-3.5 w-3.5" />
            Turning a template off reverts to the built-in default copy without losing your draft —
            a malformed edit can never break delivery of these emails.
          </p>
        </div>
      )}
    </PermissionGate>
  );
}
