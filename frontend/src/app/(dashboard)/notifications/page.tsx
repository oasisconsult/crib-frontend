"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell, FileText, CheckCircle2, XCircle, Clock,
  Send, X, Loader2, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FilterBar } from "@/components/common/FilterBar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/utils/formatters";
import { useNotifications, useNotificationStats, useSendNotification } from "@/hooks/useNotifications";
import { cn } from "@/utils/cn";
import type { Notification, NotificationChannel } from "@/types";

const CHANNEL_ICONS: Record<string, string> = {
  email: "✉️",
  sms: "📱",
  whatsapp: "💬",
  in_app: "🔔",
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
    render: (n) => (
      <span className="text-sm">
        {CHANNEL_ICONS[n.channel] ?? "📨"} {n.channel.toUpperCase()}
      </span>
    ),
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
      <span className="text-sm max-w-xs truncate block">{n.subject ?? n.body?.slice(0, 60)}</span>
    ),
  },
  {
    key: "recipientName",
    header: "Recipient",
    render: (n) => <span className="text-sm">{n.recipientName}</span>,
  },
  {
    key: "queuedAt",
    header: "Queued",
    sortable: true,
    render: (n) => formatDate(n.queuedAt),
  },
];

// ─── Compose Dialog ───────────────────────────────────────────────────────────

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
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Channel */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Channel</p>
        <div className="grid grid-cols-4 gap-2">
          {CHANNELS.map((c) => (
            <button
              key={c.value}
              onClick={() => setChannel(c.value)}
              className={cn(
                "rounded-lg border py-2 text-xs font-medium transition-all",
                channel === c.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-primary/40",
              )}
            >
              <div className="text-base mb-0.5">{CHANNEL_ICONS[c.value]}</div>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Recipient */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Recipient Name *
          </label>
          <input
            type="text"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            placeholder="e.g. Aisha Nakawunde"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {needsPhone && (
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Phone Number *
            </label>
            <input
              type="tel"
              value={recipientPhone}
              onChange={(e) => setRecipientPhone(e.target.value)}
              placeholder="+256 700 000000"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}
        {needsEmail && (
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Email *
            </label>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="tenant@example.com"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}
      </div>

      {/* Subject (email only) */}
      {needsEmail && (
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Subject
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject line"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      )}

      {/* Body */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Message *
          </label>
          {(channel === "sms" || channel === "whatsapp") && (
            <span className={cn(
              "text-xs",
              body.length > 160 ? "text-amber-600" : "text-muted-foreground",
            )}>
              {body.length} chars · {Math.ceil(body.length / 160) || 1} segment{Math.ceil(body.length / 160) > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type your message…"
          rows={4}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      <Button
        className="w-full"
        disabled={!recipientName.trim() || !body.trim() || isPending}
        onClick={handleSend}
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {isPending ? "Sending…" : "Send Notification"}
      </Button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [composing, setComposing] = useState(false);
  const { data, isLoading } = useNotifications();
  const { data: stats } = useNotificationStats();

  const notifications = (data?.data ?? []).filter((n) => {
    const tabMatch =
      tab === "all" ||
      (tab === "delivered" && n.state === "delivered") ||
      (tab === "failed"    && n.state === "failed") ||
      (tab === "pending"   && ["queued", "sending"].includes(n.state));
    const searchMatch =
      !search || n.subject?.toLowerCase().includes(search.toLowerCase()) ||
      n.recipientName?.toLowerCase().includes(search.toLowerCase());
    return tabMatch && searchMatch;
  });

  return (
    <div className="space-y-6">
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

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Sent",  value: stats.sent,      icon: Bell,         color: "text-blue-600",    bg: "bg-blue-50 dark:bg-blue-950/30"    },
            { label: "Delivered",   value: stats.delivered, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
            { label: "Failed",      value: stats.failed,    icon: XCircle,      color: "text-red-600",     bg: "bg-red-50 dark:bg-red-950/30"      },
            { label: "Read",        value: stats.read,      icon: Clock,        color: "text-amber-600",   bg: "bg-amber-50 dark:bg-amber-950/30"  },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-4">
                <div className={`inline-flex p-2 rounded-lg mb-2 ${s.bg}`}>
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={`text-2xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search by subject or recipient…"
        className="max-w-sm"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="delivered">Delivered</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="failed">Failed</TabsTrigger>
        </TabsList>

        {["all", "delivered", "pending", "failed"].map((t) => (
          <TabsContent key={t} value={t} className="mt-3">
            <DataTable
              data={notifications}
              columns={COLUMNS}
              loading={isLoading}
              rowKey={(n) => n.id}
              emptyTitle="No notifications found"
              emptyDescription="Notifications will appear here as they are sent"
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
          <div className="relative z-10 w-full max-w-md mx-4 sm:mx-auto bg-background rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl p-5 max-h-[90vh] overflow-y-auto">
            <ComposeDialog onClose={() => setComposing(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
