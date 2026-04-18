"use client";

import { useState } from "react";
import { Plus, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/EmptyState";
import { TemplateEditor } from "@/components/notifications/TemplateEditor";
import { useNotificationTemplates } from "@/hooks/useNotifications";
import type { NotificationTemplate } from "@/types";

const CHANNEL_ICONS: Record<string, string> = {
  email: "✉️",
  sms: "📱",
  whatsapp: "💬",
  push: "🔔",
};

export default function NotificationTemplatesPage() {
  const { data, isLoading } = useNotificationTemplates();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const templates: NotificationTemplate[] = data ?? [];

  if (creating || editingId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">
            {editingId ? "Edit Template" : "New Template"}
          </h1>
          <Button variant="outline" onClick={() => { setCreating(false); setEditingId(null); }}>
            Cancel
          </Button>
        </div>
        <TemplateEditor
          template={editingId ? templates.find((t) => t.id === editingId) : undefined}
          onSaved={() => { setCreating(false); setEditingId(null); }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notification Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reusable message templates for email, SMS, and WhatsApp
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          New Template
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 rounded-xl skeleton-shimmer" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No templates yet"
          description="Create your first notification template to start messaging tenants."
          action={{ label: "Create Template", onClick: () => setCreating(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <Card
              key={t.id}
              className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all"
              onClick={() => setEditingId(t.id)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-2xl">{CHANNEL_ICONS[t.channel] ?? "📨"}</span>
                  <Badge variant="outline" className="text-xs capitalize">{t.channel}</Badge>
                </div>
                <CardTitle className="text-sm mt-2">{t.name}</CardTitle>
                <CardDescription className="text-xs line-clamp-2">
                  {t.subject ?? t.body}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs capitalize">
                    {t.trigger.replace(/_/g, " ")}
                  </Badge>
                  {t.isActive && (
                    <Badge variant="success" className="text-xs">Active</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
