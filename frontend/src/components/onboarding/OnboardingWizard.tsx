"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useSubmitOnboarding, useSaveOnboardingDraft } from "@/hooks/useTenants";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileUpload } from "@/components/common/FileUpload";
import type { UploadResult } from "@/services/api/uploads";
import { ESignatureCanvas } from "./ESignatureCanvas";
import { OnboardingWorkflowStepper } from "@/components/leases/WorkflowStepper";
import type { Tenant, TenantInvite, TenantDocument } from "@/types";

type WizardStep = "profile" | "documents" | "signature" | "done";

const STEPS: WizardStep[] = ["profile", "documents", "signature", "done"];

const profileSchema = z.object({
  firstName: z.string().min(2, "First name required"),
  lastName: z.string().min(2, "Last name required"),
  phone: z.string().min(7, "Valid phone number required"),
  dateOfBirth: z.string().optional(),
  nationality: z.string().optional(),
});

type ProfileValues = z.infer<typeof profileSchema>;

/** Convert a TenantDocument row (already persisted) into an UploadResult shape. */
function docToUploadResult(doc: TenantDocument): UploadResult {
  return {
    key: doc.url, // use URL as key — it's the stable identifier for persisted docs
    url: doc.url,
    name: doc.name,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
  };
}

interface OnboardingWizardProps {
  token: string;
  invite: TenantInvite;
  tenant: Tenant;
}

export function OnboardingWizard({ token, invite, tenant }: OnboardingWizardProps) {
  // Determine starting step: from server draft, else "profile"
  const draftStep = (tenant.onboardingDraft?.step ?? "profile") as WizardStep;
  const validDraftStep: WizardStep =
    STEPS.includes(draftStep) && draftStep !== "done" ? draftStep : "profile";

  // If tenant has already submitted, allow revisit but start at profile for easy re-edit
  const isResubmit = ["submitted", "approved", "rejected"].includes(tenant.onboardingState);
  const initialStep: WizardStep = isResubmit ? "profile" : validDraftStep;

  const [step, setStep] = useState<WizardStep>(initialStep);

  // Pre-populate uploaded docs from already-persisted TenantDocument rows
  const [uploadedDocs, setUploadedDocs] = useState<UploadResult[]>(
    () => (tenant.documents ?? []).map(docToUploadResult),
  );
  const [signature, setSignature] = useState<string | null>(null);

  const { mutate: submit, isPending } = useSubmitOnboarding();
  const { mutate: saveDraft } = useSaveOnboardingDraft();

  const stepIndex = STEPS.indexOf(step);
  const progress = (stepIndex / (STEPS.length - 1)) * 100;

  // ── Profile form ──────────────────────────────────────────────────────────
  // Merge tenant record fields with any more-recent draft values
  const draft = tenant.onboardingDraft;
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName:   tenant.firstName ?? "",
      lastName:    tenant.lastName ?? "",
      phone:       draft?.phone       ?? tenant.phone       ?? "",
      dateOfBirth: draft?.dateOfBirth ?? tenant.dateOfBirth ?? "",
      nationality: draft?.nationality ?? tenant.nationality ?? "",
    },
  });

  // ── Server-side draft save ─────────────────────────────────────────────────
  const persistDraft = useCallback(
    (toStep: WizardStep) => {
      if (toStep === "done") return;
      const { phone, dateOfBirth, nationality } = form.getValues();
      saveDraft({
        token,
        draft: { step: toStep, phone, dateOfBirth, nationality },
      });
    },
    [form, saveDraft, token],
  );

  // Auto-save current step every 60 s
  useEffect(() => {
    if (step === "done") return;
    const id = setInterval(() => persistDraft(step), 60_000);
    return () => clearInterval(id);
  }, [step, persistDraft]);

  // ── Navigation helpers ─────────────────────────────────────────────────────
  function goTo(next: WizardStep) {
    persistDraft(next);
    setStep(next);
  }

  const handleProfileNext = form.handleSubmit(() => goTo("documents"));

  const handleFinalSubmit = () => {
    const { firstName, lastName, phone, dateOfBirth, nationality } = form.getValues();
    submit(
      {
        token,
        data: {
          firstName,
          lastName,
          email: tenant.email,
          phone,
          dateOfBirth,
          nationality,
          gdprConsent: true,
          // Pass ALL uploaded docs; backend deduplicates by URL
          documents: uploadedDocs.map((r) => ({
            type: "other" as const,
            name: r.name,
            url: r.url,
            key: r.key,
            mimeType: r.mimeType,
            sizeBytes: r.sizeBytes,
          })),
        },
      },
      { onSuccess: () => setStep("done") },
    );
  };

  const resubmitBanner = isResubmit && step !== "done" && (
    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
      {tenant.onboardingState === "rejected" ? (
        <>
          Your application was reviewed and needs corrections. Please update your
          details and resubmit.
          {tenant.rejectionReason && (
            <p className="mt-1 font-medium">Reason: {tenant.rejectionReason}</p>
          )}
        </>
      ) : (
        "You can review and update your information below, then resubmit."
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white dark:from-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white font-bold text-xl mx-auto">
            C
          </div>
          <h1 className="text-2xl font-bold tracking-tight mt-3">Welcome to Crib</h1>
          <p className="text-muted-foreground text-sm">
            Complete your onboarding for <strong>{invite.propertyId}</strong>
          </p>
        </div>

        {step !== "done" && (
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <OnboardingWorkflowStepper
              state={
                step === "profile" ? "started" :
                step === "documents" ? "started" :
                step === "signature" ? "submitted" : "approved"
              }
            />
          </div>
        )}

        {resubmitBanner}

        {/* ── Profile ──────────────────────────────────────────────────── */}
        {step === "profile" && (
          <Card>
            <CardHeader>
              <CardTitle>Your Details</CardTitle>
              <CardDescription>Tell us a bit about yourself</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProfileNext} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input
                      id="firstName"
                      error={!!form.formState.errors.firstName}
                      {...form.register("firstName")}
                    />
                    {form.formState.errors.firstName && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.firstName.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input
                      id="lastName"
                      error={!!form.formState.errors.lastName}
                      {...form.register("lastName")}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+256 700 000000"
                    error={!!form.formState.errors.phone}
                    {...form.register("phone")}
                  />
                  {form.formState.errors.phone && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.phone.message}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="dob">Date of Birth</Label>
                    <Input id="dob" type="date" {...form.register("dateOfBirth")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nationality">Nationality</Label>
                    <Input
                      id="nationality"
                      placeholder="Ugandan"
                      {...form.register("nationality")}
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full">
                  Next: Documents →
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* ── Documents ────────────────────────────────────────────────── */}
        {step === "documents" && (
          <Card>
            <CardHeader>
              <CardTitle>Upload Documents</CardTitle>
              <CardDescription>
                ID and proof of income required. All files are encrypted.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Show previously uploaded documents */}
              {uploadedDocs.length > 0 && (
                <div className="rounded-md border bg-muted/30 px-3 py-2 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Uploaded files
                  </p>
                  {uploadedDocs.map((d) => (
                    <div key={d.key} className="flex items-center justify-between text-sm">
                      <span className="truncate">{d.name}</span>
                      <span className="text-xs text-muted-foreground ml-2 shrink-0">
                        {(d.sizeBytes / 1024).toFixed(0)} KB
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <FileUpload
                category="document"
                tenantId={tenant.id}
                onboardingToken={token}
                maxFiles={5}
                onUpload={(results) =>
                  setUploadedDocs((prev) => {
                    // Deduplicate by URL
                    const existing = new Set(prev.map((d) => d.url));
                    return [...prev, ...results.filter((r) => !existing.has(r.url))];
                  })
                }
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => goTo("profile")}>
                  ← Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => goTo("signature")}
                  disabled={uploadedDocs.length === 0}
                >
                  Next: Sign Agreement →
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Signature ────────────────────────────────────────────────── */}
        {step === "signature" && (
          <Card>
            <CardHeader>
              <CardTitle>Sign the Agreement</CardTitle>
              <CardDescription>
                Draw your signature below to confirm your details are correct
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ESignatureCanvas onSave={setSignature} />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => goTo("documents")}>
                  ← Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleFinalSubmit}
                  disabled={!signature}
                  loading={isPending}
                >
                  {isResubmit ? "Update & Resubmit ✓" : "Submit Onboarding ✓"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Done ─────────────────────────────────────────────────────── */}
        {step === "done" && (
          <Card className="text-center">
            <CardContent className="pt-8 pb-8 space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 mx-auto">
                <CheckCircle className="h-8 w-8 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold">
                  {isResubmit ? "Application Updated!" : "Onboarding Submitted!"}
                </h2>
                <p className="text-muted-foreground text-sm mt-1">
                  Your landlord will review your application and activate your account
                  within 24 hours.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                You&apos;ll receive a confirmation email at{" "}
                <strong>{invite.email}</strong>
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
