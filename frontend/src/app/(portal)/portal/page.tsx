"use client";

import { useState, useEffect, useRef } from "react";
import {
  Home, CreditCard, FileText, Wrench, CheckCircle2, Clock,
  AlertCircle, ChevronRight, Plus, X, Loader2, Download, FileDown,
  Smartphone, Building2, Banknote, Calendar, MessageCircle,
  Send, RefreshCw, Ban, XCircle, MapPin, Copy, Navigation, Paperclip, Camera, Upload, PenLine, ClipboardList, ImageIcon, Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatCurrency, formatDate, formatDateTime } from "@/utils/formatters";
import { usePayments, useRecordPayment, useRentSchedule, useCancelPayment, useTenantWallet } from "@/hooks/usePayments";
import { useLeases, useLease, useGenerateLeaseDocument, useConfirmLeaseTerms } from "@/hooks/useLeases";
import { useMaintenanceIssues, useCreateMaintenanceIssue, useInspections } from "@/hooks/useInspections";
import { useTenantDocuments, useUploadTenantDocument, useDeleteTenantDocument } from "@/hooks/useTenants";
import { useProperty, usePropertyGeocode } from "@/hooks/useProperties";
import { usePublicSettings } from "@/hooks/useSettings";
import { useMessages, useSendMessage, useUnreadMessageCount } from "@/hooks/useMessages";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useAppStore } from "@/store/useAppStore";
import { toast } from "@/store/useUIStore";
import { useOrgPaymentSettings } from "@/hooks/useOrganisation";
import type { OrgPaymentSettings } from "@/services/api/organisations";
import { uploadsApi } from "@/services/api/uploads";
import { cn } from "@/utils/cn";
import { PaymentTimeline } from "@/components/payments/PaymentTimeline";
import { WalletBalanceCard } from "@/components/payments/WalletBalanceCard";
import { PaymentReceipt } from "@/components/payments/PaymentReceipt";
import { PAYMENT_STATE_DISPLAY } from "@/types";
import type { MaintenanceIssue, Payment, TenantDocument } from "@/types";
import type { Message } from "@/services/api/messages";

// ─── helpers ────────────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold text-foreground mb-3">{children}</h2>;
}

function toDisplayUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("/api/v1/upload/") || url.startsWith("/api/upload/local/")) return url;
  const idx = url.indexOf("inspection_photo/");
  if (idx !== -1) return `/api/v1/upload/serve/${url.slice(idx)}`;
  return url;
}

// ─── Payment method config ───────────────────────────────────────────────────

// Maps portal method IDs → backend PaymentMethod enum values
const METHOD_BACKEND_MAP: Record<string, string> = {
  mtn_momo:     "mobile_money_mtn",
  airtel_money: "mobile_money_airtel",
  bank_transfer: "bank_transfer",
  cash:         "cash",
};

interface PayMethod {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  requiresPhone: boolean;
  instructions: string;
}

const PAY_METHODS: PayMethod[] = [
  {
    id: "mtn_momo",
    label: "MTN Mobile Money",
    icon: Smartphone,
    color: "text-yellow-600",
    requiresPhone: true,
    instructions: "Dial *165# on your MTN line and follow the prompts to pay, then enter the transaction ID below.",
  },
  {
    id: "airtel_money",
    label: "Airtel Money",
    icon: Smartphone,
    color: "text-red-500",
    requiresPhone: true,
    instructions: "Dial *185# on your Airtel line and follow the prompts to pay, then enter the transaction ID below.",
  },
  {
    id: "bank_transfer",
    label: "Bank Transfer",
    icon: Building2,
    color: "text-teal-600",
    requiresPhone: false,
    instructions: "Transfer to the account below and enter the transaction/reference number.",
  },
  {
    id: "cash",
    label: "Cash",
    icon: Banknote,
    color: "text-emerald-600",
    requiresPhone: false,
    instructions: "Pay cash to your property manager and enter the receipt number below.",
  },
];

// ─── Multi-step Pay Dialog ────────────────────────────────────────────────────

// Mobile money methods trigger an STK push — no reference needed from the tenant.
const MOBILE_MONEY_IDS = new Set(["mtn_momo", "airtel_money"]);

// "pending" step: shown after STK push is sent — tenant checks their phone
type PayStep = "method" | "form" | "pending" | "confirm" | "success";

interface PayDialogProps {
  lease: { id: string; reference?: string; terms: { monthlyRent: number; currency: string } };
  balance: number;
  lateFeeApplied: number;
  userPhone?: string;
  mobileMoneyProvider?: string | null;
  mobileMoneyNumber?: string | null;
  paymentSettings?: OrgPaymentSettings;
  onClose: () => void;
}

function PayDialog({ lease, balance, lateFeeApplied, userPhone, mobileMoneyProvider, mobileMoneyNumber, paymentSettings, onClose }: PayDialogProps) {
  const [step, setStep] = useState<PayStep>("method");
  const [selectedMethod, setSelectedMethod] = useState<PayMethod | null>(null);
  const [phone, setPhone] = useState(userPhone ?? "");
  const [amount, setAmount] = useState(balance > 0 ? String(Math.round(balance)) : "");

  const [reference, setReference] = useState(lease.reference ?? "");

  // Sync amount if balance loads after mount
  useEffect(() => {
    if (balance > 0) setAmount(String(Math.round(balance)));
  }, [balance]);

  // Auto-populate phone from tenant's saved mobile money number when method is selected
  function handleMethodSelect(m: PayMethod) {
    setSelectedMethod(m);
    if (MOBILE_MONEY_IDS.has(m.id) && mobileMoneyNumber) {
      const providerMatches =
        (m.id === "mtn_momo" && mobileMoneyProvider === "mtn") ||
        (m.id === "airtel_money" && mobileMoneyProvider === "airtel");
      if (providerMatches) setPhone(mobileMoneyNumber);
    }
    setStep("form");
  }
  const [pendingMessage, setPendingMessage] = useState("");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptName, setReceiptName] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const { mutate, isPending } = useRecordPayment();

  async function handleReceiptUpload(file: File) {
    setUploadingReceipt(true);
    try {
      const result = await uploadsApi.uploadFile(file, {
        category: "payment_receipt",
        leaseId: lease.id,
      });
      setReceiptUrl(result.url);
      setReceiptName(result.name);
    } catch {
      // toast is handled by the catch — surface it to user
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploadingReceipt(false);
    }
  }


  function isMobileMoney() {
    return selectedMethod ? MOBILE_MONEY_IDS.has(selectedMethod.id) : false;
  }

  // Mobile money: POST immediately, backend sends STK push → show "check phone" step
  function handleMobileMoneySubmit() {
    if (!selectedMethod) return;
    mutate(
      {
        category: "rent",
        method: METHOD_BACKEND_MAP[selectedMethod.id] as Payment["method"],
        leaseId: lease.id,
        amount: parseFloat(amount) || balance,
        currency: lease.terms.currency,
        phone: phone.trim() || undefined,
      } as any,
      {
        onSuccess: (data: any) => {
          setPendingMessage(
            data?.message ??
            "Payment request sent! Check your phone and enter your PIN to complete the payment.",
          );
          setStep("pending");
        },
      },
    );
  }

  // Cash / bank transfer: collect reference first, then POST
  function handleCashBankSubmit() {
    if (!selectedMethod || !reference.trim()) return;
    mutate(
      {
        category: "rent",
        method: METHOD_BACKEND_MAP[selectedMethod.id] as Payment["method"],
        leaseId: lease.id,
        amount: parseFloat(amount) || balance,
        currency: lease.terms.currency,
        reference: reference.trim(),
        receiptUrl: receiptUrl ?? undefined,
      } as Omit<Payment, "id" | "createdAt" | "updatedAt">,
      { onSuccess: () => setStep("success") },
    );
  }

  // ── Terminal steps ────────────────────────────────────────────────────────────

  if (step === "pending") {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Smartphone className="h-7 w-7 text-primary" />
        </div>
        <div className="text-center space-y-1">
          <p className="font-semibold text-foreground">Check your phone!</p>
          <p className="text-sm text-muted-foreground max-w-xs">{pendingMessage}</p>
        </div>
        <div className="rounded-[6px] border border-primary/15 bg-primary/5 p-3 text-xs text-muted-foreground text-center max-w-xs">
          Once you enter your PIN, your payment will be confirmed automatically.
          You can close this dialog.
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>Done</Button>
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-foreground">Payment submitted!</p>
          <p className="text-sm text-muted-foreground mt-1">Your payment is being processed.</p>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
      </div>
    );
  }

  // ── Multi-step form ───────────────────────────────────────────────────────────

  function backStep() {
    if (step === "confirm") setStep("form");
    else setStep("method");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {step !== "method" && (
            <button
              onClick={backStep}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Back"
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
            </button>
          )}
          <h3 className="font-semibold text-foreground">
            {step === "method" && "Pay Rent"}
            {step === "form" && selectedMethod?.label}
            {step === "confirm" && "Upload Receipt"}
          </h3>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Amount pill */}
      <div className="rounded-[6px] bg-primary/5 border border-primary/15 px-4 py-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground/70">Amount due</span>
          <span className="text-lg font-bold text-foreground">{formatCurrency(balance, lease.terms.currency)}</span>
        </div>
        {lateFeeApplied > 0 && (
          <div className="flex items-center justify-between text-xs text-amber-700 dark:text-amber-400">
            <span>Includes late fee</span>
            <span>+{formatCurrency(lateFeeApplied, lease.terms.currency)}</span>
          </div>
        )}
      </div>

      {/* Step: select method */}
      {step === "method" && (
        <div className="grid grid-cols-1 gap-2">
          {PAY_METHODS.map((m) => (
            <button
              key={m.id}
              onClick={() => handleMethodSelect(m)}
              className="flex items-center gap-3 rounded-[6px] border border-border px-3 py-3 text-left hover:border-primary/40 hover:bg-primary/5 transition-all"
            >
              <m.icon className={cn("h-5 w-5", m.color)} />
              <span className="text-sm font-medium">{m.label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
            </button>
          ))}
        </div>
      )}

      {/* Step: fill details */}
      {step === "form" && selectedMethod && (
        <div className="space-y-3">
          {/* Live bank details from org payment settings */}
          {selectedMethod.id === "bank_transfer" && paymentSettings?.bankName && (
            <div className="rounded-[6px] bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800 p-3 text-xs text-teal-800 dark:text-teal-300 space-y-1">
              <p className="font-medium">Bank Details</p>
              {[
                paymentSettings.bankName,
                paymentSettings.bankAccountNumber && `Account: ${paymentSettings.bankAccountNumber}`,
                paymentSettings.bankAccountName && `Name: ${paymentSettings.bankAccountName}`,
                paymentSettings.bankBranch && `Branch: ${paymentSettings.bankBranch}`,
                paymentSettings.swiftCode && `SWIFT: ${paymentSettings.swiftCode}`,
              ].filter(Boolean).map((line, i) => (
                <p key={i}>{line}</p>
              ))}
              {paymentSettings.bankInstructions && (
                <p className="mt-1 italic">{paymentSettings.bankInstructions}</p>
              )}
            </div>
          )}

          {/* MTN paybill from org settings */}
          {selectedMethod.id === "mtn_momo" && paymentSettings?.mtnPaybill && (
            <div className="rounded-[6px] bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 p-3 text-xs text-yellow-800 dark:text-yellow-300">
              <p className="font-medium mb-0.5">MTN Paybill</p>
              <p>Dial <span className="font-mono font-semibold">{paymentSettings.mtnPaybill}</span> on your MTN line to pay directly.</p>
            </div>
          )}

          {/* Airtel paybill from org settings */}
          {selectedMethod.id === "airtel_money" && paymentSettings?.airtelPaybill && (
            <div className="rounded-[6px] bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3 text-xs text-red-800 dark:text-red-300">
              <p className="font-medium mb-0.5">Airtel Paybill</p>
              <p>Dial <span className="font-mono font-semibold">{paymentSettings.airtelPaybill}</span> on your Airtel line to pay directly.</p>
            </div>
          )}

          {/* Reference shown here for bank/cash so tenant can use it as narration */}
          {!isMobileMoney() && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Payment Reference
              </Label>
              <Input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. LSE-ABC123"
              />
              <p className="text-xs text-muted-foreground">
                Use this reference as your bank narration so your payment is matched automatically.
              </p>
            </div>
          )}

          {selectedMethod.requiresPhone && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Mobile Money Number
              </Label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 256775000000"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount (UGX)</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={balance}
              className={cn(parseFloat(amount) < balance && amount !== "" && "border-destructive focus-visible:ring-destructive")}
            />
            {parseFloat(amount) < balance && amount !== "" && (
              <p className="text-xs text-destructive">
                Amount cannot be less than {formatCurrency(balance, lease.terms.currency)} due.
              </p>
            )}
          </div>

          {isMobileMoney() ? (
            <Button
              className="w-full"
              onClick={handleMobileMoneySubmit}
              disabled={!phone.trim() || isPending || parseFloat(amount) < balance}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
              {isPending ? "Sending request…" : "Send Payment Request"}
            </Button>
          ) : (
            <Button
              className="w-full"
              onClick={() => setStep("confirm")}
              disabled={!reference.trim() || parseFloat(amount) < balance}
            >
              <CreditCard className="h-4 w-4" />
              I&apos;ve Made Payment
            </Button>
          )}
        </div>
      )}

      {/* Step: upload receipt (cash / bank only) */}
      {step === "confirm" && selectedMethod && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Take a photo of your receipt or upload a PDF / image as proof of payment.
          </p>

          {receiptUrl ? (
            <div className="flex items-center gap-2 rounded-[6px] border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              <Paperclip className="h-4 w-4 shrink-0" />
              <span className="truncate flex-1">{receiptName}</span>
              <button
                onClick={() => { setReceiptUrl(null); setReceiptName(null); }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : uploadingReceipt ? (
            <div className="flex flex-col items-center gap-2 rounded-[6px] border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Uploading…</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {/* Camera — opens directly to camera on mobile */}
              <label className="flex flex-col items-center gap-2 rounded-[6px] border border-dashed border-border px-3 py-6 cursor-pointer text-center text-sm text-muted-foreground hover:border-primary/40 hover:bg-primary/5 transition-all">
                <Camera className="h-6 w-6" />
                <span className="font-medium text-xs">Take Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReceiptUpload(f); }}
                />
              </label>
              {/* File picker — gallery, files, or PDF */}
              <label className="flex flex-col items-center gap-2 rounded-[6px] border border-dashed border-border px-3 py-6 cursor-pointer text-center text-sm text-muted-foreground hover:border-primary/40 hover:bg-primary/5 transition-all">
                <Upload className="h-6 w-6" />
                <span className="font-medium text-xs">Upload File</span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="sr-only"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReceiptUpload(f); }}
                />
              </label>
            </div>
          )}

          <Button
            className="w-full"
            disabled={isPending || uploadingReceipt}
            onClick={handleCashBankSubmit}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            {isPending ? "Submitting…" : "Submit Payment"}
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Receipt is optional but helps resolve disputes faster.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Tenant Payment Detail Sheet ─────────────────────────────────────────────
// States in which a tenant can still cancel (mirrors backend CANCELLABLE_BY_TENANT)
const TENANT_CANCELLABLE = new Set<Payment["state"]>([
  "initiated", "predicted", "routed", "pending", "retry_scheduled",
]);

function TenantPaymentDetailSheet({
  payment,
  leaseId,
  onClose,
}: {
  payment: Payment;
  leaseId: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"detail" | "confirm">("detail");
  const [cancelReason, setCancelReason] = useState("");
  const { mutate: cancelPayment, isPending: isCancelling } = useCancelPayment();

  const stateDisplay = PAYMENT_STATE_DISPLAY[payment.state] ?? {
    label: payment.state,
    color: "text-gray-600",
    bgColor: "bg-gray-100",
  };

  const canCancel = TENANT_CANCELLABLE.has(payment.state);
  const isRejected  = payment.state === "rejected";
  const isCancelled = payment.state === "cancelled";

  function handleCancelSubmit() {
    cancelPayment(
      { leaseId, paymentId: payment.id, reason: cancelReason.trim() || undefined },
      {
        onSuccess: () => {
          setStep("detail");
          setCancelReason("");
          onClose();
        },
      },
    );
  }

  // ── Cancel confirmation step ───────────────────────────────────────────────
  if (step === "confirm") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Cancel Payment</h3>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setStep("detail")}
            aria-label="Back to details"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Warning */}
        <div className="rounded-[6px] bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
          <p className="font-semibold mb-1">Are you sure you want to cancel?</p>
          <p>
            This will permanently cancel your{" "}
            <strong>{formatCurrency(payment.amount, payment.currency)}</strong>{" "}
            payment. This action cannot be undone.
          </p>
        </div>

        {/* Optional reason */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Reason <span className="normal-case font-normal">(optional)</span>
          </Label>
          <Textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="e.g. Paid in cash instead, duplicate payment…"
            rows={3}
            className="resize-none text-sm"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setStep("detail")}
            disabled={isCancelling}
          >
            Keep Payment
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            onClick={handleCancelSubmit}
            disabled={isCancelling}
          >
            {isCancelling
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <XCircle className="h-4 w-4" />
            }
            {isCancelling ? "Cancelling…" : "Cancel Payment"}
          </Button>
        </div>
      </div>
    );
  }

  // ── Detail step ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Payment Details</h3>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Status badge — prominent pill */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-[8px] px-3 py-2.5",
          stateDisplay.bgColor,
        )}
      >
        <span className={cn("h-2 w-2 rounded-full shrink-0 opacity-80", stateDisplay.bgColor.replace("-100", "-500"))} />
        <span className={cn("text-sm font-semibold capitalize", stateDisplay.color)}>
          {stateDisplay.label}
        </span>
        <span className="text-xs text-muted-foreground ml-auto font-mono tabular-nums">
          {formatCurrency(payment.amount, payment.currency)}
        </span>
      </div>

      {/* Rejection notice */}
      {isRejected && (
        <div className="rounded-[6px] bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3 space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400">
            <Ban className="h-3.5 w-3.5 shrink-0" />
            This payment was rejected by your property manager
          </p>
          {payment.rejectedAt && (
            <p className="text-xs text-red-600/80 dark:text-red-400/80">
              {formatDate(payment.rejectedAt)}
            </p>
          )}
          {payment.rejectionReason && (
            <p className="text-xs text-red-700 dark:text-red-300 italic">
              &ldquo;{payment.rejectionReason}&rdquo;
            </p>
          )}
          <p className="text-xs text-red-600/70 dark:text-red-400/70 pt-1">
            Please contact your property manager or make a new payment.
          </p>
        </div>
      )}

      {/* Cancellation notice */}
      {isCancelled && (
        <div className="rounded-[6px] bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-700 p-3 space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400">
            <XCircle className="h-3.5 w-3.5 shrink-0" />
            You cancelled this payment
          </p>
          {payment.cancelledAt && (
            <p className="text-xs text-gray-500">{formatDate(payment.cancelledAt)}</p>
          )}
          {payment.cancellationReason && (
            <p className="text-xs text-gray-600 dark:text-gray-300 italic">
              &ldquo;{payment.cancellationReason}&rdquo;
            </p>
          )}
        </div>
      )}

      {/* Details table */}
      <dl className="divide-y divide-border">
        {(
          [
            ["Reference", payment.reference ?? "—"],
            ["Category",  payment.category.replace(/_/g, " ")],
            ["Method",    payment.method ? payment.method.replace(/_/g, " ") : "—"],
            ["Amount",    formatCurrency(payment.amount, payment.currency)],
            ["Date",      payment.paidAt ? formatDate(payment.paidAt) : "—"],
            ["Created",   formatDate(payment.createdAt)],
            ...(payment.notes ? [["Notes", payment.notes]] : []),
          ] as [string, string][]
        ).map(([label, value]) => (
          <div key={label} className="flex justify-between py-2 text-sm">
            <dt className="text-muted-foreground shrink-0">{label}</dt>
            <dd className="font-medium text-foreground max-w-[55%] text-right break-all capitalize">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Cancel CTA — only for pre-reconciliation states */}
      {canCancel && (
        <Button
          variant="outline"
          className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
          onClick={() => setStep("confirm")}
        >
          <XCircle className="h-4 w-4" />
          Cancel Payment
        </Button>
      )}
    </div>
  );
}

// ─── Maintenance Request Dialog ──────────────────────────────────────────────

const MAINTENANCE_CATEGORIES = [
  "plumbing", "electrical", "hvac", "structural", "appliance", "pest_control", "cleaning", "security", "other",
];
const PRIORITIES = ["low", "medium", "high", "urgent"] as const;

interface MaintenanceDialogProps {
  userId: string;
  userName: string;
  leaseId: string;
  propertyId: string;
  unitId: string;
  onClose: () => void;
}

function MaintenanceDialog({ userId, userName, leaseId, propertyId, unitId, onClose }: MaintenanceDialogProps) {
  const [category, setCategory] = useState("plumbing");
  const [priority, setPriority] = useState<typeof PRIORITIES[number]>("medium");
  const [description, setDescription] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const { mutate, isPending, isSuccess } = useCreateMaintenanceIssue();

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = "";
    setUploading(true);
    try {
      const results = await Promise.all(
        files.map((f) => uploadsApi.uploadMaintenancePhoto(f)),
      );
      setPhotoUrls((prev) => [...prev, ...results.map((r) => r.url)]);
    } catch {
      toast.error("Failed to upload photos");
    } finally {
      setUploading(false);
    }
  }

  function handleSubmit() {
    if (!description.trim()) return;
    mutate({
      category,
      priority,
      description,
      photoUrls,
      reportedBy: userName || "Tenant",
      reportedById: userId,
      leaseId,
      propertyId,
      unitId,
      title: `${category.replace(/_/g, " ")} issue`,
    } as any);
  }

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-foreground">Request submitted!</p>
          <p className="text-sm text-muted-foreground mt-1">Your landlord has been notified.</p>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">New Maintenance Request</h3>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {MAINTENANCE_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Priority</p>
        <div className="grid grid-cols-4 gap-2">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={cn(
                "rounded-[5px] border py-1.5 text-xs font-medium capitalize transition-all",
                priority === p
                  ? "border-emerald-600 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-semibold ring-1 ring-emerald-600/50"
                  : "border-border text-foreground hover:border-primary/60",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the issue in detail…"
          rows={4}
          className="resize-none"
        />
      </div>

      {/* Photo upload */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Photos <span className="normal-case font-normal">(optional)</span></p>
        <div className="flex items-center gap-2">
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleFiles} disabled={uploading} />
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-[5px] border border-input bg-background px-3 py-2 text-xs font-medium shadow-sm hover:bg-accent transition-colors disabled:opacity-50 flex-1"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            Take Photo
          </button>
          <input ref={galleryRef} type="file" accept="image/*" multiple className="sr-only" onChange={handleFiles} disabled={uploading} />
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-[5px] border border-input bg-background px-3 py-2 text-xs font-medium shadow-sm hover:bg-accent transition-colors disabled:opacity-50 flex-1"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            Choose from Gallery
          </button>
        </div>
        {photoUrls.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {photoUrls.map((url) => (
              <div key={url} className="group relative aspect-square rounded-[6px] overflow-hidden bg-muted border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={toDisplayUrl(url)} alt="Issue photo" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotoUrls((prev) => prev.filter((u) => u !== url))}
                  className="absolute top-1 right-1 hidden group-hover:flex items-center justify-center h-5 w-5 rounded-full bg-black/60 text-white hover:bg-destructive transition-colors"
                  aria-label="Remove photo"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Button className="w-full" disabled={!description.trim() || isPending || uploading} onClick={handleSubmit}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
        {isPending ? "Submitting…" : "Submit Request"}
      </Button>
    </div>
  );
}

// ─── Portal sheet wrapper (Radix Dialog — focus trap, Escape, aria-modal) ────

function PortalSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 outline-none sm:inset-0 sm:flex sm:items-center sm:justify-center"
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <div className="relative w-full sm:max-w-lg sm:mx-auto bg-[hsl(var(--card))] rounded-t-[8px] sm:rounded-[8px] border border-border shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ─── Messages Tab ─────────────────────────────────────────────────────────────

function formatMsgTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
function formatMsgDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function getInitialsFromName(name: string) {
  return name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
}

function MessagesTab({ leaseId, userId, userSub }: { leaseId: string; userId: string; userSub?: string }) {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const { data, isLoading, refetch, isFetching } = useMessages(leaseId);
  const { mutate: send, isPending: sending } = useSendMessage(leaseId);
  const messages = data?.data ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function handleSend() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    send(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Group messages by date for separators
  const grouped: { date: string; msgs: Message[] }[] = [];
  for (const msg of messages) {
    const label = formatMsgDate(msg.createdAt);
    const last = grouped[grouped.length - 1];
    if (!last || last.date !== label) grouped.push({ date: label, msgs: [msg] });
    else last.msgs.push(msg);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionHeading>Messages</SectionHeading>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Refresh messages"
        >
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
        </button>
      </div>

      <div className="rounded-[8px] overflow-hidden border border-border shadow-sm flex flex-col" style={{ minHeight: 420 }}>
        {/* Chat body */}
        <div
          className="flex-1 overflow-y-auto px-3 py-4 space-y-1"
          style={{
            background: "linear-gradient(135deg, hsl(var(--accent)/0.3) 0%, hsl(var(--background)) 100%)",
            maxHeight: 420,
          }}
        >
          {isLoading ? (
            <div className="flex items-center justify-center h-full py-16 gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading messages…
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 gap-2">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                <MessageCircle className="h-7 w-7 text-primary/50" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No messages yet</p>
              <p className="text-xs text-muted-foreground/60">Send a message to your property manager</p>
            </div>
          ) : (
            grouped.map(({ date, msgs }) => (
              <div key={date}>
                {/* Date separator */}
                <div className="flex items-center gap-2 my-3">
                  <div className="flex-1 h-px bg-border/60" />
                  <span className="text-[10px] font-medium text-muted-foreground bg-background/80 px-2 py-0.5 rounded-full border border-border/50">
                    {date}
                  </span>
                  <div className="flex-1 h-px bg-border/60" />
                </div>
                <div className="space-y-1">
                  {msgs.map((msg) => {
                    const isSystem = msg.senderRole === "system";
                    const isMe = !isSystem && (msg.senderId === userId || (!!userSub && msg.senderId === userSub));

                    // System messages render as centred status pills
                    if (isSystem) {
                      return (
                        <div key={msg.id} className="flex justify-center my-2">
                          <div className="max-w-[85%] rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-300 text-center whitespace-pre-line">
                            {msg.content}
                            <p className="text-[10px] text-amber-600/70 dark:text-amber-400/60 mt-1">
                              {formatMsgTime(msg.createdAt)}
                            </p>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={msg.id} className={cn("flex gap-2 items-end", isMe ? "flex-row-reverse" : "flex-row")}>
                        {/* Avatar for others */}
                        {!isMe && (
                          <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0 text-[10px] font-bold text-primary mb-0.5">
                            {getInitialsFromName(msg.senderName)}
                          </div>
                        )}
                        <div className={cn("flex flex-col gap-0.5 max-w-[75%]", isMe ? "items-end" : "items-start")}>
                          {!isMe && (
                            <span className="text-[10px] font-semibold text-primary pl-1 capitalize">
                              {msg.senderName} · {msg.senderRole}
                            </span>
                          )}
                          <div
                            className={cn(
                              "px-3.5 py-2 text-sm leading-relaxed shadow-sm",
                              isMe
                                ? "bg-teal-700 text-white rounded-[8px] rounded-br-[4px]"
                                : "bg-card text-foreground rounded-[8px] rounded-bl-[4px] border border-border/50",
                            )}
                          >
                            {msg.content}
                          </div>
                          <span className="text-[10px] text-muted-foreground px-1">
                            {formatMsgTime(msg.createdAt)}
                            {isMe && <span className="ml-1 text-teal-600">✓</span>}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Compose bar */}
        <div className="flex gap-2 items-end px-3 py-3 border-t border-border bg-card">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            rows={1}
            className="resize-none flex-1 text-sm rounded-[8px] min-h-[40px] max-h-[120px] py-2.5 px-4 border-border/60 bg-background focus-visible:ring-1"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!draft.trim() || sending}
            className="shrink-0 h-10 w-10 rounded-full"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Inspections Tab ──────────────────────────────────────────────────────────

function InspectionsTab({ leaseId, unitId, propertyId }: { leaseId: string; unitId: string; propertyId: string }) {
  const { data, isLoading } = useInspections({ leaseId, unitId: unitId || undefined } as any);
  const inspections = (data?.data ?? []) as any[];

  const INSP_TYPE_LABELS: Record<string, string> = {
    move_in: "Move-In",
    move_out: "Move-Out",
    routine: "Routine",
    emergency: "Emergency",
    maintenance: "Maintenance",
    complaint: "Complaint",
  };

  return (
    <div className="space-y-3">
      <SectionHeading>Upcoming Inspections</SectionHeading>
      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading inspections…
            </div>
          ) : inspections.length === 0 ? (
            <div className="text-center py-10">
              <Calendar className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No upcoming inspections.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {inspections.map((insp: any) => {
                const fullySigned = !!insp.landlordSignedAt && !!insp.tenantSignedAt;
                const awaitingTenant = !!insp.landlordSignedAt && !insp.tenantSignedAt && !!insp.signToken;
                return (
                  <div key={insp.id} className="py-3 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {INSP_TYPE_LABELS[insp.type] ?? insp.type}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {insp.scheduledDate ? formatDate(insp.scheduledDate) : "—"}
                          {insp.scheduledTimeSlot && (
                            <span className="ml-1 font-medium">{insp.scheduledTimeSlot}</span>
                          )}
                        </div>
                        {insp.inspectorName && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Inspector: {insp.inspectorName}
                          </p>
                        )}
                      </div>
                      <StatusBadge state={insp.state} domain="inspection" />
                    </div>

                    {/* Signature status + report actions */}
                    {(insp.landlordSignedAt || insp.tenantSignedAt || insp.reportPdfUrl) && (
                      <div className="flex flex-wrap items-center gap-2">
                        {insp.landlordSignedAt && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[11px] font-medium">
                            <CheckCircle2 className="h-3 w-3" />
                            Landlord signed
                          </span>
                        )}
                        {insp.tenantSignedAt ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[11px] font-medium">
                            <CheckCircle2 className="h-3 w-3" />
                            You signed
                          </span>
                        ) : insp.landlordSignedAt ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[11px] font-medium">
                            Your signature needed
                          </span>
                        ) : null}

                        {/* Download sealed report */}
                        {fullySigned && insp.reportPdfUrl && (
                          <a
                            href={`/api/v1/inspections/${insp.id}/report/download-public`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] font-medium hover:bg-accent transition-colors"
                          >
                            <FileDown className="h-3 w-3" />
                            Download Report
                          </a>
                        )}

                        {/* Sign now link */}
                        {awaitingTenant && (
                          <a
                            href={`/inspect/sign/${insp.signToken}`}
                            className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-2 py-0.5 text-[11px] font-medium hover:bg-primary/90 transition-colors"
                          >
                            Sign now →
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="rounded-[6px] border border-primary/15 bg-primary/5 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground mb-1">Not available for an inspection?</p>
        Send a message to your property manager via the Messages tab to reschedule.
      </div>
    </div>
  );
}

// ─── How to Find Us ───────────────────────────────────────────────────────────

function HowToFindUsCard({ geocode, address, whatsappNumber, navUrl, landmarkDescription, accessInstructions, deliveryNotes }: {
  geocode?: string;
  address: { line1: string; line2?: string; city: string; state: string; country: string; lat?: number; lng?: number };
  whatsappNumber?: string;
  navUrl?: string;
  landmarkDescription?: string;
  accessInstructions?: string;
  deliveryNotes?: string;
}) {
  const [copied, setCopied] = useState(false);

  const addrLine = [address.line1, address.line2].filter(Boolean).join(", ");
  const cityLine = [address.city, address.state, address.country].filter(Boolean).join(", ");

  const mapsUrl = address.lat && address.lng
    ? `https://www.google.com/maps?q=${address.lat},${address.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${addrLine}, ${cityLine}`)}`;

  const botNumber = whatsappNumber?.replace(/\D/g, "") ?? "";
  const waUrl = geocode && botNumber
    ? `https://wa.me/${botNumber}?text=${encodeURIComponent(`Find ${geocode}`)}`
    : null;

  function handleCopy() {
    if (!geocode) return;
    navigator.clipboard.writeText(geocode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          How to Find Us
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Address + Maps link */}
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm space-y-0.5">
            {addrLine && <p className="font-medium">{addrLine}</p>}
            {cityLine && <p className="text-muted-foreground">{cityLine}</p>}
          </div>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Navigation className="h-3 w-3" />
            Google Maps
          </a>
        </div>

        {/* GeoBox directions panel — only when geocode + bot number are set */}
        {waUrl && geocode && (
          <div className="rounded-[8px] border border-emerald-200 bg-emerald-50/60 p-3.5 space-y-3 dark:border-emerald-800 dark:bg-emerald-950/20">
            {/* Header */}
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                Get directions via GeoBox
              </p>
            </div>
            <p className="text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">
              This is your property&apos;s unique GeoBox address code. Share it with visitors, delivery drivers, or anyone coming to your home — they can tap <strong>Send to GeoBox on WhatsApp</strong> below to get turn-by-turn directions straight to your door.
            </p>

            {/* Geocode chip + copy */}
            <div className="flex items-center gap-2">
              <code className="rounded-[5px] bg-white dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-700 px-3 py-1 text-sm font-mono font-bold text-emerald-700 dark:text-emerald-300 tracking-widest shadow-sm">
                {geocode}
              </code>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-200 transition-colors"
                title="Copy geocode"
              >
                {copied
                  ? <><CheckCircle2 className="h-3.5 w-3.5" /> Copied</>
                  : <><Copy className="h-3.5 w-3.5" /> Copy</>}
              </button>
            </div>

            {/* Resolved address details from GeoBox */}
            {landmarkDescription && (
              <p className="text-xs text-emerald-800 dark:text-emerald-200 leading-relaxed">
                📍 {landmarkDescription}
              </p>
            )}
            {accessInstructions && (
              <p className="text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed">
                <span className="font-medium">Access:</span> {accessInstructions}
              </p>
            )}
            {deliveryNotes && (
              <p className="text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed">
                <span className="font-medium">Delivery notes:</span> {deliveryNotes}
              </p>
            )}

            {/* Open Navigation — primary CTA when nav_url is available */}
            {navUrl && (
              <a
                href={navUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-[7px] bg-emerald-700 dark:bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 dark:hover:bg-emerald-500 active:scale-[0.98] transition-all"
              >
                <Navigation className="h-4 w-4" />
                Open Navigation
              </a>
            )}

            {/* WhatsApp — share code with the GeoBox bot */}
            <a
              href={waUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-[7px] bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#1ebe5d] active:scale-[0.98] transition-all"
            >
              <MessageCircle className="h-4 w-4" />
              Send to GeoBox on WhatsApp
            </a>
          </div>
        )}

        {/* Geocode-only panel: shown when geocode exists but no bot number is configured */}
        {geocode && !waUrl && (
          <div className="rounded-[8px] border border-primary/20 bg-primary/5 p-3.5 space-y-3 dark:border-primary/15 dark:bg-primary/5">
            {/* Header */}
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary shrink-0" />
              <p className="text-sm font-semibold text-foreground">Your GeoBox Address Code</p>
            </div>

            {/* Geocode chip + copy */}
            <div className="flex items-center gap-2">
              <code className="rounded-[5px] bg-white dark:bg-background border border-primary/20 px-3 py-1 text-sm font-mono font-bold text-primary tracking-widest shadow-sm">
                {geocode}
              </code>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors"
                title="Copy geocode"
              >
                {copied
                  ? <><CheckCircle2 className="h-3.5 w-3.5" /> Copied</>
                  : <><Copy className="h-3.5 w-3.5" /> Copy</>}
              </button>
            </div>

            {/* Resolved address details */}
            {landmarkDescription && (
              <p className="text-xs text-muted-foreground leading-relaxed">📍 {landmarkDescription}</p>
            )}
            {accessInstructions && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="font-medium text-foreground">Access:</span> {accessInstructions}
              </p>
            )}
            {deliveryNotes && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="font-medium text-foreground">Delivery notes:</span> {deliveryNotes}
              </p>
            )}

            {!landmarkDescription && !accessInstructions && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                This short code uniquely identifies your home. Share it with delivery drivers,
                taxis, or anyone who needs to find you.
              </p>
            )}

            {/* Open Navigation */}
            {navUrl && (
              <a
                href={navUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-[7px] bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.98] transition-all"
              >
                <Navigation className="h-4 w-4" />
                Open Navigation
              </a>
            )}

            {/* Generic WhatsApp share */}
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`My GeoBox address code is *${geocode}*. Send "Find ${geocode}" on WhatsApp to get directions to my home.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-[7px] bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#1ebe5d] active:scale-[0.98] transition-all"
            >
              <MessageCircle className="h-4 w-4" />
              Share my address code via WhatsApp
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Documents Tab ───────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<string, string> = {
  passport: "Passport",
  national_id: "National ID",
  driving_licence: "Driving Licence",
  proof_of_income: "Proof of Income",
  reference_letter: "Reference Letter",
  bank_statement: "Bank Statement",
  other: "Other",
};
const DOC_TYPES = Object.keys(DOC_TYPE_LABELS) as TenantDocument["type"][];

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentsTab({ tenantId }: { tenantId: string }) {
  const [selectedType, setSelectedType] = useState<TenantDocument["type"]>("passport");
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: docs, isLoading } = useTenantDocuments(tenantId);
  const { mutate: registerDoc } = useUploadTenantDocument();
  const { mutate: deleteDoc } = useDeleteTenantDocument();

  async function handleFileSelect(file: File) {
    setIsUploading(true);
    try {
      const result = await uploadsApi.presignAndUpload(file, { category: "tenant_document" });
      registerDoc({
        tenantId,
        data: {
          type: selectedType,
          name: file.name,
          url: result.url,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        },
      });
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeading>My Documents</SectionHeading>

      {/* Upload card */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <p className="text-sm font-medium text-foreground">Upload a Document</p>
          <div className="flex gap-2">
            <Select
              value={selectedType}
              onValueChange={(v) => setSelectedType(v as TenantDocument["type"])}
            >
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {DOC_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <label
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium cursor-pointer select-none",
                "hover:bg-primary/5 hover:border-primary/40 transition-all",
                isUploading && "pointer-events-none opacity-50",
              )}
            >
              {isUploading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Upload className="h-4 w-4" />}
              {isUploading ? "Uploading…" : "Choose File"}
              <input
                type="file"
                className="sr-only"
                disabled={isUploading}
                accept="image/*,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">Accepted: PDF, JPG, PNG · Max 10 MB</p>
        </CardContent>
      </Card>

      {/* Document list */}
      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading documents…
            </div>
          ) : !docs || docs.length === 0 ? (
            <div className="text-center py-10">
              <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Upload your ID or supporting documents above.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {docs.map((doc) => (
                <div key={doc.id} className="py-3 flex items-start gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">
                        {DOC_TYPE_LABELS[doc.type] ?? doc.type}
                      </span>
                      {doc.verified ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-medium">
                          <CheckCircle2 className="h-3 w-3" />
                          Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[11px] font-medium">
                          <Clock className="h-3 w-3" />
                          Pending review
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{doc.name}</p>
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                      {formatBytes(doc.sizeBytes)} · {formatDate(doc.uploadedAt)}
                    </p>
                  </div>
                  {/* Only allow deletion of unverified docs */}
                  {!doc.verified && (
                    deletingId === doc.id ? (
                      <div className="flex gap-1 shrink-0 items-center">
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 px-2 text-xs"
                          onClick={() => { deleteDoc({ tenantId, documentId: doc.id }); setDeletingId(null); }}
                        >
                          Delete
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => setDeletingId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeletingId(doc.id)}
                        aria-label={`Delete ${DOC_TYPE_LABELS[doc.type] ?? doc.type}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="rounded-[6px] border border-primary/15 bg-primary/5 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground mb-1">Document security</p>
        Your documents are stored securely and are only visible to you and your property manager.
        Verified documents cannot be deleted.
      </div>
    </div>
  );
}

// ─── Mobile bottom navigation ─────────────────────────────────────────────────

interface PortalBottomNavProps {
  tab: string;
  setTab: (t: string) => void;
  hasOverdueRent: boolean;
  openRequestsCount: number;
  unreadMessages: number;
}

function PortalBottomNav({ tab, setTab, hasOverdueRent, openRequestsCount, unreadMessages }: PortalBottomNavProps) {
  type Badge = null | number | "dot";
  const navItems: { value: string; label: string; icon: React.ElementType; badge: Badge }[] = [
    { value: "overview",    label: "Home",     icon: Home,          badge: null },
    { value: "payments",    label: "Pay",      icon: CreditCard,    badge: hasOverdueRent ? "dot" : null },
    { value: "maintenance", label: "Issues",   icon: Wrench,        badge: openRequestsCount > 0 ? openRequestsCount : null },
    { value: "messages",    label: "Messages", icon: MessageCircle, badge: unreadMessages > 0 ? unreadMessages : null },
    { value: "documents",   label: "Docs",     icon: FileText,      badge: null },
  ];

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 sm:hidden border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      aria-label="Portal navigation"
    >
      <div className="flex h-16 items-stretch">
        {navItems.map(({ value, label, icon: Icon, badge }) => {
          const isActive = tab === value;
          return (
            <button
              key={value}
              onClick={() => setTab(value)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors",
                isActive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {isActive && (
                <span aria-hidden="true" className="absolute top-0 inset-x-3 h-0.5 bg-emerald-500 rounded-b-sm" />
              )}
              <div className="relative">
                <Icon className="h-5 w-5" />
                {badge === "dot" && (
                  <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-destructive" />
                )}
                {typeof badge === "number" && (
                  <span aria-hidden="true" className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-0.5 text-[9px] font-bold text-white">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ─── Maintenance detail sheet ─────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
  high:   "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800",
  medium: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  low:    "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800",
};

function MaintenanceDetailSheet({ issue, onClose }: { issue: MaintenanceIssue; onClose: () => void }) {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-2 border-b border-border pb-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold leading-snug">{issue.title}</h2>
          <StatusBadge state={issue.state} domain="maintenance" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {issue.reference && (
            <span className="chip chip-ref">{issue.reference}</span>
          )}
          {issue.priority && (
            <span className={cn("text-[10px] rounded-full px-1.5 py-0.5 font-medium capitalize border", PRIORITY_COLORS[issue.priority])}>
              {issue.priority}
            </span>
          )}
          {issue.category && (
            <span className="chip capitalize">{issue.category.replace(/_/g, " ")}</span>
          )}
        </div>
      </div>

      {/* Details grid */}
      <div className="space-y-3 text-sm">
        {(issue.propertyName || issue.unitName) && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Location</span>
            <span className="font-medium text-right">
              {[issue.unitName, issue.propertyName].filter(Boolean).join(", ")}
            </span>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Reported</span>
          <span className="font-medium">{formatDateTime(issue.reportedAt || issue.createdAt)}</span>
        </div>
        {issue.assignedTo && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Assigned to</span>
            <span className="font-medium">{issue.assignedTo}</span>
          </div>
        )}
        {issue.assignedAt && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Assigned at</span>
            <span className="font-medium">{formatDateTime(issue.assignedAt)}</span>
          </div>
        )}
        {issue.resolvedAt && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Resolved</span>
            <span className="font-medium">{formatDateTime(issue.resolvedAt)}</span>
          </div>
        )}
      </div>

      {/* Description */}
      {issue.description && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</p>
          <p className="text-sm leading-relaxed whitespace-pre-line">{issue.description}</p>
        </div>
      )}

      {/* Resolution notes */}
      {issue.notes && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Resolution notes</p>
          <p className="text-sm leading-relaxed whitespace-pre-line">{issue.notes}</p>
        </div>
      )}

      {/* Photos */}
      {(issue.photoUrls ?? []).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Photos</p>
          <div className="grid grid-cols-3 gap-2">
            {(issue.photoUrls ?? []).map((url) => (
              <a key={url} href={toDisplayUrl(url)} target="_blank" rel="noopener noreferrer"
                 className="block aspect-square rounded-[6px] overflow-hidden border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={toDisplayUrl(url)} alt="Issue photo" className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onClose}
        className="w-full mt-2 rounded-[6px] border border-border py-2 text-sm font-medium hover:bg-muted transition-colors"
      >
        Close
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Dialog = "pay" | "maintenance" | null;

export default function TenantPortalPage() {
  const [tab, setTab] = useState("overview");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [receiptPayment, setReceiptPayment] = useState<Payment | null>(null);
  const [selectedMaintenance, setSelectedMaintenance] = useState<MaintenanceIssue | null>(null);

  const user = useAppStore((s) => s.user);
  const userId = user?.id ?? "";

  const { data: leasesData, isLoading: leasesLoading } = useLeases();
  const { data: paymentsData, isLoading: paymentsLoading } = usePayments();
  const { data: maintenanceData } = useMaintenanceIssues();

  const allLeases = leasesData?.data ?? [];
  const allPayments = paymentsData?.data ?? [];
  const allMaintenance = (maintenanceData?.data ?? []) as MaintenanceIssue[];

  // Find tenant's lease from list (for IDs), then fetch detail (for signatures)
  const leaseStub = allLeases.find((l) => l.tenantId === userId) ?? allLeases[0];
  const { data: myLease } = useLease(leaseStub?.id ?? "");
  const { data: inspectionsData } = useInspections(
    myLease?.id
      ? { leaseId: myLease.id, unitId: myLease.unitId || undefined } as any
      : undefined,
  );

  const { data: schedulesData } = useRentSchedule(myLease?.id ?? "");
  const { data: walletData } = useTenantWallet(userId ?? "");
  const walletBalance = walletData?.balance ?? 0;
  const { data: propertyData } = useProperty(myLease?.propertyId ?? "");
  const { data: geocodeData } = usePropertyGeocode(
    myLease?.propertyId ?? "",
    !!myLease?.propertyId && !!propertyData?.geocode,
  );
  const { data: publicSettings } = usePublicSettings();
  const { data: paymentSettings } = useOrgPaymentSettings();
  const { data: unreadData } = useUnreadMessageCount();
  const unreadMessages = unreadData?.count ?? 0;
  const { mutate: generateDoc, isPending: generatingDoc } = useGenerateLeaseDocument();
  const { mutate: confirmTerms, isPending: confirmingTerms } = useConfirmLeaseTerms();
  const [termsChecked, setTermsChecked] = useState(false);

  // Imported leases: tenant must confirm terms once on first portal login
  const needsTermsConfirmation =
    myLease?.status === "active" &&
    !myLease?.termsAcceptedAt &&
    !myLease?.paperAgreementAcknowledged;

  const myPayments = allPayments.filter((p) => !myLease || p.leaseId === myLease.id);
  const schedules = schedulesData?.data ?? [];
  const overdueSchedule = schedules.find((s) => s.status === "overdue" || s.state === "overdue") ?? null;
  const hasOverdueRent = overdueSchedule !== null;
  const overdueBalance = overdueSchedule?.balance ?? 0;
  const overdueLateFee = overdueSchedule?.lateFeeApplied ?? 0;
  const myMaintenance = allMaintenance.filter((m) => m.reportedById === userId);
  const openRequests = myMaintenance.filter((m) => !["resolved", "closed"].includes(m.state));
  const pendingSignTasks = (inspectionsData?.data ?? []).filter(
    (i: any) => i.landlordSignedAt && !i.tenantSignedAt && i.signToken,
  );

  // Show an end-of-tenancy task card when lease is expiring within 60 days or already expired/terminated
  // and no active move-out inspection has been created yet.
  const hasMoveOutInspection = (inspectionsData?.data ?? []).some(
    (i: any) => i.type === "move_out" && !["cancelled", "failed"].includes(i.state),
  );
  const showMoveOutTask = !hasMoveOutInspection && myLease && (() => {
    if (["expired", "terminated"].includes(myLease.state)) return true;
    if (!myLease.terms?.endDate) return false;
    const daysToEnd = Math.ceil(
      (new Date(myLease.terms.endDate).getTime() - Date.now()) / 86_400_000,
    );
    return daysToEnd >= 0 && daysToEnd <= 60;
  })();

  const nextPaymentDate = myLease?.terms
    ? (() => {
        const startDate = new Date(myLease.terms.startDate + "T00:00:00");
        // How many months of advance rent the tenant already paid.
        // Falls back to 1 if the lease record doesn't store advance_months.
        const advanceMonths = myLease.advanceMonths ?? 1;
        // Day of month rent is due (from lease terms).
        const dueDay = myLease.terms.paymentDueDay ?? 1;

        // First real payment = the rent due day of the month AFTER the advance period.
        // e.g. start=1 Jun 2026, advance=3 → first payment = 1 Sep 2026.
        const firstPayment = new Date(
          startDate.getFullYear(),
          startDate.getMonth() + advanceMonths,
          dueDay,
        );

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let nextDue: Date;
        if (today <= firstPayment) {
          // Still within or at the boundary of the advance period
          nextDue = firstPayment;
        } else {
          // Past the advance period — find the next upcoming due day
          const thisMonthDue = new Date(today.getFullYear(), today.getMonth(), dueDay);
          nextDue = thisMonthDue >= today
            ? thisMonthDue
            : new Date(today.getFullYear(), today.getMonth() + 1, dueDay);
        }

        return nextDue.toLocaleDateString("en-UG", { month: "long", day: "numeric", year: "numeric" });
      })()
    : "—";

  const tenantSig = myLease?.signatures?.find((s: any) => s.party === "tenant");
  const landlordSig = myLease?.signatures?.find((s: any) => s.party === "landlord");

  function handleDownloadLease() {
    if (!myLease) return;
    generateDoc(myLease.id, {
      onSuccess: (result) => {
        const url = (result as any).url;
        if (url) window.open(url, "_blank");
      },
    });
  }

  function closeDialog() {
    setDialog(null);
    setSelectedPayment(null);
  }

  // ── Imported lease: confirmation interstitial ─────────────────────────────
  if (myLease && needsTermsConfirmation) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-background">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="text-xl">Confirm Your Tenancy Details</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              We've set up your tenancy in our system. Please review the key terms below
              and confirm you have received and agreed to these terms.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Key lease details */}
            <div className="rounded-[8px] border divide-y text-sm">
              {[
                { label: "Property", value: myLease.propertyName ?? "—" },
                { label: "Unit",     value: myLease.unitName ?? "—" },
                { label: "Monthly rent", value: formatCurrency(myLease.terms.monthlyRent, myLease.terms.currency) },
                { label: "Start date",   value: formatDate(myLease.terms.startDate) },
                { label: "End date",     value: myLease.terms.endDate ? formatDate(myLease.terms.endDate) : "Rolling (no fixed end)" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between px-4 py-2.5 gap-3">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium text-right">{value}</span>
                </div>
              ))}
            </div>

            {/* Confirmation checkbox */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={termsChecked}
                onChange={(e) => setTermsChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span className="text-sm">
                I confirm that I have received and agree to the terms of my tenancy agreement
                as summarised above.
              </span>
            </label>

            <Button
              className="w-full"
              disabled={!termsChecked}
              loading={confirmingTerms}
              onClick={() => confirmTerms(myLease.id)}
            >
              Confirm and continue to my portal
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              If any details above are incorrect, please contact your property manager.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 sm:p-6 sm:pb-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Current Lease Banner */}
        {myLease && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Current Lease</p>
                  <p className="font-semibold">
                    {myLease.propertyName ?? "Property"}
                    {myLease.unitName && <span className="text-muted-foreground font-normal"> — {myLease.unitName}</span>}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {formatDate(myLease.terms.startDate)}
                    {myLease.terms.endDate ? ` — ${formatDate(myLease.terms.endDate)}` : " · Ongoing"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Monthly Rent</p>
                    <p className="text-xl font-bold">
                      {formatCurrency(myLease.terms.monthlyRent, myLease.terms.currency)}
                    </p>
                  </div>
                  <StatusBadge state={myLease.state} domain="lease" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {leasesLoading && !myLease && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your tenancy…
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="hidden sm:flex">
            <TabsTrigger value="overview" className="gap-1.5">
              <Home className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="payments" className="gap-1.5">
              <CreditCard className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Payments</span>
              {hasOverdueRent && (
                <span className="ml-1 flex h-2 w-2 rounded-full bg-destructive" />
              )}
            </TabsTrigger>
            <TabsTrigger value="lease" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Lease</span>
            </TabsTrigger>
            <TabsTrigger value="maintenance" className="gap-1.5">
              <Wrench className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Maintenance</span>
              {openRequests.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
                  {openRequests.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="inspections" className="gap-1.5" data-tab="inspections">
              <Calendar className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Inspections</span>
              {pendingSignTasks.length > 0 && (
                <span className="ml-1 flex h-2 w-2 rounded-full bg-amber-500" />
              )}
            </TabsTrigger>
            <TabsTrigger value="messages" className="gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Messages</span>
              {unreadMessages > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
                  {unreadMessages > 99 ? "99+" : unreadMessages}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Documents</span>
            </TabsTrigger>
          </TabsList>

          {/* ── Overview ────────────────────────────────────────────── */}
          <TabsContent value="overview" className="mt-4 space-y-4">

            {/* Balance Due banner — shown when rent is overdue */}
            {hasOverdueRent && myLease && (
              <Card className="border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30">
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                        <p className="text-sm font-medium text-destructive">Balance Due</p>
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive uppercase tracking-wide">
                          Overdue
                        </span>
                      </div>
                      <p className="text-3xl font-extrabold text-destructive tracking-tight">
                        {formatCurrency(overdueBalance, myLease.terms?.currency ?? "UGX")}
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>Base rent: {formatCurrency(overdueBalance - overdueLateFee, myLease.terms?.currency ?? "UGX")}</span>
                        {overdueLateFee > 0 && (
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            + {formatCurrency(overdueLateFee, myLease.terms?.currency ?? "UGX")} late fee
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="shrink-0 mt-1"
                      onClick={() => setDialog("pay")}
                    >
                      Pay Now
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Pending tasks — shown when there are inspection reports awaiting tenant signature */}
            {pendingSignTasks.length > 0 && (
              <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <PenLine className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <div>
                        <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                          You have {pendingSignTasks.length === 1 ? "a pending task" : `${pendingSignTasks.length} pending tasks`}
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                          {pendingSignTasks.length === 1
                            ? "An inspection report is ready for your signature."
                            : "Inspection reports are ready for your signature."}
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        {pendingSignTasks.map((insp: any) => (
                          <a
                            key={insp.id}
                            href={`/inspect/sign/${insp.signToken}`}
                            className="flex items-center justify-between rounded-[6px] border border-amber-200 dark:border-amber-700 bg-white/60 dark:bg-amber-950/40 px-3 py-2 text-xs hover:bg-white dark:hover:bg-amber-900/30 transition-colors"
                          >
                            <span className="font-medium capitalize text-amber-900 dark:text-amber-200">
                              {insp.type?.replace(/_/g, " ")} inspection
                              {insp.propertyName ? ` · ${insp.propertyName}` : ""}
                            </span>
                            <span className="text-amber-600 dark:text-amber-400 font-medium">
                              Sign now →
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* End-of-tenancy inspection task — shown when lease is ending and no move-out inspection exists */}
            {showMoveOutTask && (
              <Card className="border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <ClipboardList className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <div>
                        <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                          End of Tenancy Inspection Required
                        </p>
                        <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                          {myLease?.state === "expired" || myLease?.state === "terminated"
                            ? "Your tenancy has ended. A move-out inspection must be completed to finalise your deposit."
                            : "Your lease is ending soon. Please coordinate with your property manager to schedule a move-out inspection before your last day."}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          const el = document.querySelector('[data-tab="inspections"]') as HTMLElement | null;
                          el?.click();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-[6px] border border-blue-300 dark:border-blue-700 bg-white/70 dark:bg-blue-900/40 px-3 py-1.5 text-xs font-medium text-blue-800 dark:text-blue-200 hover:bg-white dark:hover:bg-blue-900/60 transition-colors"
                      >
                        View Inspections →
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Wallet / credit balance — shown when tenant has overpayment credit */}
            {walletBalance > 0 && myLease && (
              <Card className="border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Wallet Credit</p>
                      </div>
                      <p className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-300">
                        {formatCurrency(walletBalance, walletData?.currency ?? myLease.terms?.currency ?? "UGX")}
                      </p>
                      <p className="text-xs text-emerald-700/70 dark:text-emerald-400">
                        Credit from overpayment — will be applied automatically to your next rent.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Secondary stat cards — 3-col when current, 2-col when overdue banner is shown */}
            <div className={cn("grid gap-3", hasOverdueRent ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-3")}>
              {!hasOverdueRent && (
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <p className="text-xs text-muted-foreground">Rent Status</p>
                    </div>
                    <p className="text-lg font-bold text-emerald-600">Up to date</p>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Next Payment</p>
                  </div>
                  <p className="text-lg font-bold text-foreground">{nextPaymentDate}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Wrench className="h-4 w-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Open Requests</p>
                  </div>
                  <p className="text-lg font-bold text-foreground">{openRequests.length}</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Pay Rent", icon: CreditCard, action: () => setDialog("pay"), color: "text-primary", disabled: !myLease },
                  { label: "Maintenance", icon: Wrench, action: () => setDialog("maintenance"), color: "text-amber-600", disabled: !myLease },
                  { label: "Inspections", icon: Calendar, action: () => setTab("inspections"), color: "text-violet-600", disabled: !myLease },
                  { label: "Messages", icon: MessageCircle, action: () => setTab("messages"), color: "text-emerald-600", disabled: !myLease },
                ].map((a) => (
                  <button
                    key={a.label}
                    onClick={a.action}
                    disabled={a.disabled}
                    className="flex flex-col items-center gap-2 p-3 rounded-[6px] border border-border hover:bg-primary/5 hover:border-primary/30 transition-all text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <a.icon className={cn("h-5 w-5", a.color)} />
                    <span className="text-center leading-tight">{a.label}</span>
                  </button>
                ))}
              </CardContent>
            </Card>

            {propertyData?.address && (
              <HowToFindUsCard
                geocode={propertyData.geocode}
                address={propertyData.address}
                whatsappNumber={publicSettings?.["geobox.whatsapp_number"]}
                navUrl={geocodeData?.navUrl}
                landmarkDescription={geocodeData?.landmarkDescription}
                accessInstructions={geocodeData?.accessInstructions}
                deliveryNotes={geocodeData?.deliveryNotes}
              />
            )}

            {myPayments.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Last Payment</CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const last = myPayments[0];
                    return (
                      <button
                        className="w-full flex items-center justify-between py-1 text-sm hover:text-primary transition-colors"
                        onClick={() => setSelectedPayment(last)}
                      >
                        <div className="text-left">
                          <p className="font-mono font-medium">{last.reference}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(last.paidAt ?? last.createdAt)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge state={last.state} domain="payment" />
                          <span className="font-medium">{formatCurrency(last.amount, last.currency)}</span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </button>
                    );
                  })()}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Payments ─────────────────────────────────────────────── */}
          <TabsContent value="payments" className="mt-4 space-y-4">
            {myLease && (
              <div className="flex items-center justify-between">
                <SectionHeading>Payment Records</SectionHeading>
                <div className="flex items-center gap-2">
                  {myPayments.length > 0 && (
                    <a
                      href={`/api/v1/leases/${myLease.id}/statement`}
                      download={`statement-${myLease.reference}.csv`}
                      className="inline-flex items-center gap-1.5 rounded-[5px] border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <FileDown className="h-3.5 w-3.5" />
                      Statement
                    </a>
                  )}
                  <Button size="sm" onClick={() => setDialog("pay")}>
                    <CreditCard className="h-3.5 w-3.5" />
                    Pay Rent
                  </Button>
                </div>
              </div>
            )}

            {/* Payment summary stats */}
            {myPayments.length > 0 && (() => {
              const settled = myPayments.filter((p) =>
                ["completed", "confirmed", "reconciled", "allocated"].includes((p as any).status ?? p.state)
              );
              const totalPaid = settled.reduce((sum, p) => sum + p.amount, 0);
              const currency = myPayments[0]?.currency ?? "UGX";
              const lastPaid = myPayments[0];
              return (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Total Paid", value: formatCurrency(totalPaid, currency) },
                    { label: "Payments Made", value: String(settled.length) },
                    { label: "Last Payment", value: lastPaid ? formatDate(lastPaid.paidAt ?? lastPaid.createdAt) : "—" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-[6px] border border-border bg-card px-3 py-2.5 text-center">
                      <p className="text-xs text-muted-foreground mb-0.5">{s.label}</p>
                      <p className="text-sm font-semibold text-foreground">{s.value}</p>
                    </div>
                  ))}
                </div>
              );
            })()}

            {userId && <WalletBalanceCard tenantId={userId} />}

            <Card>
              <CardContent className="pt-4">
                <PaymentTimeline
                  leaseId={myLease?.id ?? ""}
                  payments={myPayments}
                  schedules={schedulesData?.data ?? []}
                  isLoading={paymentsLoading}
                  onViewReceipt={setReceiptPayment}
                  onSelectPayment={setSelectedPayment}
                />
                {!paymentsLoading && myPayments.length === 0 && myLease && (
                  <div className="flex justify-center mt-2">
                    <Button variant="outline" size="sm" onClick={() => setDialog("pay")}>
                      Make first payment
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Receipt disclaimer */}
            {myPayments.length > 0 && (
              <div className="rounded-[6px] border border-primary/15 bg-primary/5 px-3 py-2.5 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-0.5">Keep your payment records safe</p>
                Tap any payment to view its details or cancel a pending one. Click <span className="font-medium text-foreground">View receipt</span> to get a printable receipt showing the period covered.
              </div>
            )}
          </TabsContent>

          {/* ── Lease ────────────────────────────────────────────────── */}
          <TabsContent value="lease" className="mt-4 space-y-4">
            {!myLease ? (
              <Card>
                <CardContent className="pt-6 text-center py-12">
                  <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No lease found for your account.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Lease Summary</CardTitle>
                      <StatusBadge state={myLease.state} domain="lease" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                      {[
                        ["Property", myLease.propertyName ?? "—"],
                        ["Unit", myLease.unitName ?? "—"],
                        ["Type", myLease.type?.replace(/_/g, " ")],
                        ["Start date", formatDate(myLease.terms.startDate)],
                        ["End date", myLease.terms.endDate ? formatDate(myLease.terms.endDate) : "—"],
                        ["Monthly rent", formatCurrency(myLease.terms.monthlyRent, myLease.terms.currency)],
                        ["Security deposit", formatCurrency(myLease.terms.depositAmount, myLease.terms.currency)],
                        ["Notice period", `${myLease.terms.noticePeriodDays} days`],
                        ["Grace period", `${myLease.terms.gracePeriodDays} days`],
                        ["Late fees", myLease.terms.lateFeeType === "flat"
                          ? formatCurrency(myLease.terms.lateFeeValue, myLease.terms.currency)
                          : myLease.terms.lateFeeType === "percentage"
                            ? `${myLease.terms.lateFeeValue}% of outstanding rent`
                            : "—"],
                      ].map(([label, value]) => (
                        <div key={label as string}>
                          <dt className="text-xs text-muted-foreground">{label}</dt>
                          <dd className="text-sm font-medium capitalize">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </CardContent>
                </Card>

                {/* Signatures — read-only summary */}
                {(tenantSig || landlordSig) && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Signatures</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {[
                        { party: "Tenant", sig: tenantSig },
                        { party: "Landlord", sig: landlordSig },
                      ].map(({ party, sig }) => (
                        <div key={party} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                          <div>
                            <p className="text-sm font-medium">{party}</p>
                            {sig?.name && <p className="text-xs text-muted-foreground">{sig.name}</p>}
                          </div>
                          {sig?.status === "signed" ? (
                            <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Signed {sig.signedAt ? formatDate(sig.signedAt) : ""}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-xs text-amber-600">
                              <Clock className="h-3.5 w-3.5" />
                              Pending
                            </div>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Lease Agreement</p>
                        <p className="text-xs text-muted-foreground">Download your signed lease document</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadLease}
                        disabled={generatingDoc}
                      >
                        {generatingDoc
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Download className="h-3.5 w-3.5" />}
                        {generatingDoc ? "Generating…" : "Download PDF"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ── Maintenance ──────────────────────────────────────────── */}
          <TabsContent value="maintenance" className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <SectionHeading>Maintenance Requests</SectionHeading>
              <Button size="sm" disabled={!myLease} onClick={() => setDialog("maintenance")}>
                <Plus className="h-3.5 w-3.5" />
                New Request
              </Button>
            </div>

            <Card>
              <CardContent className="pt-4">
                {myMaintenance.length === 0 ? (
                  <div className="text-center py-8">
                    <Wrench className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No maintenance requests yet.</p>
                    {myLease && (
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => setDialog("maintenance")}>
                        Submit a request
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-0 divide-y divide-border/50">
                    {myMaintenance.map((m) => (
                      <div key={m.id} className="py-3 space-y-2 cursor-pointer rounded-[6px] active:bg-muted/40 px-2 -mx-2 transition-colors" onClick={() => setSelectedMaintenance(m)}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-sm font-medium capitalize">
                              {m.title ?? m.category?.replace(/_/g, " ") ?? "Issue"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {m.description ?? ""}
                            </p>
                            <p className="text-[11px] text-muted-foreground/60 mt-1">
                              {formatDateTime(m.createdAt)}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <StatusBadge state={m.state} domain="maintenance" />
                            {m.priority && (
                              <span className={cn(
                                "text-[10px] rounded-full px-1.5 py-0.5 font-medium capitalize",
                                m.priority === "urgent" ? "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800" :
                                m.priority === "high"   ? "bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800" :
                                m.priority === "medium" ? "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800" :
                                "bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800",
                              )}>
                                {m.priority}
                              </span>
                            )}
                          </div>
                        </div>
                        {(m.photoUrls ?? []).length > 0 && (
                          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                            {(m.photoUrls ?? []).slice(0, 5).map((url) => (
                              <div key={url} className="relative shrink-0 h-14 w-14 rounded-[5px] overflow-hidden border bg-muted">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={toDisplayUrl(url)} alt="Issue photo" className="w-full h-full object-cover" />
                              </div>
                            ))}
                            {(m.photoUrls ?? []).length > 5 && (
                              <div className="shrink-0 h-14 w-14 rounded-[5px] border bg-muted flex items-center justify-center">
                                <span className="text-xs text-muted-foreground font-medium">+{(m.photoUrls ?? []).length - 5}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Inspections ───────────────────────────────────────────── */}
          <TabsContent value="inspections" className="mt-4">
            {myLease ? (
              <InspectionsTab
                leaseId={myLease.id}
                unitId={myLease.unitId ?? ""}
                propertyId={myLease.propertyId ?? ""}
              />
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Calendar className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No active lease found.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Messages ──────────────────────────────────────────────── */}
          <TabsContent value="messages" className="mt-4">
            {myLease ? (
              <MessagesTab leaseId={myLease.id} userId={userId} userSub={user?.logtoSub} />
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <MessageCircle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No active lease found.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Documents ─────────────────────────────────────────────── */}
          <TabsContent value="documents" className="mt-4">
            {myLease?.tenantId ? (
              <DocumentsTab tenantId={myLease.tenantId} />
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No active lease found.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Dialogs ───────────────────────────────────────────────── */}
      {myLease && (() => {
        const dueSchedule =
          overdueSchedule ??
          schedules.find((s) => s.status === "pending" || s.state === "pending") ??
          null;
        const balance = dueSchedule?.balance ?? (myLease as any).terms?.monthlyRent ?? 0;
        const lateFeeApplied = dueSchedule?.lateFeeApplied ?? 0;
        return (
          <PortalSheet open={dialog === "pay"} onClose={closeDialog} title="Pay rent">
            <PayDialog
              lease={myLease as any}
              balance={balance}
              lateFeeApplied={lateFeeApplied}
              userPhone={user?.phone}
              mobileMoneyProvider={user?.mobileMoneyProvider}
              mobileMoneyNumber={user?.mobileMoneyNumber}
              paymentSettings={paymentSettings}
              onClose={closeDialog}
            />
          </PortalSheet>
        );
      })()}

      {myLease && (
        <PortalSheet open={dialog === "maintenance"} onClose={closeDialog} title="New maintenance request">
          <MaintenanceDialog
            userId={userId}
            userName={user?.name ?? "Tenant"}
            leaseId={myLease.id}
            propertyId={myLease.propertyId}
            unitId={myLease.unitId ?? ""}
            onClose={closeDialog}
          />
        </PortalSheet>
      )}

      <PortalSheet open={!!selectedPayment} onClose={closeDialog} title="Payment details">
        {selectedPayment && (
          <TenantPaymentDetailSheet
            payment={selectedPayment}
            leaseId={myLease?.id ?? ""}
            onClose={closeDialog}
          />
        )}
      </PortalSheet>

      <PaymentReceipt
        payment={receiptPayment}
        leaseRef={myLease?.reference}
        propertyName={(myLease as any)?.propertyName ?? undefined}
        unitName={(myLease as any)?.unitName ?? undefined}
        leaseId={myLease?.id}
        schedules={schedulesData?.data ?? []}
        open={!!receiptPayment}
        onClose={() => setReceiptPayment(null)}
      />

      <PortalSheet
        open={!!selectedMaintenance}
        onClose={() => setSelectedMaintenance(null)}
        title="Maintenance request"
      >
        {selectedMaintenance && (
          <MaintenanceDetailSheet
            issue={selectedMaintenance}
            onClose={() => setSelectedMaintenance(null)}
          />
        )}
      </PortalSheet>

      <PortalBottomNav
        tab={tab}
        setTab={setTab}
        hasOverdueRent={hasOverdueRent}
        openRequestsCount={openRequests.length}
        unreadMessages={unreadMessages}
      />
    </div>
  );
}
