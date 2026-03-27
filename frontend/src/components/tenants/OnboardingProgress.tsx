"use client";

import { Progress } from "@/components/ui/progress";
import { OnboardingWorkflowStepper } from "@/components/leases/WorkflowStepper";
import { cn } from "@/utils/cn";
import type { OnboardingState } from "@/types/states";

const STATE_PROGRESS: Record<OnboardingState, number> = {
  invited: 10,
  started: 35,
  submitted: 65,
  approved: 85,
  activated: 100,
  rejected: 0,
};

interface OnboardingProgressProps {
  state: OnboardingState;
  compact?: boolean;
  className?: string;
}

export function OnboardingProgress({ state, compact, className }: OnboardingProgressProps) {
  const progress = STATE_PROGRESS[state] ?? 0;

  if (compact) {
    return (
      <div className={cn("flex items-center gap-1.5 min-w-[60px]", className)}>
        <Progress
          value={progress}
          className="h-1.5 w-14"
          indicatorClassName={state === "activated" ? "bg-emerald-500" : "bg-primary"}
        />
        <span className="text-xs text-muted-foreground">{progress}%</span>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Onboarding Progress</span>
        <span className="text-muted-foreground font-medium">{progress}%</span>
      </div>
      <Progress
        value={progress}
        className="h-2"
        indicatorClassName={state === "activated" ? "bg-emerald-500" : state === "rejected" ? "bg-destructive" : "bg-primary"}
      />
      <OnboardingWorkflowStepper state={state} />
    </div>
  );
}
