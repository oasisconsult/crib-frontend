"use client";

import { useRouter } from "next/navigation";
import { Building2, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/utils/formatters";
import { useProperties } from "@/hooks/useProperties";
import { cn } from "@/utils/cn";

// Colour pool for property icon backgrounds
const BG_COLORS = [
  "bg-indigo-100 dark:bg-indigo-100/40 text-indigo-600",
  "bg-violet-100 dark:bg-violet-100/40 text-violet-600",
  "bg-sky-100 dark:bg-sky-100/40 text-sky-600",
];

export function TopProperties() {
  const router = useRouter();
  const { data, isLoading } = useProperties({ pageSize: 5 } as any);
  const properties = (data?.data ?? []).slice(0, 4);

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Top Properties</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/properties")}
            className="h-7 px-2 text-xs gap-1"
          >
            View all <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-1 pt-0">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5">
                <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-4 w-10" />
              </div>
            ))
          : properties.map((prop, i) => {
              const occupancy = prop.occupancyRate ?? 0;
              const isUp = occupancy >= 75;
              return (
                <button
                  key={prop.id}
                  onClick={() => router.push(`/properties/${prop.id}`)}
                  className="w-full flex items-center gap-3 rounded-lg py-2.5 px-2 hover:bg-primary/5 transition-colors text-left"
                >
                  {/* Icon */}
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                      BG_COLORS[i % BG_COLORS.length],
                    )}
                  >
                    <Building2 className="h-4 w-4" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{prop.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {prop.address?.city ?? "Kampala"} · {prop.occupiedUnits}/
                      {prop.totalUnits} units
                    </p>
                  </div>

                  {/* Occupancy */}
                  <div
                    className={cn(
                      "flex items-center gap-1 text-sm font-semibold shrink-0",
                      isUp ? "text-emerald-600" : "text-red-500",
                    )}
                  >
                    {isUp ? (
                      <TrendingUp className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5" />
                    )}
                    {occupancy}%
                  </div>
                </button>
              );
            })}

        {/* Total revenue summary */}
        {!isLoading && properties.length > 0 && (
          <div className="mt-2 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
            <span>Combined monthly revenue</span>
            <span className="font-semibold text-foreground">
              {formatCurrency(
                properties.reduce((s, p) => s + (p.monthlyRevenue ?? 0), 0),
                "UGX",
              )}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
