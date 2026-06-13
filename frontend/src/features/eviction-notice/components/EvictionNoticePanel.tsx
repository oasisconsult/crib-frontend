"use client";

import { useState } from "react";
import { Gavel, Download, CheckCircle, XCircle, Plus, Loader2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/store/useUIStore";
import { useEvictionNotices } from "../hooks/useEvictionNotices";
import { IssueEvictionModal } from "./IssueEvictionModal";
import { evictionNoticeApi } from "../api";
import { ACTIVE_STATUSES, NOTICE_TYPE_LABELS, STATUS_COLORS, STATUS_LABELS } from "../types";
import type { EvictionNotice } from "../types";

interface Props {
  leaseId: string;
  leaseStatus: string;
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" });
}

function NoticeCard({
  notice,
  onServe,
  onWithdraw,
}: {
  notice: EvictionNotice;
  onServe: (id: string) => Promise<void>;
  onWithdraw: (id: string) => Promise<void>;
}) {
  const [working, setWorking] = useState(false);

  async function handleServe() {
    setWorking(true);
    try { await onServe(notice.id); toast.success("Notice marked as served"); }
    catch { toast.error("Failed to mark as served"); }
    finally { setWorking(false); }
  }

  async function handleWithdraw() {
    setWorking(true);
    try { await onWithdraw(notice.id); toast.success("Notice withdrawn"); }
    catch { toast.error("Failed to withdraw notice"); }
    finally { setWorking(false); }
  }

  const isActive = (ACTIVE_STATUSES as string[]).includes(notice.status);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">
              {NOTICE_TYPE_LABELS[notice.noticeType]}
            </span>
            <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[notice.status]}`}>
              {STATUS_LABELS[notice.status]}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Vacate by <strong>{fmtDate(notice.effectiveDate)}</strong>
          </p>
        </div>
        {notice.noticePdfUrl && (
          <a
            href={evictionNoticeApi.noticePdfUrl(notice.leaseId, notice.id)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Download eviction notice PDF"
          >
            <Button variant="ghost" size="icon-sm">
              <Download className="h-3.5 w-3.5" />
            </Button>
          </a>
        )}
      </div>

      <p className="text-xs text-muted-foreground line-clamp-2 border-l-2 border-muted pl-2">
        {notice.reason}
      </p>

      {notice.courtReference && (
        <p className="text-xs text-muted-foreground">
          Court ref: <span className="font-mono">{notice.courtReference}</span>
        </p>
      )}

      <div className="text-[10px] text-muted-foreground space-x-1">
        <span>Issued {fmtDate(notice.issuedAt)}</span>
        {notice.servedAt && <span>&bull; Served {fmtDate(notice.servedAt)}</span>}
        {notice.disputedAt && <span>&bull; Disputed {fmtDate(notice.disputedAt)}</span>}
        {notice.withdrawnAt && <span>&bull; Withdrawn {fmtDate(notice.withdrawnAt)}</span>}
        {notice.executedAt && <span>&bull; Executed {fmtDate(notice.executedAt)}</span>}
      </div>

      {isActive && (
        <div className="flex gap-2 pt-1">
          {notice.status === "issued" && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={handleServe}
              disabled={working}
            >
              {working ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />}
              Mark Served
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

export function EvictionNoticePanel({ leaseId, leaseStatus }: Props) {
  const [issueOpen, setIssueOpen] = useState(false);
  const { data, loading, error, create, serve, withdraw } = useEvictionNotices(leaseId);

  const canIssue = leaseStatus === "active";
  const hasActive = data.some((n) => (ACTIVE_STATUSES as string[]).includes(n.status));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Gavel className="h-4 w-4" />
          Eviction Notices
        </CardTitle>
        {canIssue && !hasActive && (
          <Button
            size="sm"
            variant="destructive"
            className="h-7 text-xs"
            onClick={() => setIssueOpen(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Issue Notice
          </Button>
        )}
        {hasActive && (
          <Badge className="text-[10px] px-1.5 bg-red-100 text-red-800 flex items-center gap-1">
            <AlertTriangle className="h-2.5 w-2.5" />
            Active Notice
          </Badge>
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
            No eviction notices on record.
          </p>
        )}

        {data.map((notice) => (
          <NoticeCard
            key={notice.id}
            notice={notice}
            onServe={serve}
            onWithdraw={(id) => withdraw(id)}
          />
        ))}
      </CardContent>

      <IssueEvictionModal
        open={issueOpen}
        onOpenChange={setIssueOpen}
        onCreate={create}
      />
    </Card>
  );
}
