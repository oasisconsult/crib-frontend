"use client";

import { useState } from "react";
import { Zap, Plus, CheckCircle, Clock } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/store/useUIStore";
import { utilitiesApi } from "../api";
import { UTILITY_LABELS, UTILITY_ICONS } from "../types";
import { RecordUtilityModal } from "./RecordUtilityModal";
import type { UtilityReading } from "../types";

interface Props {
  leaseId: string;
  currency: string;
  leaseStatus: string;
  canManage: boolean;
}

function fmt(n: number, currency: string) {
  return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" });
}

function ReadingRow({
  r,
  leaseId,
  currency,
  canManage,
}: {
  r: UtilityReading;
  leaseId: string;
  currency: string;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const { mutate: bill, isPending } = useMutation({
    mutationFn: () => utilitiesApi.bill(leaseId, r.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["utility-readings", leaseId] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      toast.success("Billed successfully");
    },
    onError: () => toast.error("Billing failed"),
  });

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-base shrink-0">{UTILITY_ICONS[r.utilityType as keyof typeof UTILITY_ICONS] ?? "🔧"}</span>
        <div className="min-w-0">
          <p className="font-medium truncate">{UTILITY_LABELS[r.utilityType as keyof typeof UTILITY_LABELS] ?? r.utilityType}</p>
          <p className="text-xs text-muted-foreground">
            {fmtDate(r.readingDate)}
            {r.billingType === "metered" && r.unitsConsumed != null
              ? ` · ${r.unitsConsumed.toLocaleString()} units`
              : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-medium tabular-nums">{fmt(r.amount, currency)}</span>
        {r.isBilled ? (
          <Badge variant="success" className="text-[10px] px-1.5 py-0 flex items-center gap-0.5">
            <CheckCircle className="h-3 w-3" />
            Billed
          </Badge>
        ) : canManage ? (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs"
            onClick={() => bill()}
            disabled={isPending}
          >
            <Clock className="h-3 w-3" />
            Bill
          </Button>
        ) : (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            Pending
          </Badge>
        )}
      </div>
    </div>
  );
}

export function UtilityPanel({ leaseId, currency, leaseStatus, canManage }: Props) {
  const [showModal, setShowModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["utility-readings", leaseId],
    queryFn: () => utilitiesApi.list(leaseId),
  });

  const readings: UtilityReading[] = data?.data ?? [];
  const canRecord = canManage && ["active", "agreement_signed"].includes(leaseStatus);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              Utility Charges
            </CardTitle>
            {canRecord && (
              <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => setShowModal(true)}>
                <Plus className="h-3.5 w-3.5" />
                Record
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : readings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No utility charges recorded yet.</p>
          ) : (
            <div className="divide-y">
              {readings.map((r) => (
                <ReadingRow key={r.id} r={r} leaseId={leaseId} currency={currency} canManage={canManage} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showModal && (
        <RecordUtilityModal
          leaseId={leaseId}
          currency={currency}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
