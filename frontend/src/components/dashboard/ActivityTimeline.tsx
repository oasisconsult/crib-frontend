"use client";

import { FileText, CreditCard, UserCheck, ClipboardList, Bell, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelative } from "@/utils/formatters";
import { cn } from "@/utils/cn";

type ActivityType = "lease" | "payment" | "onboarding" | "inspection" | "notification" | "maintenance";

interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: string;
}

const ACTIVITY_ICONS: Record<ActivityType, { icon: React.ComponentType<{ className?: string }>; bg: string; color: string }> = {
  lease: { icon: FileText, bg: "bg-indigo-100 dark:bg-indigo-900/30", color: "text-indigo-600" },
  payment: { icon: CreditCard, bg: "bg-emerald-100 dark:bg-emerald-900/30", color: "text-emerald-600" },
  onboarding: { icon: UserCheck, bg: "bg-sky-100 dark:bg-sky-900/30", color: "text-sky-600" },
  inspection: { icon: ClipboardList, bg: "bg-violet-100 dark:bg-violet-900/30", color: "text-violet-600" },
  notification: { icon: Bell, bg: "bg-amber-100 dark:bg-amber-900/30", color: "text-amber-600" },
  maintenance: { icon: Wrench, bg: "bg-orange-100 dark:bg-orange-900/30", color: "text-orange-600" },
};

// Sample activity data
const SAMPLE_ACTIVITIES: ActivityItem[] = [
  { id: "a1", type: "payment", title: "Rent received", description: "Sarah Mitchell — Flat 1A — £1,500", timestamp: new Date(Date.now() - 2 * 3600000).toISOString() },
  { id: "a2", type: "onboarding", title: "Onboarding submitted", description: "Priya Sharma completed their profile", timestamp: new Date(Date.now() - 5 * 3600000).toISOString() },
  { id: "a3", type: "lease", title: "Lease sent for signature", description: "Room 1 — Riverside HMO", timestamp: new Date(Date.now() - 24 * 3600000).toISOString() },
  { id: "a4", type: "inspection", title: "Inspection scheduled", description: "Flat 1A — 10 Apr 2025, 10:00–12:00", timestamp: new Date(Date.now() - 2 * 24 * 3600000).toISOString() },
  { id: "a5", type: "maintenance", title: "Maintenance reported", description: "Boiler issue — Flat 2B", timestamp: new Date(Date.now() - 3 * 24 * 3600000).toISOString() },
];

interface ActivityTimelineProps {
  activities?: ActivityItem[];
}

export function ActivityTimeline({ activities = SAMPLE_ACTIVITIES }: ActivityTimelineProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <ol className="relative space-y-4" aria-label="Activity timeline">
          {activities.map((item, idx) => {
            const { icon: Icon, bg, color } = ACTIVITY_ICONS[item.type];
            return (
              <li key={item.id} className="flex gap-3 relative">
                {idx < activities.length - 1 && (
                  <div className="absolute left-4 top-8 bottom-0 w-px bg-border" aria-hidden="true" />
                )}
                <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full z-10", bg)}>
                  <Icon className={cn("h-3.5 w-3.5", color)} aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0 pb-1">
                  <p className="text-sm font-medium leading-tight">{item.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</p>
                  <time className="text-xs text-muted-foreground/70 mt-1 block" dateTime={item.timestamp}>
                    {formatRelative(item.timestamp)}
                  </time>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
