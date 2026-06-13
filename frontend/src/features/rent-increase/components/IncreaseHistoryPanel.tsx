"use client";

import { useState } from "react";
import { TrendingUp, Download, CheckCircle, XCircle, Plus, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/store/useUIStore";
import { useRentIncreases } from "../hooks/useRentIncreases";
import { IssueIncreaseModal } from "./IssueIncreaseModal";
import { IncreaseTimeline } from "./IncreaseTimeline";
import { rentIncreaseApi } from "../api";
import { STATUS_COLORS, STATUS_LABELS } from "../types";
import type { RentIncrease } from "../types";

interface Props {
  leaseId: string;
  currentRent: number;
  currency: string;
  leaseStatus: string;
  allowCapOverride?: boolean;
}

function fmt(n: number, currency: string) {
  return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" });
}

function IncreaseCard({
  ri,
  currency,
  onAcknowledge,
  onWithdraw,
}: {
  ri: RentIncrease;
  currency: string;
  onAcknowledge: (id: string) => Promise<void>;
  onWithdraw: (id: string) => Promise<void>;
}) {
  const [working, setWorking] = useState(false);

  async function handleAck() {
    setWorking(true);
    try { await onAcknowledge(ri.id); toast.success("Notice acknowledged"); }
    catch { toast.error("Failed to acknowledge"); }
    finally { setWorking(false); }
  }

  async function handleWithdraw() {
    setWorking(true);
    try { await onWithdraw(ri.id); toast.success("Notice withdrawn"); }
    catch { toast.error("Failed to withdraw notice"); }
    finally { setWorking(false); }
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">
              {fmt(ri.currentRent, currency)} → {fmt(ri.newRent, currency)}
            </span>
            <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[ri.status]}`}>
              {STATUS_LABELS[ri.status]}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            +{ri.increasePct.toFixed(2)}% &bull; Effective {fmtDate(ri.effectiveDate)}
          </p>
        </div>
        {ri.noticePdfUrl && (
          <a
            href={rentIncreaseApi.noticePdfUrl(ri.leaseId, ri.id)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Download notice PDF"
          >
            <Button variant="ghost" size="icon-sm">
              <Download className="h-3.5 w-3.5" />
            </Button>
          </a>
        )}
      </div>

      <IncreaseTimeline increase={ri} />

      {ri.notes && (
        <p className="text-xs text-muted-foreground italic border-l-2 border-muted pl-2">{ri.notes}</p>
      )}

      <div className="text-[10px] text-muted-foreground">
        Issued {fmtDate(ri.issuedAt)}
        {ri.acknowledgedAt && ` · Ack. ${fmtDate(ri.acknowledgedAt)}`}
        {ri.appliedAt && ` · Applied ${fmtDate(ri.appliedAt)}`}
      </div>

      {(ri.status === "pending_ack" || ri.status === "acknowledged") && (
        <div className="flex gap-2 pt-1">
          {ri.status === "pending_ack" && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={handleAck}
              disabled={working}
            >
              {working ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />}
              Mark Acknowledged
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-destructive hover:text-destructive"
            onClick={handleWithdraw}
            disabled={working}
          >
            <XCircle className="h-3 w-3 mr-1" />
            Withdraw
          </Button>
        </div>
      )}
    </div>
  );
}

export function IncreaseHistoryPanel({ leaseId, currentRent, currency, leaseStatus, allowCapOverride = false }: Props) {
  const [issueOpen, setIssueOpen] = useState(false);
  const { data, loading, error, create, acknowledge, withdraw } = useRentIncreases(leaseId);

  const canIssue = leaseStatus === "active";
  const hasActive = data.some((r) => r.status === "pending_ack" || r.status === "acknowledged");

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Rent Increases
        </CardTitle>
        {canIssue && !hasActive && (
          <Button size="sm" className="h-7 text-xs" onClick={() => setIssueOpen(true)}>
            <Plus className="h-3 w-3 mr-1" />
            Issue Notice
          </Button>
        )}
        {hasActive && (
          <Badge className="text-[10px] px-1.5 bg-amber-100 text-amber-800">Active Notice</Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {loading && (
          <div className="flex justify-center py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {error && (
          <p className="text-xs text-destructive py-2">{error}</p>
        )}

        {!loading && !error && data.length === 0 && (
          <p className="text-sm text-muted-foreground py-2 text-center">
            No rent increase notices yet.
          </p>
        )}

        {data.map((ri) => (
          <IncreaseCard
            key={ri.id}
            ri={ri}
            currency={currency}
            onAcknowledge={acknowledge}
            onWithdraw={(id) => withdraw(id, {})}
          />
        ))}
      </CardContent>

      <IssueIncreaseModal
        open={issueOpen}
        onOpenChange={setIssueOpen}
        currentRent={currentRent}
        currency={currency}
        allowCapOverride={allowCapOverride}
        onCreate={create}
      />
    </Card>
  );
}
