"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/utils/formatters";
import { useBulkWaiveLateFees, useLeaseLateFees, useWaiveLateFee } from "@/hooks/usePayments";
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
            {fee.periodStart && (
              <> &middot; <span className="font-medium">{new Date(fee.periodStart).toLocaleDateString(undefined, { month: "short", year: "numeric" })} rent</span></>
            )}
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

const PAGE_SIZE = 10;

export function LateFeePanel({ leaseId, currency, canManage = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const [bulkWaiving, setBulkWaiving] = useState(false);
  const [bulkReason, setBulkReason] = useState("");

  const { data, isLoading } = useLeaseLateFees(leaseId, page, PAGE_SIZE);
  const { mutate: bulkWaive, isPending: isBulkPending } = useBulkWaiveLateFees();

  const fees = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const activeOnPage = fees.filter((f) => !f.waived).length;

  function handleBulkWaive() {
    if (!bulkReason.trim()) return;
    bulkWaive(
      { leaseId, reason: bulkReason.trim() },
      {
        onSuccess: () => {
          setBulkWaiving(false);
          setBulkReason("");
          setPage(1);
        },
      },
    );
  }

  if (isLoading && !data) {
    return (
      <Card>
        <CardContent className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data || total === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          Late Fees
          <span className="text-xs text-muted-foreground font-normal">{total} total</span>

          {canManage && activeOnPage > 0 && !bulkWaiving && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-6 px-2 text-xs text-amber-700 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/20"
              onClick={() => { setExpanded(true); setBulkWaiving(true); }}
            >
              Waive All Active
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            className={`h-7 w-7 p-0 ${canManage && activeOnPage > 0 && !bulkWaiving ? "" : "ml-auto"}`}
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse late fees" : "Expand late fees"}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CardTitle>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-3">
          {bulkWaiving && (
            <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 space-y-2">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                Waive all active late fees on this lease — this action cannot be undone
              </p>
              <Textarea
                placeholder="Reason for waiving all fees (required)"
                value={bulkReason}
                onChange={(e) => setBulkReason(e.target.value)}
                rows={2}
                className="text-sm resize-none bg-white dark:bg-background"
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleBulkWaive}
                  disabled={!bulkReason.trim() || isBulkPending}
                  loading={isBulkPending}
                  className="bg-amber-600 hover:bg-amber-700 text-white border-0"
                >
                  Confirm — Waive All
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setBulkWaiving(false); setBulkReason(""); }}
                  disabled={isBulkPending}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <div>
            {fees.map((fee) => (
              <FeeRow
                key={fee.id}
                fee={fee}
                currency={currency}
                canManage={canManage}
                leaseId={leaseId}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-3 border-t border-border mt-1">
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
