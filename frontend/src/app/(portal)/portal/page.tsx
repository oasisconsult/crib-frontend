"use client";

import { useState, useEffect, useRef } from "react";
import {
  Home, CreditCard, FileText, Wrench, CheckCircle2, Clock,
  AlertCircle, ChevronRight, Plus, X, Loader2, Download,
  Smartphone, Building2, Banknote, Calendar, MessageCircle,
  Send, RefreshCw,
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
import { formatCurrency, formatDate } from "@/utils/formatters";
import { usePayments, useRecordPayment, useRentSchedule } from "@/hooks/usePayments";
import { useLeases, useLease, useGenerateLeaseDocument } from "@/hooks/useLeases";
import { useMaintenanceIssues, useCreateMaintenanceIssue, useInspections } from "@/hooks/useInspections";
import { useMessages, useSendMessage } from "@/hooks/useMessages";
import { useAppStore } from "@/store/useAppStore";
import { cn } from "@/utils/cn";
import { PaymentTimeline } from "@/components/payments/PaymentTimeline";
import { WalletBalanceCard } from "@/components/payments/WalletBalanceCard";
import { PaymentReceipt } from "@/components/payments/PaymentReceipt";
import type { Payment } from "@/types";
import type { Message } from "@/services/api/messages";

// ─── helpers ────────────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold text-foreground mb-3">{children}</h2>;
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
  bankDetails?: string;
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
    bankDetails: "Stanbic Bank · Account: 9030012345678 · Account Name: Crib Properties Ltd",
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
  lease: { id: string; terms: { monthlyRent: number; currency: string } };
  userPhone?: string;
  onClose: () => void;
}

function PayDialog({ lease, userPhone, onClose }: PayDialogProps) {
  const [step, setStep] = useState<PayStep>("method");
  const [selectedMethod, setSelectedMethod] = useState<PayMethod | null>(null);
  const [phone, setPhone] = useState(userPhone ?? "");
  const [amount, setAmount] = useState(String(lease.terms.monthlyRent));
  const [reference, setReference] = useState("");
  const [pendingMessage, setPendingMessage] = useState("");
  const { mutate, isPending } = useRecordPayment();

  function handleMethodSelect(m: PayMethod) {
    setSelectedMethod(m);
    setStep("form");
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
        amount: parseFloat(amount) || lease.terms.monthlyRent,
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
        amount: parseFloat(amount) || lease.terms.monthlyRent,
        currency: lease.terms.currency,
        reference: reference.trim(),
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
            {step === "confirm" && "Enter Reference"}
          </h3>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Amount pill */}
      <div className="rounded-[6px] bg-primary/5 border border-primary/15 px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-medium text-foreground/70">Amount due</span>
        <span className="text-lg font-bold text-foreground">{formatCurrency(lease.terms.monthlyRent, lease.terms.currency)}</span>
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
          {selectedMethod.bankDetails && (
            <div className="rounded-[6px] bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800 p-3 text-xs text-teal-800 dark:text-teal-300">
              <p className="font-medium mb-0.5">Bank Details</p>
              {selectedMethod.bankDetails}
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
              min={1}
            />
          </div>

          {isMobileMoney() ? (
            /* Mobile money: submit immediately → STK push → check phone */
            <Button
              className="w-full"
              onClick={handleMobileMoneySubmit}
              disabled={!phone.trim() || isPending}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
              {isPending ? "Sending request…" : "Send Payment Request"}
            </Button>
          ) : (
            /* Cash / bank: go to reference step */
            <Button
              className="w-full"
              onClick={() => setStep("confirm")}
            >
              I&apos;ve Made Payment
            </Button>
          )}
        </div>
      )}

      {/* Step: reference entry (cash / bank only) */}
      {step === "confirm" && selectedMethod && (
        <div className="space-y-3">
          <div className="rounded-[6px] bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
            {selectedMethod.instructions}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Transaction / Receipt Reference
            </Label>
            <Input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. TXN123456789"
              autoFocus
            />
          </div>

          <Button
            className="w-full"
            disabled={!reference.trim() || isPending}
            onClick={handleCashBankSubmit}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            {isPending ? "Submitting…" : "Submit Payment"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Payment Detail Sheet ─────────────────────────────────────────────────────

function PaymentDetailSheet({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  const rows: [string, string][] = [
    ["Reference", payment.reference ?? "—"],
    ["Category", payment.category],
    ["Method", payment.method ?? "—"],
    ["Amount", formatCurrency(payment.amount, payment.currency)],
    ["Paid at", payment.paidAt ? formatDate(payment.paidAt) : "—"],
    ["Status", payment.state],
    ["Notes", payment.notes ?? "—"],
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Payment Details</h3>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <dl className="divide-y divide-border">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between py-2 text-sm">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium font-mono text-foreground max-w-[55%] text-right break-all">{value}</dd>
          </div>
        ))}
      </dl>
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
  const { mutate, isPending, isSuccess } = useCreateMaintenanceIssue();

  function handleSubmit() {
    if (!description.trim()) return;
    mutate({
      category,
      priority,
      description,
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
                  ? "border-teal-600 dark:border-teal-500 bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400 font-semibold ring-1 ring-teal-600/50"
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

      <Button className="w-full" disabled={!description.trim() || isPending} onClick={handleSubmit}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
        {isPending ? "Submitting…" : "Submit Request"}
      </Button>
    </div>
  );
}

// ─── Dialog wrapper ───────────────────────────────────────────────────────────

function DialogOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-md mx-4 sm:mx-auto bg-[hsl(var(--card))] rounded-t-[8px] sm:rounded-[8px] border border-border shadow-2xl p-5 max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
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
                    const isMe = msg.senderId === userId || (!!userSub && msg.senderId === userSub);
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

function InspectionsTab({ unitId, propertyId }: { unitId: string; propertyId: string }) {
  const { data, isLoading } = useInspections({ unitId } as any);
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
              {inspections.map((insp: any) => (
                <div key={insp.id} className="py-3 flex items-start justify-between gap-4">
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
              ))}
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

// ─── Main page ────────────────────────────────────────────────────────────────

type Dialog = "pay" | "maintenance" | null;

export default function TenantPortalPage() {
  const [tab, setTab] = useState("overview");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [receiptPayment, setReceiptPayment] = useState<Payment | null>(null);

  const user = useAppStore((s) => s.user);
  const userId = user?.id ?? "";

  const { data: leasesData, isLoading: leasesLoading } = useLeases();
  const { data: paymentsData, isLoading: paymentsLoading } = usePayments();
  const { data: maintenanceData } = useMaintenanceIssues();

  const allLeases = leasesData?.data ?? [];
  const allPayments = paymentsData?.data ?? [];
  const allMaintenance = maintenanceData?.data ?? [];

  // Find tenant's lease from list (for IDs), then fetch detail (for signatures)
  const leaseStub = allLeases.find((l) => l.tenantId === userId) ?? allLeases[0];
  const { data: myLease } = useLease(leaseStub?.id ?? "");

  const { data: schedulesData } = useRentSchedule(myLease?.id ?? "");
  const { mutate: generateDoc, isPending: generatingDoc } = useGenerateLeaseDocument();

  const myPayments = allPayments.filter((p) => !myLease || p.leaseId === myLease.id);
  const hasOverdueRent = (schedulesData?.data ?? []).some((s) => s.state === "overdue");
  const myMaintenance = allMaintenance.filter((m) => (m as any).reportedById === userId || (m as any).reportedBy === userId);
  const openRequests = myMaintenance.filter((m) => !["resolved", "closed"].includes(m.state));

  const nextPaymentDate = myLease?.terms
    ? (() => {
        const today = new Date();
        const next = new Date(today.getFullYear(), today.getMonth() + (today.getDate() > 1 ? 1 : 0), 1);
        return next.toLocaleDateString("en-UG", { month: "long", day: "numeric", year: "numeric" });
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

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Current Lease Banner */}
        {myLease && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Current Lease</p>
                  <p className="font-mono font-semibold">{myLease.reference}</p>
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
          <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:flex">
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
            <TabsTrigger value="inspections" className="gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Inspections</span>
            </TabsTrigger>
            <TabsTrigger value="messages" className="gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Messages</span>
            </TabsTrigger>
          </TabsList>

          {/* ── Overview ────────────────────────────────────────────── */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  label: "Rent Status",
                  value: hasOverdueRent ? "Overdue" : "Up to date",
                  color: hasOverdueRent ? "text-destructive" : "text-emerald-600",
                  icon: hasOverdueRent ? AlertCircle : CheckCircle2,
                },
                { label: "Next Payment", value: nextPaymentDate, color: "text-foreground", icon: Clock },
                { label: "Open Requests", value: String(openRequests.length), color: "text-foreground", icon: Wrench },
              ].map((s) => (
                <Card key={s.label}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <s.icon className={cn("h-4 w-4", s.color)} />
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                    </div>
                    <p className={cn("text-lg font-bold", s.color)}>{s.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Pay Rent", icon: CreditCard, action: () => setDialog("pay"), color: "text-primary", disabled: !myLease },
                  { label: "Maintenance", icon: Wrench, action: () => setDialog("maintenance"), color: "text-amber-600", disabled: !myLease },
                  { label: "Inspections", icon: Calendar, action: () => setTab("inspections"), color: "text-teal-600", disabled: !myLease },
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
                <Button size="sm" onClick={() => setDialog("pay")}>
                  <CreditCard className="h-3.5 w-3.5" />
                  Pay Rent
                </Button>
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
                Click <span className="font-medium text-foreground">View receipt</span> on any payment to see full details including date, time, reference, and what period it covered. You can print or save receipts for your records.
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
                        ["Reference", myLease.reference],
                        ["Type", myLease.type?.replace(/_/g, " ")],
                        ["Start date", formatDate(myLease.terms.startDate)],
                        ["End date", myLease.terms.endDate ? formatDate(myLease.terms.endDate) : "—"],
                        ["Monthly rent", formatCurrency(myLease.terms.monthlyRent, myLease.terms.currency)],
                        ["Security deposit", formatCurrency(myLease.terms.depositAmount, myLease.terms.currency)],
                        ["Notice period", `${myLease.terms.noticePeriodDays} days`],
                        ["Grace period", `${myLease.terms.gracePeriodDays} days`],
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
                      <div key={m.id} className="py-3 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-medium capitalize">
                            {(m as any).title ?? (m as any).category?.replace(/_/g, " ") ?? "Issue"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            {(m as any).description ?? ""}
                          </p>
                          <p className="text-[11px] text-muted-foreground/60 mt-1">
                            {formatDate(m.createdAt)}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <StatusBadge state={m.state} domain="maintenance" />
                          {(m as any).priority && (
                            <span className={cn(
                              "text-[10px] rounded-full px-1.5 py-0.5 font-medium capitalize",
                              (m as any).priority === "urgent" ? "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800" :
                              (m as any).priority === "high"   ? "bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800" :
                              (m as any).priority === "medium" ? "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800" :
                              "bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800",
                            )}>
                              {(m as any).priority}
                            </span>
                          )}
                        </div>
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
        </Tabs>
      </div>

      {/* ── Dialogs ───────────────────────────────────────────────── */}
      {dialog === "pay" && myLease && (
        <DialogOverlay onClose={closeDialog}>
          <PayDialog
            lease={myLease as any}
            userPhone={user?.phone}
            onClose={closeDialog}
          />
        </DialogOverlay>
      )}

      {dialog === "maintenance" && myLease && (
        <DialogOverlay onClose={closeDialog}>
          <MaintenanceDialog
            userId={userId}
            userName={user?.name ?? "Tenant"}
            leaseId={myLease.id}
            propertyId={myLease.propertyId}
            unitId={myLease.unitId ?? ""}
            onClose={closeDialog}
          />
        </DialogOverlay>
      )}

      {selectedPayment && (
        <DialogOverlay onClose={closeDialog}>
          <PaymentDetailSheet payment={selectedPayment} onClose={closeDialog} />
        </DialogOverlay>
      )}

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
    </div>
  );
}
