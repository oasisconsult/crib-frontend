"use client";

import { useState } from "react";
import { X, Zap } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/store/useUIStore";
import { utilitiesApi } from "../api";
import { UTILITY_LABELS } from "../types";

interface Props {
  leaseId: string;
  currency: string;
  onClose: () => void;
}

const UTILITY_TYPES = ["water", "electricity", "internet", "garbage", "other"] as const;

export function RecordUtilityModal({ leaseId, currency, onClose }: Props) {
  const qc = useQueryClient();

  const [utilityType, setUtilityType] = useState("water");
  const [billingType, setBillingType] = useState<"fixed" | "metered">("fixed");
  const [readingDate, setReadingDate] = useState(new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState("");
  const [readingValue, setReadingValue] = useState("");
  const [previousValue, setPreviousValue] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [autoBill, setAutoBill] = useState(true);

  const consumed =
    billingType === "metered" && readingValue && previousValue
      ? Math.max(0, parseFloat(readingValue) - parseFloat(previousValue))
      : null;
  const derivedAmount =
    billingType === "metered" && consumed !== null && unitPrice
      ? consumed * parseFloat(unitPrice)
      : null;

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      utilitiesApi.record(leaseId, {
        utilityType,
        billingType,
        readingDate,
        ...(billingType === "metered"
          ? {
              readingValue: parseFloat(readingValue),
              previousValue: parseFloat(previousValue),
              unitPrice: parseFloat(unitPrice),
            }
          : { amount: parseFloat(amount) }),
        currency,
        notes: notes || undefined,
        autoBill,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["utility-readings", leaseId] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      toast.success(autoBill ? "Utility charge recorded and billed" : "Utility reading recorded");
      onClose();
    },
    onError: () => toast.error("Failed to record utility reading"),
  });

  function canSubmit() {
    if (!readingDate) return false;
    if (billingType === "fixed") return !!amount && parseFloat(amount) > 0;
    return (
      !!readingValue &&
      !!previousValue &&
      !!unitPrice &&
      parseFloat(readingValue) >= parseFloat(previousValue)
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4" />
              Record Utility Charge
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              Meter reading or fixed charge for this lease.
            </CardDescription>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </CardHeader>

        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); if (canSubmit()) mutate(); }} className="space-y-4">
            {/* Utility type */}
            <div className="space-y-1.5">
              <Label>Utility type</Label>
              <div className="flex flex-wrap gap-2">
                {UTILITY_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setUtilityType(t)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      utilityType === t
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {UTILITY_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Billing type */}
            <div className="space-y-1.5">
              <Label>Billing method</Label>
              <div className="flex gap-3">
                {(["fixed", "metered"] as const).map((bt) => (
                  <label key={bt} className="flex cursor-pointer items-center gap-2 text-sm select-none">
                    <input
                      type="radio"
                      name="billingType"
                      value={bt}
                      checked={billingType === bt}
                      onChange={() => setBillingType(bt)}
                      className="accent-primary"
                    />
                    {bt === "fixed" ? "Fixed charge" : "Meter reading"}
                  </label>
                ))}
              </div>
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <Label htmlFor="util-date">Reading date</Label>
              <Input
                id="util-date"
                type="date"
                value={readingDate}
                onChange={(e) => setReadingDate(e.target.value)}
                required
              />
            </div>

            {/* Fixed amount */}
            {billingType === "fixed" && (
              <div className="space-y-1.5">
                <Label htmlFor="util-amount">Amount ({currency})</Label>
                <Input
                  id="util-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
            )}

            {/* Metered fields */}
            {billingType === "metered" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="util-prev">Previous reading</Label>
                    <Input
                      id="util-prev"
                      type="number"
                      min="0"
                      step="0.001"
                      placeholder="0"
                      value={previousValue}
                      onChange={(e) => setPreviousValue(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="util-curr">Current reading</Label>
                    <Input
                      id="util-curr"
                      type="number"
                      min="0"
                      step="0.001"
                      placeholder="0"
                      value={readingValue}
                      onChange={(e) => setReadingValue(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="util-price">Unit price ({currency})</Label>
                  <Input
                    id="util-price"
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    placeholder="0.00"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    required
                  />
                </div>
                {consumed !== null && derivedAmount !== null && (
                  <p className="text-xs text-muted-foreground">
                    {consumed.toLocaleString()} units consumed → <span className="font-medium text-foreground">{currency} {derivedAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </p>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="util-notes">Notes (optional)</Label>
              <Input
                id="util-notes"
                placeholder="e.g. March 2026 water bill"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Auto-bill toggle */}
            <label className="flex cursor-pointer items-center gap-2.5 text-sm select-none">
              <input
                type="checkbox"
                checked={autoBill}
                onChange={(e) => setAutoBill(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              Create payment charge immediately
            </label>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || !canSubmit()}>
                {isPending ? "Saving…" : "Record"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
