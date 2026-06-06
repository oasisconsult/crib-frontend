"use client";

import { useState } from "react";
import {
  FileText, Calendar, CreditCard, Building2,
  Send, CheckCircle, XCircle, AlertTriangle, Download, Loader2, Copy, Link, Edit,
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
import { PresignAgreementModal } from "./PresignAgreementModal";
import { LeaseMessagesPanel } from "./LeaseMessagesPanel";
import { RecordManualPaymentModal } from "./RecordManualPaymentModal";
import { formatCurrency, formatDate, formatDateRange, formatDays } from "@/utils/formatters";
import { useTransitionLease, useSendOnboarding, useConfirmOnboardingPayments, useAcknowledgeLease, useSubmitNotice, useRetractNotice, useDeleteLease } from "@/hooks/useLeases";
import { leasesApi } from "@/services/api/leases";
import { toast } from "@/store/useUIStore";
import { canTransition, LEASE_TRANSITIONS } from "@/types/states";
import type { Lease } from "@/types";

interface LeaseDetailPanelProps {
  lease: Lease;
}

export function LeaseDetailPanel({ lease }: LeaseDetailPanelProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [presignOpen, setPresignOpen] = useState(false);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeVacateDate, setNoticeVacateDate] = useState("");
  const [noticeReason, setNoticeReason] = useState("");
  const [pendingEvent, setPendingEvent] = useState<string | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | undefined>(lease.documentUrl);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [onboardingToken, setOnboardingToken] = useState<string | null>(null);
  const { mutate: transition, isPending } = useTransitionLease();
  const { mutate: sendOnboarding, isPending: sendingOnboarding } = useSendOnboarding();
  const { mutate: confirmPayments, isPending: confirmingPayments } = useConfirmOnboardingPayments();
  const { mutate: acknowledge, isPending: acknowledging } = useAcknowledgeLease();
  const { mutate: submitNotice, isPending: submittingNotice } = useSubmitNotice();
  const { mutate: retractNotice, isPending: retractingNotice } = useRetractNotice();
  const { mutate: deleteLease, isPending: deletingLease } = useDeleteLease();

  // Default vacate date = today + notice period days (editable in the dialog)
  const defaultVacateDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + (lease.terms.noticePeriodDays ?? 30));
    return d.toISOString().split("T")[0];
  })();

  function openNoticeDialog() {
    setNoticeVacateDate(defaultVacateDate);
    setNoticeReason("");
    setNoticeOpen(true);
  }

  function confirmNotice() {
    submitNotice(
      { id: lease.id, vacateDate: noticeVacateDate, reason: noticeReason || undefined },
      { onSettled: () => setNoticeOpen(false) },
    );
  }

  // Imported leases have no terms_accepted_at and no paper acknowledgement
  const needsConfirmation =
    lease.state === "active" &&
    !lease.termsAcceptedAt &&
    !lease.paperAgreementAcknowledged;

  async function handleGeneratePdf() {
    setGeneratingPdf(true);
    try {
      const { url } = await leasesApi.generateDocument(lease.id);
      setDocumentUrl(url);
      toast.success("Document generated");
    } catch {
      toast.error("Failed to generate document");
    } finally {
      setGeneratingPdf(false);
    }
  }

  const handleTransition = (event: string) => {
    setPendingEvent(event);
    setConfirmOpen(true);
  };

  const confirmTransition = () => {
    if (!pendingEvent) return;
    if (pendingEvent === "DELETE_DRAFT") {
      deleteLease(lease.id, { onSettled: () => setConfirmOpen(false) });
      return;
    }
    if (pendingEvent === "RETRACT_NOTICE") {
      retractNotice(lease.id, { onSettled: () => setConfirmOpen(false) });
      return;
    }
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
      {/* ── Imported lease — agreement confirmation banner ── */}
      {needsConfirmation && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-0.5">
              <p className="font-medium text-sm">Offline agreement not yet recorded</p>
              <p className="text-xs text-muted-foreground">
                This lease was migrated from an existing tenancy. Upload a scan of the signed paper
                agreement or click <strong>Mark as acknowledged</strong> to confirm a paper copy is on file.
                The tenant will also be prompted to confirm their terms on first portal login.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              loading={acknowledging}
              onClick={() => acknowledge(lease.id)}
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Mark as acknowledged
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* ── Notice to vacate banner — lease stays active during notice period ── */}
      {lease.state === "active" && lease.noticeGivenAt && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="space-y-0.5">
              <p className="font-medium text-sm">Notice to Vacate Recorded</p>
              <p className="text-xs text-muted-foreground">
                Notice submitted on <strong>{formatDate(lease.noticeGivenAt)}</strong>.
                {lease.noticeVacateDate && (
                  <> Tenant intends to vacate by <strong>{formatDate(lease.noticeVacateDate)}</strong>.</>
                )}
                {" "}The lease remains <strong>active</strong> until the tenant physically vacates.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                loading={retractingNotice}
                onClick={() => {
                  setPendingEvent("RETRACT_NOTICE");
                  setConfirmOpen(true);
                }}
              >
                Retract Notice
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setTerminateOpen(true)}
              >
                <XCircle className="h-3.5 w-3.5" />
                Terminate Lease
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

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
            {/* Resend onboarding link — regenerates the token if the tenant lost or the link expired.
                Available for any in-progress onboarding state (draft through payment_secured). */}
            {["draft", "onboarding_started", "agreement_previewed", "terms_accepted", "payment_pending", "payment_secured"].includes(lease.state) && lease.tenantId && (
              <Button
                size="sm"
                variant="outline"
                disabled={sendingOnboarding}
                onClick={() =>
                  sendOnboarding(lease.id, {
                    onSuccess: (data) => {
                      setOnboardingToken(data.token);
                      toast.success("New onboarding link generated");
                    },
                  })
                }
              >
                {sendingOnboarding
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Link className="h-3.5 w-3.5" />}
                Resend Link
              </Button>
            )}
            {/* Pre-sign agreement — manager signs before sending to tenant */}
            {["draft", "onboarding_started", "agreement_previewed", "terms_accepted", "payment_pending", "payment_secured"].includes(lease.state) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPresignOpen(true)}
              >
                <Edit className="h-3.5 w-3.5" />
                Pre-sign Agreement
              </Button>
            )}
            {/* Confirm onboarding payments — unblocks tenant to sign the agreement */}
            {lease.state === "payment_pending" && (
              <Button
                size="sm"
                variant="success"
                disabled={confirmingPayments}
                onClick={() => confirmPayments(lease.id)}
              >
                {confirmingPayments
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <CheckCircle className="h-3.5 w-3.5" />}
                Confirm Payment
              </Button>
            )}
            {/* Record manual payment — available on active leases */}
            {lease.state === "active" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRecordPaymentOpen(true)}
              >
                <CreditCard className="h-3.5 w-3.5" />
                Record Payment
              </Button>
            )}
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
            {canGiveNotice && !lease.noticeGivenAt && (
              <Button size="sm" variant="warning" onClick={openNoticeDialog}>
                <AlertTriangle className="h-3.5 w-3.5" />
                Give Notice
              </Button>
            )}
            {canGiveNotice && lease.noticeGivenAt && (
              <Button size="sm" variant="warning" disabled>
                <CheckCircle className="h-3.5 w-3.5" />
                Notice Recorded
              </Button>
            )}
            {canClose && (
              <Button size="sm" variant="outline" onClick={() => handleTransition("LEASE_CLOSED")}>
                <XCircle className="h-3.5 w-3.5" />
                Close Lease
              </Button>
            )}
            {canTerminate && lease.state === "draft" && (
              <Button
                size="sm"
                variant="destructive"
                loading={deletingLease}
                onClick={() => {
                  setPendingEvent("DELETE_DRAFT");
                  setConfirmOpen(true);
                }}
              >
                <XCircle className="h-3.5 w-3.5" />
                Delete Draft
              </Button>
            )}
            {canTerminate && lease.state !== "draft" && (
              <Button size="sm" variant="destructive" onClick={() => setTerminateOpen(true)}>
                <XCircle className="h-3.5 w-3.5" />
                Terminate
              </Button>
            )}
            {documentUrl ? (
              <Button size="sm" variant="outline" asChild>
                <a href={documentUrl} target="_blank" rel="noreferrer" download>
                  <Download className="h-3.5 w-3.5" />
                  Download PDF
                </a>
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={generatingPdf} onClick={handleGeneratePdf}>
                {generatingPdf
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <FileText className="h-3.5 w-3.5" />}
                {generatingPdf ? "Generating…" : "Generate PDF"}
              </Button>
            )}
          </div>

          {/* Onboarding link — shown after manager clicks "Send to Tenant" */}
          {onboardingToken && (
            <div className="mt-4 rounded-[5px] border border-primary/30 bg-primary/5 p-3 text-sm">
              <p className="font-medium text-primary mb-1.5 flex items-center gap-1.5">
                <Link className="h-3.5 w-3.5" />
                Onboarding link ready — share with tenant
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate text-xs bg-background border rounded px-2 py-1 font-mono">
                  {`${window.location.origin}/onboarding/${onboardingToken}`}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/onboarding/${onboardingToken}`);
                    toast.success("Link copied");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </Button>
              </div>
            </div>
          )}
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
            {lease.advanceMonths != null && (
              <>
                <Separator />
                <DetailRow
                  label="Advance Rent"
                  value={`${lease.advanceMonths} month${lease.advanceMonths !== 1 ? "s" : ""} (${formatCurrency(lease.terms.monthlyRent * lease.advanceMonths, lease.terms.currency)})`}
                />
              </>
            )}
            <Separator />
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
            {lease.noticeGivenAt && (
              <>
                <Separator />
                <DetailRow label="Notice Given" value={formatDate(lease.noticeGivenAt)} />
              </>
            )}
            {lease.noticeVacateDate && (
              <>
                <Separator />
                <DetailRow label="Vacate By" value={formatDate(lease.noticeVacateDate)} />
              </>
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
            {(lease.signatures.length > 0
              ? lease.signatures
              : [
                  { party: "tenant" as const, name: lease.tenantName ?? (lease.tenantId ? "Tenant" : "—"), status: "pending" as const, signedAt: undefined },
                  { party: "landlord" as const, name: "Landlord / Manager", status: "pending" as const, signedAt: undefined },
                ]
            ).map((sig) => (
              <div key={sig.party} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium capitalize">{sig.party}</p>
                  {sig.name && <p className="text-xs text-muted-foreground">{sig.name}</p>}
                  {sig.signedAt && (
                    <p className="text-xs text-muted-foreground">{formatDate(sig.signedAt)}</p>
                  )}
                </div>
                <Badge
                  variant={
                    sig.status === "signed" ? "success" :
                    sig.status === "declined" ? "destructive" : "secondary"
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

      {/* Messages */}
      <LeaseMessagesPanel leaseId={lease.id} />

      {/* Confirm transition dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={
          pendingEvent === "DELETE_DRAFT" ? "Delete Draft Lease" :
          pendingEvent === "RETRACT_NOTICE" ? "Retract Notice to Vacate" :
          "Confirm Action"
        }
        description={
          pendingEvent === "DELETE_DRAFT"
            ? "This draft lease has not been activated. Deleting it is permanent and cannot be undone."
            : pendingEvent === "RETRACT_NOTICE"
            ? "This will withdraw the notice to vacate. The tenant will be notified and their lease continues as normal."
            : `Are you sure you want to transition this lease with event: ${pendingEvent?.replace(/_/g, " ")}?`
        }
        variant={pendingEvent === "RETRACT_NOTICE" ? "default" : "destructive"}
        confirmLabel={
          pendingEvent === "DELETE_DRAFT" ? "Delete" :
          pendingEvent === "RETRACT_NOTICE" ? "Retract Notice" :
          "Confirm"
        }
        onConfirm={confirmTransition}
        loading={isPending || deletingLease || retractingNotice}
      />

      {/* Terminate modal */}
      <TerminateModal
        open={terminateOpen}
        onOpenChange={setTerminateOpen}
        leaseId={lease.id}
      />

      {/* Pre-sign agreement modal */}
      <PresignAgreementModal
        leaseId={lease.id}
        open={presignOpen}
        onOpenChange={setPresignOpen}
      />

      {/* Give Notice dialog — records notice_given_at + notice_vacate_date,
          lease stays ACTIVE so the Terminate button remains available */}
      <GiveNoticeDialog
        open={noticeOpen}
        onOpenChange={setNoticeOpen}
        vacateDate={noticeVacateDate}
        onVacateDateChange={setNoticeVacateDate}
        reason={noticeReason}
        onReasonChange={setNoticeReason}
        onConfirm={confirmNotice}
        loading={submittingNotice}
        noticePeriodDays={lease.terms.noticePeriodDays ?? 30}
      />

      {/* Record manual payment modal */}
      <RecordManualPaymentModal
        open={recordPaymentOpen}
        onOpenChange={setRecordPaymentOpen}
        leaseId={lease.id}
        currency={lease.terms.currency}
      />
    </div>
  );
}

// ── Give Notice inline dialog ─────────────────────────────────────────────────

function GiveNoticeDialog({
  open, onOpenChange,
  vacateDate, onVacateDateChange,
  reason, onReasonChange,
  onConfirm, loading,
  noticePeriodDays,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vacateDate: string;
  onVacateDateChange: (v: string) => void;
  reason: string;
  onReasonChange: (v: string) => void;
  onConfirm: () => void;
  loading: boolean;
  noticePeriodDays: number;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Give Notice to Vacate"
      description={
        <div className="space-y-4 pt-1">
          <p className="text-sm text-muted-foreground">
            The lease will remain <strong>active</strong> until the vacate date. You can still
            terminate it early using the <strong>Terminate</strong> button.
          </p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Vacate date
              <span className="ml-1 text-xs text-muted-foreground font-normal">
                (min. {noticePeriodDays} days notice required)
              </span>
            </label>
            <input
              type="date"
              value={vacateDate}
              onChange={(e) => onVacateDateChange(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Reason <span className="text-xs text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="e.g. Lease not being renewed, landlord requires vacant possession…"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
        </div>
      }
      variant="warning"
      confirmLabel="Record Notice"
      onConfirm={onConfirm}
      loading={loading}
    />
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
