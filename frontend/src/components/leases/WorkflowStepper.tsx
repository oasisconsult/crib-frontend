"use client";

import { Check } from "lucide-react";
import { cn } from "@/utils/cn";
import type { LeaseState, OnboardingState } from "@/types/states";
import type { OnboardingStep } from "@/types/onboarding";
import { FULL_ONBOARDING_JOURNEY_STEPS, LEASE_STEPS, ONBOARDING_STEPS, PAYMENT_FLOW_STEPS } from "@/utils/constants";

interface Step {
  state: string;
  label: string;
  step: number;
}

interface WorkflowStepperProps {
  currentState: string;
  steps: Step[];
  orientation?: "horizontal" | "vertical";
  className?: string;
}

function getStepStatus(step: Step, currentStep: number, isTerminated?: boolean) {
  if (isTerminated) return "error";
  if (step.step < currentStep) return "done";
  if (step.step === currentStep) return "active";
  return "upcoming";
}

export function WorkflowStepper({
  currentState,
  steps,
  orientation = "horizontal",
  className,
}: WorkflowStepperProps) {
  const currentStep = steps.find((s) => s.state === currentState)?.step ?? 0;
  const isTerminated = currentState === "terminated" || currentState === "rejected";

  return (
    <nav
      aria-label="Workflow progress"
      className={cn(
        orientation === "horizontal"
          ? "flex items-start"
          : "flex flex-col gap-2",
        className,
      )}
    >
      {steps.map((step, idx) => {
        const status = getStepStatus(step, currentStep, isTerminated);
        const isLast = idx === steps.length - 1;

        return (
          <div
            key={step.state}
            className={cn(
              orientation === "horizontal"
                ? "flex flex-1 items-start"
                : "flex items-center gap-3",
            )}
          >
            {/* Step circle */}
            <div className={cn(orientation === "horizontal" && "flex flex-col items-center flex-1")}>
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold transition-all duration-200",
                  // Done: white bg, teal border + teal check — clean tick-box feel
                  status === "done" &&
                    "border-primary bg-white dark:bg-card text-primary shadow-sm",
                  // Active: solid teal fill — clearly the current step
                  status === "active" &&
                    "border-emerald-600 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-bold shadow-md ring-4 ring-emerald-500/20",
                  // Upcoming: subtle grey — not done yet, not in the way
                  status === "upcoming" &&
                    "border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500",
                  status === "error" &&
                    "border-destructive bg-destructive text-destructive-foreground",
                )}
                aria-current={status === "active" ? "step" : undefined}
              >
                {status === "done" ? (
                  <Check className="h-3.5 w-3.5 stroke-[2.5]" aria-label="Completed" />
                ) : (
                  <span aria-hidden="true">{step.step}</span>
                )}
              </div>

              {/* Label */}
              <span
                className={cn(
                  "mt-1.5 text-[10px] font-medium text-center leading-tight max-w-[56px] break-words",
                  status === "active" && "text-primary font-semibold",
                  status === "done" && "text-primary/70",
                  status === "upcoming" && "text-slate-400 dark:text-slate-500",
                  orientation === "vertical" && "mt-0 max-w-none text-left text-xs",
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {!isLast && orientation === "horizontal" && (
              <div
                className={cn(
                  "flex-1 mt-3.5 h-0.5 mx-1 rounded-full transition-all duration-300",
                  step.step < currentStep
                    ? "bg-primary"
                    : "bg-slate-200 dark:bg-slate-700",
                )}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}

      {/* Terminated badge */}
      {isTerminated && (
        <div className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-bold">
          !
        </div>
      )}
    </nav>
  );
}

export function LeaseWorkflowStepper({
  state,
  className,
}: {
  state: LeaseState;
  className?: string;
}) {
  return (
    <WorkflowStepper
      currentState={state}
      steps={LEASE_STEPS as unknown as Step[]}
      className={className}
    />
  );
}

export function OnboardingWorkflowStepper({
  state,
  className,
}: {
  state: OnboardingState;
  className?: string;
}) {
  return (
    <WorkflowStepper
      currentState={state}
      steps={ONBOARDING_STEPS as unknown as Step[]}
      className={className}
    />
  );
}

export function PaymentFlowStepper({
  step,
  className,
}: {
  step: OnboardingStep;
  className?: string;
}) {
  return (
    <WorkflowStepper
      currentState={step}
      steps={PAYMENT_FLOW_STEPS as unknown as Step[]}
      className={className}
    />
  );
}

/**
 * Single unified stepper shown throughout the entire onboarding wizard.
 * `journeyState` must be one of the states from FULL_ONBOARDING_JOURNEY_STEPS.
 */
export function FullOnboardingJourneyStepper({
  journeyState,
  className,
}: {
  journeyState: string;
  className?: string;
}) {
  return (
    <WorkflowStepper
      currentState={journeyState}
      steps={FULL_ONBOARDING_JOURNEY_STEPS as unknown as Step[]}
      className={className}
    />
  );
}
