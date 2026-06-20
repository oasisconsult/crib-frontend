"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Loader2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/utils/formatters";
import { useLeaseLateFees, useWaiveLateFee } from "@/hooks/usePayments";
import type { LeaseLateFee } from "@/services/api/payments";

interface Props {
  leaseId: string;
  currency: string;
  canManage?: boolean;
}

function FeeRow({
  fee,
  currency,
  canManage,
  leaseId,
}: {
  fee: LeaseLateFee;
  currency: string;
  canManage: boolean;
  leaseId: string;
}) {
  const [waiving, setWaiving] = useState(false);
  const [reason, setReason] = useState("");
  const { mutate: waive, isPending } = useWaiveLateFee();

  function handleWaive() {
    if (!reason.trim()) return;
    waive(
      { leaseId, id: fee.id, reason: reason.trim() },
      { onSuccess: () => { setWaiving(false); setReason(""); } },
    );
  }

  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">
              {formatCurrency(fee.calculatedAmount, currency)}
            </span>
            <span className="text-xs text-muted-foreground">
              {fee.feeType === "percentage" ? "% of rent" : "flat fee"}
            </span>
            {fee.waived ? (
              <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 text-xs">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Waived
              </Badge>
            ) : (
              <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950/20 text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Active
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Applied {formatDate(fee.appliedAt)}
          </p>
          {fee.waived && fee.waivedAt && (
            <p className="text-xs text-muted-foreground">
              Waived {formatDate(fee.waivedAt)}
              {fee.waivedReason && (
                <> &mdash; <span className="italic">{fee.waivedReason}</span></>
              )}
            </p>
          )}
        </div>

        {canManage && !fee.waived && !waiving && (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 text-xs"
            onClick={() => setWaiving(true)}
          >
            Waive
          </Button>
        )}
      </div>

      {waiving && (
        <div className="mt-3 space-y-2">
          <Textarea
            placeholder="Reason for waiving (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="text-sm resize-none"
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleWaive}
              disabled={!reason.trim() || isPending}
              loading={isPending}
            >
              Confirm Waive
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setWaiving(false); setReason(""); }}
              disabled={isPending}
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function LateFeePanel({ leaseId, currency, canManage = false }: Props) {
  const { data: fees, isLoading } = useLeaseLateFees(leaseId);
  const [expanded, setExpanded] = useState(true);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!fees || fees.length === 0) return null;

  const activeCount = fees.filter((f) => !f.waived).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          Late Fees
          {activeCount > 0 && (
            <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950/20 text-xs font-normal">
              {activeCount} active
            </Badge>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 w-7 p-0"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse late fees" : "Expand late fees"}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CardTitle>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          {fees.map((fee) => (
            <FeeRow
              key={fee.id}
              fee={fee}
              currency={currency}
              canManage={canManage}
              leaseId={leaseId}
            />
          ))}
        </CardContent>
      )}
    </Card>
  );
}
