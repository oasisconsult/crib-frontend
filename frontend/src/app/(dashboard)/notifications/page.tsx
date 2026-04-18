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
import { formatDate } from "@/utils/formatters";
import { useNotifications, useNotificationStats, useSendNotification } from "@/hooks/useNotifications";
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
    header: "Subject",
    render: (n) => (
      <span className="text-sm max-w-xs truncate block">
        {n.subject ?? n.body?.slice(0, 60) ?? "—"}
      </span>
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
      <span className="text-muted-foreground">{formatDate(n.queuedAt)}</span>
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
                    ? "border-primary bg-primary/10 text-primary"
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
            { label: "Total Sent",  value: stats.sent,      icon: Bell,         color: "text-blue-600",    bg: "bg-blue-50 dark:bg-blue-950/30" },
            { label: "Delivered",   value: stats.delivered, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
            { label: "Failed",      value: stats.failed,    icon: XCircle,      color: "text-red-600",     bg: "bg-red-50 dark:bg-red-950/30" },
            { label: "Read",        value: stats.read,      icon: Clock,        color: "text-amber-600",   bg: "bg-amber-50 dark:bg-amber-950/30" },
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
