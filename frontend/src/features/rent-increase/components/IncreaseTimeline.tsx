"use client";

import { CheckCircle2, Clock, TrendingUp, XCircle } from "lucide-react";
import type { RentIncrease, RentIncreaseStatus } from "../types";

interface Props {
  increase: RentIncrease;
}

const steps: { key: RentIncreaseStatus | "issued"; label: string; description: string }[] = [
  { key: "issued",       label: "Notice Issued",   description: "Rent increase notice sent to tenant" },
  { key: "pending_ack",  label: "Pending Ack.",    description: "Awaiting tenant acknowledgement" },
  { key: "acknowledged", label: "Acknowledged",    description: "Tenant has acknowledged the notice" },
  { key: "applied",      label: "Applied",         description: "Rent updated on lease" },
];

function getStepIndex(status: RentIncreaseStatus): number {
  if (status === "withdrawn") return -1;
  return { pending_ack: 1, acknowledged: 2, applied: 3 }[status] ?? 0;
}

export function IncreaseTimeline({ increase }: Props) {
  const activeIndex = getStepIndex(increase.status);
  const isWithdrawn = increase.status === "withdrawn";

  return (
    <div className="mt-2">
      {isWithdrawn ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <XCircle className="h-4 w-4 text-gray-400" />
          <span>Notice withdrawn{increase.withdrawnAt ? ` on ${new Date(increase.withdrawnAt).toLocaleDateString()}` : ""}</span>
        </div>
      ) : (
        <ol className="flex items-center gap-0">
          {steps.map((step, i) => {
            const done = i < activeIndex || (step.key === "issued" && activeIndex >= 1);
            const current = i === activeIndex && step.key !== "issued";
            return (
              <li key={step.key} className="flex items-center flex-1 min-w-0">
                <div className="flex flex-col items-center min-w-0">
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold
                      ${done || (step.key === "issued") ? "bg-primary text-primary-foreground" : current ? "border-2 border-primary text-primary bg-background" : "border-2 border-muted text-muted-foreground bg-background"}`}
                  >
                    {done || step.key === "issued" ? <CheckCircle2 className="h-4 w-4" /> : current ? <Clock className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                  </div>
                  <span className={`mt-1 text-[10px] text-center leading-tight max-w-[60px] ${done || step.key === "issued" || current ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {step.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 mb-4 ${i < activeIndex ? "bg-primary" : "bg-muted"}`} />
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
