"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell, FileText, CheckCircle2, XCircle, Clock,
  Send, X, Loader2, MessageSquare, Mail, Smartphone, MessageCircle, MonitorSmartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FilterBar } from "@/components/common/FilterBar";
import { FilterPanel, type ActiveFilters, type FilterField } from "@/components/common/FilterPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime } from "@/utils/formatters";
import { useNotifications, useNotification, useNotificationStats, useSendNotification } from "@/hooks/useNotifications";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/utils/cn";
import type { Notification, NotificationChannel, FilterConfig } from "@/types";

const PAGE_SIZE = 20;

const CHANNEL_META: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  email:    { icon: Mail,            label: "Email"    },
  sms:      { icon: Smartphone,      label: "SMS"      },
  whatsapp: { icon: MessageCircle,   label: "WhatsApp" },
  in_app:   { icon: MonitorSmartphone, label: "In-App" },
};

const CHANNELS: { value: NotificationChannel; label: string }[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "sms",      label: "SMS"      },
  { value: "email",    label: "Email"    },
  { value: "in_app",   label: "In-App"   },
];

const COLUMNS: Column<Notification>[] = [
  {
    key: "channel",
    header: "Channel",
    render: (n) => {
      const meta = CHANNEL_META[n.channel];
      if (!meta) return <span className="text-sm uppercase">{n.channel}</span>;
      const Icon = meta.icon;
      return (
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm">{meta.label}</span>
        </div>
      );
    },
  },
  {
    key: "state",
    header: "Status",
    render: (n) => <StatusBadge state={n.state} domain="notification" />,
  },
  {
    key: "subject",
    header: "Subject / Preview",
    render: (n) => (
      <div>
        <span className="text-sm max-w-xs truncate block">
          {n.subject ?? n.body?.slice(0, 60) ?? "—"}
        </span>
        {n.state === "failed" && n.failureReason && (
          <span className="text-xs text-red-500 truncate block max-w-xs">{n.failureReason}</span>
        )}
      </div>
    ),
  },
  {
    key: "recipientName",
    header: "Recipient",
    render: (n) => <span className="text-sm">{n.recipientName ?? "—"}</span>,
  },
  {
    key: "queuedAt",
    header: "Queued",
    sortable: true,
    render: (n) => (
      <span className="text-muted-foreground text-sm">{formatDateTime(n.queuedAt)}</span>
    ),
  },
];

const TAB_FILTERS: Record<string, FilterConfig[]> = {
  all:       [],
  delivered: [{ field: "state", operator: "eq", value: "delivered" }],
  pending:   [{ field: "state", operator: "in", value: ["queued", "sending"] }],
  failed:    [{ field: "state", operator: "eq", value: "failed" }],
};

const TABS = ["all", "delivered", "pending", "failed"] as const;
const TAB_LABELS: Record<typeof TABS[number], string> = {
  all: "All", delivered: "Delivered", pending: "Pending", failed: "Failed",
};

const FILTER_FIELDS: FilterField[] = [
  {
    key: "channel",
    label: "Channel",
    options: [
      { label: "Email", value: "email" },
      { label: "SMS", value: "sms" },
      { label: "WhatsApp", value: "whatsapp" },
      { label: "In-App", value: "in_app" },
    ],
  },
];

function panelFiltersToConfig(active: ActiveFilters): FilterConfig[] {
  return Object.entries(active)
    .filter(([, v]) => v)
    .map(([field, value]) => ({ field, operator: "eq" as const, value }));
}

/* ── Notification Detail Drawer ──────────────────────────────────────────── */

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm">{value ?? "—"}</span>
    </div>
  );
}

function NotificationDetailDrawer({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const { data: n, isLoading } = useNotification(id);
  const meta = n ? CHANNEL_META[n.channel] : undefined;
  const Icon = meta?.icon ?? MessageSquare;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative z-10 flex flex-col h-full w-full max-w-md bg-[hsl(var(--card))] border-l border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">{meta?.label ?? n?.channel ?? "Notification"}</span>
            {n && <StatusBadge state={n.state} domain="notification" />}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {isLoading || !n ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            {isLoading ? "Loading…" : "Not found"}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Failure banner */}
            {n.state === "failed" && (
              <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 space-y-1">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                  <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="text-sm font-semibold">Delivery Failed</span>
                </div>
                {n.failureReason && (
                  <p className="text-sm text-red-600 dark:text-red-400 ml-6">{n.failureReason}</p>
                )}
                {n.retryCount > 0 && (
                  <p className="text-xs text-red-500/80 ml-6">Retried {n.retryCount} time{n.retryCount !== 1 ? "s" : ""}</p>
                )}
              </div>
            )}

            {/* Recipient */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recipient</p>
              <div className="grid grid-cols-2 gap-3">
                <DetailRow label="Name" value={n.recipientName} />
                {n.recipientEmail && <DetailRow label="Email" value={<a href={`mailto:${n.recipientEmail}`} className="text-primary hover:underline">{n.recipientEmail}</a>} />}
                {n.recipientPhone && <DetailRow label="Phone" value={<a href={`tel:${n.recipientPhone}`} className="text-primary hover:underline">{n.recipientPhone}</a>} />}
                <DetailRow label="Trigger" value={n.trigger?.replace(/_/g, " ")} />
              </div>
            </div>

            <Separator />

            {/* Message */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Message</p>
              {n.subject && <DetailRow label="Subject" value={n.subject} />}
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Body</span>
                <p className="text-sm whitespace-pre-wrap leading-relaxed bg-muted/30 rounded-md px-3 py-2">{n.body}</p>
              </div>
              {n.templateId && (
                <DetailRow label="Template ID" value={<span className="font-mono text-xs text-muted-foreground">{n.templateId}</span>} />
              )}
              {n.externalMessageId && (
                <DetailRow label="Provider Message ID" value={<span className="font-mono text-xs text-muted-foreground">{n.externalMessageId}</span>} />
              )}
            </div>

            <Separator />

            {/* Timeline */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timeline</p>
              <div className="grid grid-cols-2 gap-3">
                <DetailRow label="Queued" value={formatDateTime(n.queuedAt)} />
                {n.sentAt     && <DetailRow label="Sent"      value={formatDateTime(n.sentAt)} />}
                {n.deliveredAt && <DetailRow label="Delivered" value={formatDateTime(n.deliveredAt)} />}
                {n.readAt     && <DetailRow label="Read"      value={formatDateTime(n.readAt)} />}
                {n.failedAt   && <DetailRow label="Failed At" value={formatDateTime(n.failedAt)} />}
              </div>
            </div>

            {/* Context links */}
            {(n.propertyId || n.leaseId || n.paymentId) && (
              <>
                <Separator />
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Linked Records</p>
                  <div className="grid grid-cols-2 gap-3">
                    {n.propertyId && <DetailRow label="Property" value={<span className="font-mono text-xs">{n.propertyId.slice(0, 8)}…</span>} />}
                    {n.leaseId    && <DetailRow label="Lease"    value={<span className="font-mono text-xs">{n.leaseId.slice(0, 8)}…</span>} />}
                    {n.paymentId  && <DetailRow label="Payment"  value={<span className="font-mono text-xs">{n.paymentId.slice(0, 8)}…</span>} />}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Compose Dialog ──────────────────────────────────────────────────────── */

function ComposeDialog({ onClose }: { onClose: () => void }) {
  const [channel, setChannel] = useState<NotificationChannel>("whatsapp");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const { mutate, isPending, isSuccess } = useSendNotification();

  const needsEmail = channel === "email";
  const needsPhone = channel === "sms" || channel === "whatsapp";

  function handleSend() {
    if (!recipientName.trim() || !body.trim()) return;
    mutate({
      channel,
      trigger: "custom",
      landlordId: "landlord-1",
      recipientName,
      recipientEmail: needsEmail ? recipientEmail : undefined,
      recipientPhone: needsPhone ? recipientPhone : undefined,
      subject: needsEmail ? subject : undefined,
      body,
    } as Omit<Notification, "id" | "state" | "queuedAt" | "retryCount">);
  }

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </div>
        <div className="text-center">
          <p className="font-semibold">Message sent!</p>
          <p className="text-sm text-muted-foreground mt-1">
            Your notification has been queued for delivery.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">New Notification</h3>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Channel</p>
        <div className="grid grid-cols-4 gap-2">
          {CHANNELS.map((c) => {
            const meta = CHANNEL_META[c.value];
            const Icon = meta?.icon ?? MessageSquare;
            return (
              <button
                key={c.value}
                onClick={() => setChannel(c.value)}
                className={cn(
                  "rounded-[6px] border py-2.5 text-xs font-medium transition-all cursor-pointer flex flex-col items-center gap-1",
                  channel === c.value
                    ? "border-emerald-600 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-semibold ring-1 ring-inset ring-emerald-600/50"
                    : "border-border hover:border-primary/40 text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recipient Name *</Label>
          <Input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="e.g. Aisha Nakawunde" />
        </div>
        {needsPhone && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Phone Number *</Label>
            <Input type="tel" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} placeholder="+256 700 000000" />
          </div>
        )}
        {needsEmail && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email *</Label>
            <Input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="tenant@example.com" />
          </div>
        )}
      </div>

      {needsEmail && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Subject</Label>
          <Input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject line" />
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Message *</Label>
          {(channel === "sms" || channel === "whatsapp") && (
            <span className={cn("text-xs", body.length > 160 ? "text-amber-600" : "text-muted-foreground")}>
              {body.length} chars · {Math.ceil(body.length / 160) || 1} segment
            </span>
          )}
        </div>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type your message…" rows={4} className="resize-none" />
      </div>

      <Button className="w-full" disabled={!recipientName.trim() || !body.trim() || isPending} onClick={handleSend}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {isPending ? "Sending…" : "Send Notification"}
      </Button>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function NotificationsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<typeof TABS[number]>("all");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({});
  const [composing, setComposing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useNotifications({
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    filters: [...TAB_FILTERS[tab], ...panelFiltersToConfig(activeFilters)],
  } as any);

  const { data: stats } = useNotificationStats();

  const handleTabChange = (t: string) => {
    setTab(t as typeof TABS[number]);
    setPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleFilterChange = (filters: ActiveFilters) => {
    setActiveFilters(filters);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Messages sent to tenants across all channels
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setComposing(true)}>
            <MessageSquare className="h-4 w-4" />
            New Message
          </Button>
          <Button variant="outline" onClick={() => router.push("/notifications/templates")}>
            <FileText className="h-4 w-4" />
            Templates
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Sent",  value: stats.sent,      icon: Bell,         color: "text-teal-600",    bg: "bg-teal-50 dark:bg-teal-500/15" },
            { label: "Delivered",   value: stats.delivered, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-500/15" },
            { label: "Failed",      value: stats.failed,    icon: XCircle,      color: "text-red-600",     bg: "bg-red-50 dark:bg-red-500/15" },
            { label: "Read",        value: stats.read,      icon: Clock,        color: "text-amber-600",   bg: "bg-amber-50 dark:bg-amber-500/15" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-4">
                <div className={`inline-flex p-2 rounded-[6px] mb-2 ${s.bg}`}>
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={`text-2xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="space-y-2">
        <FilterBar
          search={search}
          onSearchChange={handleSearchChange}
          placeholder="Search by subject or recipient…"
          className="max-w-sm"
        />
        <FilterPanel
          fields={FILTER_FIELDS}
          value={activeFilters}
          onChange={handleFilterChange}
        />
      </div>

      {/* Tabs + Table */}
      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t} value={t}>{TAB_LABELS[t]}</TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((t) => (
          <TabsContent key={t} value={t} className="mt-3">
            <DataTable
              data={(data as any)?.data ?? []}
              columns={COLUMNS}
              loading={isLoading}
              rowKey={(n) => n.id}
              onRowClick={(n) => setSelectedId(n.id)}
              emptyTitle="No notifications found"
              emptyDescription={
                t === "all"
                  ? "Notifications will appear here as they are sent"
                  : "No notifications match this filter"
              }
              pageSize={PAGE_SIZE}
              totalItems={(data as any)?.total}
              currentPage={page}
              onPageChange={setPage}
            />
          </TabsContent>
        ))}
      </Tabs>

      {/* Detail drawer */}
      {selectedId && (
        <NotificationDetailDrawer id={selectedId} onClose={() => setSelectedId(null)} />
      )}

      {/* Compose overlay */}
      {composing && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) setComposing(false); }}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-md mx-4 sm:mx-auto bg-[hsl(var(--card))] rounded-t-[8px] sm:rounded-[8px] border border-border shadow-2xl p-5 max-h-[90vh] overflow-y-auto">
            <ComposeDialog onClose={() => setComposing(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
