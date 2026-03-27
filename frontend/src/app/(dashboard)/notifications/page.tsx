"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, FileText, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FilterBar } from "@/components/common/FilterBar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/utils/formatters";
import { useNotifications, useNotificationStats } from "@/hooks/useNotifications";
import type { Notification } from "@/types";

const CHANNEL_ICONS: Record<string, string> = {
  email: "✉️",
  sms: "📱",
  whatsapp: "💬",
  push: "🔔",
};

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
      <span className="text-sm max-w-xs truncate block">{n.subject}</span>
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

export default function NotificationsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const { data, isLoading } = useNotifications();
  const { data: stats } = useNotificationStats();

  const notifications = (data?.data ?? []).filter((n) => {
    const tabMatch =
      tab === "all" ||
      (tab === "delivered" && n.state === "delivered") ||
      (tab === "failed" && n.state === "failed") ||
      (tab === "pending" && ["queued", "sending"].includes(n.state));
    const searchMatch =
      !search || n.subject?.toLowerCase().includes(search.toLowerCase());
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
        <Button variant="outline" onClick={() => router.push("/notifications/templates")}>
          <FileText className="h-4 w-4" />
          Templates
        </Button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Sent", value: stats.sent, icon: Bell, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
            { label: "Delivered", value: stats.delivered, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
            { label: "Failed", value: stats.failed, icon: XCircle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30" },
            { label: "Read", value: stats.read, icon: Clock, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
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
        placeholder="Search by subject..."
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
    </div>
  );
}
