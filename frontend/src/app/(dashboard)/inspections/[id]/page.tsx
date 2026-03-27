"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckSquare, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PageSkeleton } from "@/components/common/LoadingSkeleton";
import { formatDate } from "@/utils/formatters";
import { useInspection } from "@/hooks/useInspections";
import { cn } from "@/utils/cn";

interface Props {
  params: Promise<{ id: string }>;
}

export default function InspectionDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const { data: inspection, isLoading } = useInspection(id);

  if (isLoading) return <PageSkeleton />;
  if (!inspection) return null;

  const passedItems = inspection.checklist?.filter((c) => c.condition && c.condition !== "poor" && c.condition !== "damaged") ?? [];
  const failedItems = inspection.checklist?.filter((c) => c.condition === "poor" || c.condition === "damaged" || !c.condition) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight font-mono">
              #{inspection.id.slice(-8).toUpperCase()}
            </h1>
            <StatusBadge state={inspection.state} domain="inspection" />
          </div>
          <p className="text-sm text-muted-foreground capitalize">
            {inspection.type.replace(/_/g, " ")} Inspection
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {inspection.checklist && inspection.checklist.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  Checklist
                  <span className="text-sm font-normal text-muted-foreground">
                    {passedItems.length}/{inspection.checklist.length} passed
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {inspection.checklist.map((item, idx) => {
                    const isGood = item.condition && !["poor", "damaged"].includes(item.condition);
                    return (
                      <div
                        key={item.id ?? idx}
                        className={cn(
                          "flex items-start gap-3 rounded-lg p-3 border",
                          isGood
                            ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                            : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30",
                        )}
                      >
                        {isGood ? (
                          <CheckSquare className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{item.area} — {item.description}</p>
                          <p className="text-xs text-muted-foreground capitalize">{item.condition ?? "not assessed"}</p>
                          {item.notes && (
                            <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {inspection.summary && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Inspector Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{inspection.summary}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unit</span>
                <span>#{inspection.unitId.slice(-4)}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Scheduled</span>
                <span>{formatDate(inspection.scheduledDate)}</span>
              </div>
              {inspection.completedAt && (
                <>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Completed</span>
                    <span>{formatDate(inspection.completedAt)}</span>
                  </div>
                </>
              )}
              {inspection.inspectorName && (
                <>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Inspector</span>
                    <span>{inspection.inspectorName}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-emerald-600">Passed</span>
                <Badge variant="success">{passedItems.length}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-red-600">Failed</span>
                <Badge variant="destructive">{failedItems.length}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
