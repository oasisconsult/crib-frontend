"use client";

import { useState } from "react";
import {
  FileText, Calendar, CreditCard, User, Building2,
  Send, CheckCircle, XCircle, AlertTriangle, Download,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { LeaseWorkflowStepper } from "./WorkflowStepper";
import { TerminateModal } from "./TerminateModal";
import { formatCurrency, formatDate, formatDateRange, formatDays } from "@/utils/formatters";
import { useTransitionLease } from "@/hooks/useLeases";
import { canTransition, LEASE_TRANSITIONS } from "@/types/states";
import type { Lease } from "@/types";

interface LeaseDetailPanelProps {
  lease: Lease;
}

export function LeaseDetailPanel({ lease }: LeaseDetailPanelProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [pendingEvent, setPendingEvent] = useState<string | null>(null);
  const { mutate: transition, isPending } = useTransitionLease();

  const handleTransition = (event: string) => {
    setPendingEvent(event);
    setConfirmOpen(true);
  };

  const confirmTransition = () => {
    if (!pendingEvent) return;
    transition(
      { id: lease.id, event: pendingEvent as Parameters<typeof transition>[0]["event"] },
      { onSettled: () => setConfirmOpen(false) },
    );
  };

  const canSend = canTransition(LEASE_TRANSITIONS, lease.state, "LEASE_SENT");
  const canActivate = canTransition(LEASE_TRANSITIONS, lease.state, "LEASE_ACTIVATED");
  const canTerminate =
    canTransition(LEASE_TRANSITIONS, lease.state, "LEASE_TERMINATED");
  const canGiveNotice = canTransition(LEASE_TRANSITIONS, lease.state, "NOTICE_GIVEN");
  const canClose = canTransition(LEASE_TRANSITIONS, lease.state, "LEASE_CLOSED");

  const allSigned = lease.signatures.every((s) => s.status === "signed");

  return (
    <div className="space-y-6">
      {/* Workflow */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Lease Status</CardTitle>
            <StatusBadge state={lease.state} domain="lease" />
          </div>
        </CardHeader>
        <CardContent>
          <LeaseWorkflowStepper state={lease.state} className="overflow-x-auto pb-2" />

          {/* Actions */}
          <div className="flex flex-wrap gap-2 mt-5">
            {canSend && (
              <Button size="sm" onClick={() => handleTransition("LEASE_SENT")}>
                <Send className="h-3.5 w-3.5" />
                Send for Signature
              </Button>
            )}
            {canActivate && allSigned && (
              <Button size="sm" variant="success" onClick={() => handleTransition("LEASE_ACTIVATED")}>
                <CheckCircle className="h-3.5 w-3.5" />
                Activate Lease
              </Button>
            )}
            {canActivate && !allSigned && (
              <Alert variant="warning" className="text-xs py-2 px-3">
                <AlertTriangle className="h-3.5 w-3.5" />
                <AlertDescription>Awaiting all signatures before activation</AlertDescription>
              </Alert>
            )}
            {canGiveNotice && (
              <Button size="sm" variant="warning" onClick={() => handleTransition("NOTICE_GIVEN")}>
                <AlertTriangle className="h-3.5 w-3.5" />
                Give Notice
              </Button>
            )}
            {canClose && (
              <Button size="sm" variant="outline" onClick={() => handleTransition("LEASE_CLOSED")}>
                <XCircle className="h-3.5 w-3.5" />
                Close Lease
              </Button>
            )}
            {canTerminate && (
              <Button size="sm" variant="destructive" onClick={() => setTerminateOpen(true)}>
                <XCircle className="h-3.5 w-3.5" />
                Terminate
              </Button>
            )}
            {lease.documentUrl && (
              <Button size="sm" variant="outline" asChild>
                <a href={lease.documentUrl} download>
                  <Download className="h-3.5 w-3.5" />
                  Download PDF
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Details grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Terms */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              Financial Terms
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <DetailRow label="Monthly Rent" value={formatCurrency(lease.terms.monthlyRent, lease.terms.currency)} />
            <Separator />
            <DetailRow label="Deposit" value={formatCurrency(lease.terms.depositAmount, lease.terms.currency)} />
            <DetailRow
              label="Late Fee"
              value={
                lease.terms.lateFeeType === "flat"
                  ? formatCurrency(lease.terms.lateFeeValue, lease.terms.currency)
                  : `${lease.terms.lateFeeValue}%`
              }
            />
            <DetailRow label="Grace Period" value={formatDays(lease.terms.gracePeriodDays)} />
          </CardContent>
        </Card>

        {/* Dates */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Dates & Periods
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <DetailRow label="Period" value={formatDateRange(lease.terms.startDate, lease.terms.endDate)} />
            <Separator />
            <DetailRow label="Notice Period" value={formatDays(lease.terms.noticePeriodDays)} />
            <DetailRow label="Activated" value={formatDate(lease.activatedAt)} />
            {lease.noticeDateGiven && (
              <DetailRow label="Notice Given" value={formatDate(lease.noticeDateGiven)} />
            )}
          </CardContent>
        </Card>

        {/* Signatures */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Signatures
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {lease.signatures.map((sig) => (
              <div key={sig.party} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium capitalize">{sig.party}</p>
                  <p className="text-xs text-muted-foreground">{sig.name}</p>
                  {sig.signedAt && (
                    <p className="text-xs text-muted-foreground">{formatDate(sig.signedAt)}</p>
                  )}
                </div>
                <Badge
                  variant={
                    sig.status === "signed" ? "success" :
                    sig.status === "declined" ? "destructive" : "warning"
                  }
                >
                  {sig.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Reference */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Reference
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <DetailRow label="Ref" value={<code className="font-mono text-xs">{lease.reference}</code>} />
            <Separator />
            <DetailRow label="Type" value={lease.type.replace("_", " ")} />
            <DetailRow label="Created" value={formatDate(lease.createdAt)} />
          </CardContent>
        </Card>
      </div>

      {/* Confirm transition dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm Action"
        description={`Are you sure you want to transition this lease with event: ${pendingEvent?.replace(/_/g, " ")}?`}
        variant="warning"
        confirmLabel="Confirm"
        onConfirm={confirmTransition}
        loading={isPending}
      />

      {/* Terminate modal */}
      <TerminateModal
        open={terminateOpen}
        onOpenChange={setTerminateOpen}
        leaseId={lease.id}
      />
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right">{value ?? "—"}</span>
    </div>
  );
}
