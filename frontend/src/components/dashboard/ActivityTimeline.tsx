"use client";

import { useState, useEffect } from "react";
import {
  FileText,
  CreditCard,
  UserCheck,
  ClipboardList,
  Wrench,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/utils/formatters";
import { cn } from "@/utils/cn";

type ActivityType =
  | "lease"
  | "payment"
  | "onboarding"
  | "inspection"
  | "maintenance";

interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: string;
}

const ICONS: Record<
  ActivityType,
  {
    icon: React.ComponentType<{ className?: string }>;
    bg: string;
    color: string;
  }
> = {
  lease: {
    icon: FileText,
    bg: "bg-teal-100 dark:bg-teal-100/40",
    color: "text-teal-600",
  },
  payment: {
    icon: CreditCard,
    bg: "bg-emerald-100 dark:bg-emerald-100/40",
    color: "text-emerald-600",
  },
  onboarding: {
    icon: UserCheck,
    bg: "bg-teal-100 dark:bg-teal-100/40",
    color: "text-teal-600",
  },
  inspection: {
    icon: ClipboardList,
    bg: "bg-teal-100 dark:bg-teal-100/40",
    color: "text-teal-600",
  },
  maintenance: {
    icon: Wrench,
    bg: "bg-orange-100 dark:bg-orange-100/40",
    color: "text-orange-600",
  },
};

function buildActivities(now: number): ActivityItem[] {
  return [
    {
      id: "a1",
      type: "payment",
      title: "Rent received",
      description: "Brian Ssempala · Kololo Heights · UGX 1,500,000",
      timestamp: new Date(now - 1 * 3600000).toISOString(),
    },
    {
      id: "a2",
      type: "onboarding",
      title: "Onboarding complete",
      description: "Fatuma Nakato submitted her profile",
      timestamp: new Date(now - 4 * 3600000).toISOString(),
    },
    {
      id: "a3",
      type: "lease",
      title: "Lease sent for signing",
      description: "Unit A · Ntinda View Flats",
      timestamp: new Date(now - 24 * 3600000).toISOString(),
    },
    {
      id: "a4",
      type: "inspection",
      title: "Inspection scheduled",
      description: "Room 101 · Bugolobi Lodge · 10 Apr, 10:00–12:00",
      timestamp: new Date(now - 2 * 24 * 3600000).toISOString(),
    },
    {
      id: "a5",
      type: "maintenance",
      title: "Maintenance reported",
      description: "Leaking pipe · Unit B · Ntinda View",
      timestamp: new Date(now - 3 * 24 * 3600000).toISOString(),
    },
  ];
}

export function ActivityTimeline({
  activities: activitiesProp,
}: {
  activities?: ActivityItem[];
}) {
  const [items, setItems] = useState<ActivityItem[]>([]);

  useEffect(() => {
    if (!activitiesProp) setItems(buildActivities(Date.now()));
  }, [activitiesProp]);

  const activities = activitiesProp ?? items;

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Recent Activity</CardTitle>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
            See all <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 px-4 pb-4">
        <ol className="relative space-y-1">
          {activities.map((item, idx) => {
            const { icon: Icon, bg, color } = ICONS[item.type];
            return (
              <li key={item.id} className="flex gap-3 relative pb-3">
                {idx < activities.length - 1 && (
                  <div className="absolute left-[15px] top-8 bottom-0 w-px bg-border" />
                )}
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full z-10 mt-0.5",
                    bg,
                  )}
                >
                  <Icon className={cn("h-3.5 w-3.5", color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">
                    {item.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    {item.description}
                  </p>
                  <time
                    className="text-xs text-muted-foreground/60 mt-1 block"
                    dateTime={item.timestamp}
                    suppressHydrationWarning
                  >
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
