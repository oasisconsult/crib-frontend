"use client";

import { use } from "react";
import { Building2, Clock, LinkIcon } from "lucide-react";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { useOnboardingFlowStatus } from "@/hooks/useOnboardingFlow";

interface Props {
  params: Promise<{ token: string }>;
}

function isExpiredError(err: unknown): boolean {
  if (err && typeof err === "object" && "status" in err) {
    return (err as { status: number }).status === 410;
  }
  const anyErr = err as Record<string, unknown>;
  const resp = anyErr?.response as Record<string, unknown> | undefined;
  return resp?.status === 410;
}

export default function OnboardingPage({ params }: Props) {
  const { token } = use(params);
  const { data, isLoading, error } = useOnboardingFlowStatus(token);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 px-4 py-6 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-8">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Building2 className="h-4 w-4" />
          </div>
          <span className="text-xl font-bold tracking-tight gradient-text">Crib</span>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <div className="h-8 w-64 bg-muted rounded animate-pulse" />
            <div className="h-4 w-48 bg-muted rounded animate-pulse" />
            <div className="h-96 bg-muted rounded-xl animate-pulse" />
          </div>
        ) : error ? (
          isExpiredError(error) ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-8 text-center space-y-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 mx-auto">
                <Clock className="h-7 w-7 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-amber-800 dark:text-amber-200">
                  Your invite link has expired
                </h2>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-2 max-w-sm mx-auto">
                  Onboarding links are valid for 72 hours. Please contact your landlord or
                  property manager to request a new link — your previously entered information
                  is safely saved and will be pre-filled when you return.
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/50 px-3 py-1.5 rounded-full">
                <LinkIcon className="h-3 w-3" />
                Ask your landlord to resend your invite from the Crib dashboard
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center space-y-2">
              <h2 className="text-lg font-semibold text-destructive">Invalid Link</h2>
              <p className="text-sm text-muted-foreground">
                This onboarding link is not recognised. Please check the link in your
                invitation email or contact your landlord for a new one.
              </p>
            </div>
          )
        ) : !data ? null : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">Welcome to Crib</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Hi <span className="font-medium text-foreground">{data.invite.name}</span>!{" "}
                {data.isActive
                  ? "Your tenancy is active."
                  : data.onboardingPhase === "payment_flow"
                  ? "Complete your payment and sign your agreement to activate your tenancy."
                  : ["submitted", "approved"].includes(data.tenant.onboardingState)
                  ? "Review or update your details below."
                  : "Complete your profile to begin."}
              </p>
            </div>
            <OnboardingWizard
              token={token}
              invite={data.invite}
              tenant={data.tenant}
              agreementPreview={data.agreementPreview}
              leaseStatus={data.lease?.state ?? null}
              termsAcceptedAt={data.termsAcceptedAt}
            />
          </>
        )}
      </div>
    </div>
  );
}
