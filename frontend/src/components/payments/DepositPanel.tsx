"use client";

import { useState } from "react";
import { Shield, AlertCircle, CheckCircle2, Clock, Loader2, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/utils/formatters";
import { useDeposit, useReturnDeposit } from "@/hooks/usePayments";

interface Props {
  leaseId: string;
  currency: string;
  canManage?: boolean;
}

const STATUS_CONFIG = {
  held:               { label: "Held",              color: "bg-blue-100 text-blue-800" },
  partially_returned: { label: "Partially returned", color: "bg-amber-100 text-amber-800" },
  fully_returned:     { label: "Fully returned",     color: "bg-emerald-100 text-emerald-800" },
  forfeited:          { label: "Forfeited",          color: "bg-red-100 text-red-800" },
};

export function DepositPanel({ leaseId, currency, canManage = false }: Props) {
  const { data: deposit, isLoading, isError } = useDeposit(leaseId);
  const { mutate: processReturn, isPending } = useReturnDeposit(leaseId);

  const [showForm, setShowForm] = useState(false);
  const [returnAmount, setReturnAmount] = useState("");
  const [deductions, setDeductions] = useState<{ reason: string; amount: string }[]>([
    { reason: "", amount: "" },
  ]);
  const [notes, setNotes] = useState("");

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !deposit) return null;

  const statusCfg = STATUS_CONFIG[deposit.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.held;
  const totalDeducted = (deposit.deductions as any[]).reduce((s: number, d: any) => s + (d.amount || 0), 0);
  const netRefundable = deposit.amountHeld - totalDeducted - deposit.amountReturned;

  function addDeductionRow() {
    setDeductions((d) => [...d, { reason: "", amount: "" }]);
  }
  function removeDeductionRow(i: number) {
    setDeductions((d) => d.filter((_, idx) => idx !== i));
  }
  function updateDeduction(i: number, field: "reason" | "amount", val: string) {
    setDeductions((d) => d.map((row, idx) => idx === i ? { ...row, [field]: val } : row));
  }

  function handleSubmit() {
    const validDeductions = deductions
      .filter((d) => d.reason.trim() && parseFloat(d.amount) > 0)
      .map((d) => ({ reason: d.reason.trim(), amount: parseFloat(d.amount) }));
    processReturn(
      {
        amountReturned: parseFloat(returnAmount) || 0,
        deductions: validDeductions,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: () => {
          setShowForm(false);
          setReturnAmount("");
          setDeductions([{ reason: "", amount: "" }]);
          setNotes("");
        },
      }
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Security Deposit
        </CardTitle>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusCfg.color}`}>
          {statusCfg.label}
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Amounts summary */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg border p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Held</p>
            <p className="text-sm font-semibold">{formatCurrency(deposit.amountHeld, currency)}</p>
          </div>
          <div className="rounded-lg border p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Deductions</p>
            <p className="text-sm font-semibold text-red-600">{formatCurrency(totalDeducted, currency)}</p>
          </div>
          <div className="rounded-lg border p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Refundable</p>
            <p className="text-sm font-semibold text-emerald-600">{formatCurrency(netRefundable, currency)}</p>
          </div>
        </div>

        {/* Existing deductions */}
        {(deposit.deductions as any[]).length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Deductions</p>
            {(deposit.deductions as any[]).map((d: any, i: number) => (
              <div key={i} className="flex justify-between text-xs py-1 border-b border-border/50 last:border-0">
                <span className="text-muted-foreground">{d.reason}</span>
                <span className="font-medium text-red-600">− {formatCurrency(d.amount, currency)}</span>
              </div>
            ))}
          </div>
        )}

        {deposit.amountReturned > 0 && (
          <p className="text-xs text-emerald-600 font-medium">
            {formatCurrency(deposit.amountReturned, currency)} returned
            {deposit.returnedAt ? ` on ${new Date(deposit.returnedAt).toLocaleDateString()}` : ""}
          </p>
        )}

        {deposit.notes && (
          <p className="text-xs text-muted-foreground border-l-2 border-muted pl-2">{deposit.notes}</p>
        )}

        {/* Process return form */}
        {canManage && !["fully_returned", "forfeited"].includes(deposit.status) && (
          <>
            {!showForm ? (
              <Button size="sm" variant="outline" className="w-full text-xs h-8" onClick={() => setShowForm(true)}>
                Process Return
              </Button>
            ) : (
              <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
                <p className="text-xs font-semibold">Process Deposit Return</p>

                <div className="space-y-1">
                  <Label className="text-xs">Amount to return ({currency})</Label>
                  <Input
                    type="number"
                    value={returnAmount}
                    onChange={(e) => setReturnAmount(e.target.value)}
                    placeholder="0"
                    className="h-8 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Deductions</Label>
                    <button type="button" onClick={addDeductionRow}
                      className="text-[10px] text-primary hover:underline">+ Add</button>
                  </div>
                  {deductions.map((row, i) => (
                    <div key={i} className="flex gap-2">
                      <Input value={row.reason} onChange={(e) => updateDeduction(i, "reason", e.target.value)}
                        placeholder="Reason (e.g. Broken sink)" className="h-7 text-xs flex-1" />
                      <Input type="number" value={row.amount} onChange={(e) => updateDeduction(i, "amount", e.target.value)}
                        placeholder="Amount" className="h-7 text-xs w-24" />
                      {deductions.length > 1 && (
                        <button type="button" onClick={() => removeDeductionRow(i)}
                          className="text-muted-foreground hover:text-destructive">
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Notes (optional)</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)}
                    placeholder="Additional notes" className="h-8 text-sm" />
                </div>

                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 h-8 text-xs" onClick={handleSubmit}
                    disabled={isPending || (!returnAmount && deductions.every((d) => !d.reason))}>
                    {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirm Return"}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
