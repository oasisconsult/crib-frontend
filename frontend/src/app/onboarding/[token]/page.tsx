"use client";

import { use } from "react";
import { Building2 } from "lucide-react";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { useOnboardingByToken } from "@/hooks/useTenants";

interface Props {
  params: Promise<{ token: string }>;
}

export default function OnboardingPage({ params }: Props) {
  const { token } = use(params);
  const { data: invite, isLoading, error } = useOnboardingByToken(token);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
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
        ) : error || !invite ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
            <h2 className="text-lg font-semibold text-destructive">Invalid or Expired Link</h2>
            <p className="text-sm text-muted-foreground mt-2">
              This onboarding link is no longer valid. Please contact your landlord for a new
              invitation.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">Welcome to Crib</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Hi <span className="font-medium text-foreground">{invite.name}</span>! Complete
                your profile to activate your tenancy.
              </p>
            </div>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <OnboardingWizard token={token} invite={invite} tenant={null as any} />
          </>
        )}
      </div>
    </div>
  );
}
