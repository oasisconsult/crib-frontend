"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { CheckCircle, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  useSubmitOnboarding,
  useSaveOnboardingDraft,
} from "@/hooks/useTenants";
import { usePreviewAgreement } from "@/hooks/useOnboardingFlow";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileUpload } from "@/components/common/FileUpload";
import type { UploadResult } from "@/services/api/uploads";
import { ESignatureCanvas } from "./ESignatureCanvas";
import { FullOnboardingJourneyStepper } from "@/components/leases/WorkflowStepper";
import { AgreementPreviewStep } from "./steps/AgreementPreviewStep";
import { TermsAcceptanceStep } from "./steps/TermsAcceptanceStep";
import { PaymentStep } from "./steps/PaymentStep";
import { PaymentPendingStep } from "./steps/PaymentPendingStep";
import { PaymentSuccessStep } from "./steps/PaymentSuccessStep";
import { FinalSignatureStep } from "./steps/FinalSignatureStep";
import type { Tenant, TenantInvite, TenantDocument } from "@/types";
import type { AgreementPreview, OnboardingStep } from "@/types/onboarding";

// ── Phase 1 (profile collection) steps ────────────────────────────────────────
type ProfileStep = "profile" | "documents" | "submitted";
const PROFILE_STEPS: ProfileStep[] = ["profile", "documents", "submitted"];

// ── Phase 2 (payment flow) steps ──────────────────────────────────────────────
const PAYMENT_STEPS: OnboardingStep[] = [
  "agreement_preview",
  "terms_acceptance",
  "payment",
  "payment_pending",
  "payment_success",
  "signature",
  "done",
];

const profileSchema = z.object({
  firstName: z.string().min(2, "First name required"),
  lastName: z.string().min(2, "Last name required"),
  phone: z.string().min(7, "Valid phone number required"),
  dateOfBirth: z.string().optional(),
  nationality: z.string().optional(),
  nin: z.string().optional(),
  whatsappNumber: z.string().optional(),
  mobileMoneyProvider: z.enum(["mtn", "airtel", ""]).optional(),
  mobileMoneyNumber: z.string().optional(),
});

type ProfileValues = z.infer<typeof profileSchema>;

function docToUploadResult(doc: TenantDocument): UploadResult {
  return {
    key: doc.url,
    url: doc.url,
    name: doc.name,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
  };
}

/** Map backend lease.status → which payment-flow step to show on resume. */
const LEASE_STATUS_TO_STEP: Record<string, OnboardingStep> = {
  draft: "agreement_preview",
  onboarding_started: "agreement_preview",
  agreement_previewed: "terms_acceptance",
  terms_accepted: "payment",
  payment_pending: "payment_pending",
  payment_secured: "payment_success",
  agreement_signed: "done",
  active: "done",
};

interface OnboardingWizardProps {
  token: string;
  invite: TenantInvite;
  tenant: Tenant;
  /** Pre-loaded agreement preview from GET /flow (may be null). */
  agreementPreview?: AgreementPreview | null;
  /** Backend lease status for resuming payment flow. */
  leaseStatus?: string | null;
  /** ISO timestamp when tenant accepted the terms (from GET /flow). */
  termsAcceptedAt?: string | null;
}

export function OnboardingWizard({
  token,
  invite,
  tenant,
  agreementPreview: initialPreview = null,
  leaseStatus,
  termsAcceptedAt: initialTermsAcceptedAt = null,
}: OnboardingWizardProps) {
  // ── Phase determination ───────────────────────────────────────────────────
  const isApproved = ["approved", "activated"].includes(tenant.onboardingState);
  const isActivated = tenant.onboardingState === "activated";

  // ── Phase 1 (profile) state ───────────────────────────────────────────────
  const isResubmit = ["submitted", "approved", "rejected"].includes(
    tenant.onboardingState,
  );
  const draftStep = (tenant.onboardingDraft?.step ?? "profile") as ProfileStep;
  const validDraftStep: ProfileStep =
    PROFILE_STEPS.includes(draftStep) && draftStep !== "submitted"
      ? draftStep
      : "profile";
  const [profileStep, setProfileStep] = useState<ProfileStep>(
    isResubmit ? "profile" : validDraftStep,
  );

  // ── Phase 2 (payment flow) state ──────────────────────────────────────────
  const initialPaymentStep: OnboardingStep = (() => {
    if (isActivated) return "done";
    if (!isApproved) return "agreement_preview";
    if (leaseStatus && leaseStatus in LEASE_STATUS_TO_STEP) {
      return LEASE_STATUS_TO_STEP[leaseStatus];
    }
    return "agreement_preview";
  })();
  const [paymentStep, setPaymentStep] =
    useState<OnboardingStep>(initialPaymentStep);
  const [preview, setPreview] = useState<AgreementPreview | null>(
    initialPreview,
  );
  const [termsAcceptedAt, setTermsAcceptedAt] = useState<string | null>(
    initialTermsAcceptedAt,
  );

  // Sync preview when the parent refetches flow status (e.g. after accepting terms
  // the query invalidates and data.agreementPreview arrives with the snapshot).
  // Only update if the incoming snapshot is newer — avoids overwriting a just-fetched one.
  const initialPreviewRef = useRef(initialPreview);
  useEffect(() => {
    if (initialPreview && initialPreview !== initialPreviewRef.current) {
      initialPreviewRef.current = initialPreview;
      setPreview(initialPreview);
    }
  }, [initialPreview]);

  // Auto-fetch preview when we land on the payment step with no preview loaded.
  // This covers the resume case: terms_accepted → payment, but snapshot wasn't
  // in the initial flow response (or user navigated here without going through
  // AgreementPreviewStep in this session).
  const { mutate: fetchPreviewForPayment, isPending: isFetchingPreview } =
    usePreviewAgreement(token);
  const hasFetchedPreviewRef = useRef(false);
  useEffect(() => {
    if (
      paymentStep === "payment" &&
      !preview &&
      !hasFetchedPreviewRef.current
    ) {
      hasFetchedPreviewRef.current = true;
      fetchPreviewForPayment(undefined, { onSuccess: setPreview });
    }
  }, [paymentStep, preview, fetchPreviewForPayment]);

  // ── Profile form ──────────────────────────────────────────────────────────
  const draft = tenant.onboardingDraft;
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: tenant.firstName ?? "",
      lastName: tenant.lastName ?? "",
      phone: draft?.phone ?? tenant.phone ?? "",
      dateOfBirth: draft?.dateOfBirth ?? tenant.dateOfBirth ?? "",
      nationality: draft?.nationality ?? tenant.nationality ?? "",
      nin: draft?.nin ?? (tenant as any).nin ?? "",
      whatsappNumber:
        draft?.whatsappNumber ?? (tenant as any).whatsappNumber ?? "",
      mobileMoneyProvider:
        draft?.mobileMoneyProvider ?? (tenant as any).mobileMoneyProvider ?? "",
      mobileMoneyNumber:
        draft?.mobileMoneyNumber ?? (tenant as any).mobileMoneyNumber ?? "",
    },
  });

  const [uploadedDocs, setUploadedDocs] = useState<UploadResult[]>(() =>
    (tenant.documents ?? []).map(docToUploadResult),
  );
  const [signature, setSignature] = useState<string | null>(null);

  const { mutate: submit, isPending } = useSubmitOnboarding();
  const { mutate: saveDraft } = useSaveOnboardingDraft();

  // ── Draft auto-save ───────────────────────────────────────────────────────
  const persistDraft = useCallback(
    (toStep: ProfileStep) => {
      if (toStep === "submitted") return;
      const {
        phone,
        dateOfBirth,
        nationality,
        nin,
        whatsappNumber,
        mobileMoneyProvider,
        mobileMoneyNumber,
      } = form.getValues();
      saveDraft({
        token,
        draft: {
          step: toStep,
          phone,
          dateOfBirth,
          nationality,
          nin,
          whatsappNumber,
          mobileMoneyProvider,
          mobileMoneyNumber,
        },
      });
    },
    [form, saveDraft, token],
  );

  useEffect(() => {
    if (profileStep === "submitted" || isApproved) return;
    const id = setInterval(() => persistDraft(profileStep), 60_000);
    return () => clearInterval(id);
  }, [profileStep, persistDraft, isApproved]);

  // ── Profile submission ────────────────────────────────────────────────────
  const handleFinalSubmit = () => {
    const {
      firstName,
      lastName,
      phone,
      dateOfBirth,
      nationality,
      nin,
      whatsappNumber,
      mobileMoneyProvider,
      mobileMoneyNumber,
    } = form.getValues();
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
          nin: nin || undefined,
          whatsappNumber: whatsappNumber || undefined,
          mobileMoneyProvider: mobileMoneyProvider || undefined,
          mobileMoneyNumber: mobileMoneyNumber || undefined,
          gdprConsent: true,
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
      { onSuccess: () => setProfileStep("submitted") },
    );
  };

  // ── Unified journey state (for the 9-step stepper shown at all phases) ──────
  const journeyState = (() => {
    if (isActivated || paymentStep === "done") return "activated";
    if (isApproved && invite.leaseId) {
      if (paymentStep === "signature") return "signature";
      if (
        ["payment", "payment_pending", "payment_success"].includes(paymentStep)
      )
        return "payment";
      if (paymentStep === "terms_acceptance") return "terms_acceptance";
      return "agreement_preview";
    }
    // Approved but no lease yet — waiting for landlord to link a lease
    if (isApproved || tenant.onboardingState === "submitted")
      return "under_review";
    if (profileStep === "submitted") return "under_review";
    if (profileStep === "documents") return "documents";
    if (tenant.onboardingState === "invited") return "invited";
    return "profile";
  })();

  // ── Progress ──────────────────────────────────────────────────────────────
  const TOTAL_JOURNEY_STEPS = 9; // matches FULL_ONBOARDING_JOURNEY_STEPS length
  const journeyStepNumber =
    {
      invited: 1,
      profile: 2,
      documents: 3,
      under_review: 4,
      agreement_preview: 5,
      terms_acceptance: 6,
      payment: 7,
      signature: 8,
      activated: 9,
    }[journeyState] ?? 1;
  const progress = ((journeyStepNumber - 1) / (TOTAL_JOURNEY_STEPS - 1)) * 100;

  // ── Rejection banner ──────────────────────────────────────────────────────
  const resubmitBanner = isResubmit && !isApproved && (
    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-200 dark:bg-amber-100/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
      {tenant.onboardingState === "rejected" ? (
        <>
          Your application needs corrections.
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
    <div className="w-full space-y-6">
      {journeyState !== "activated" && (
        <div className="space-y-2 max-w-3xl mx-auto">
          <Progress value={progress} className="h-2" />
          <FullOnboardingJourneyStepper journeyState={journeyState} />
        </div>
      )}

      {resubmitBanner && (
        <div className="max-w-lg mx-auto">{resubmitBanner}</div>
      )}

      {/* ── PHASE 1: Profile collection ──────────────────────────────── */}
      {!isApproved && (
        <div className="max-w-lg mx-auto space-y-6">
          {profileStep === "profile" && (
            <Card>
              <CardHeader>
                <CardTitle>Your Details</CardTitle>
                <CardDescription>Tell us a bit about yourself</CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={form.handleSubmit(() => {
                    persistDraft("documents");
                    setProfileStep("documents");
                  })}
                  className="space-y-4"
                >
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
                  <div className="space-y-1.5">
                    <Label htmlFor="whatsappNumber">
                      WhatsApp / Contact Number
                    </Label>
                    <Input
                      id="whatsappNumber"
                      type="tel"
                      placeholder="+256 700 000000"
                      {...form.register("whatsappNumber")}
                    />
                    <p className="text-xs text-muted-foreground">
                      Used as your contact number on the tenancy agreement
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nin">National ID Number (NIN)</Label>
                    <Input
                      id="nin"
                      placeholder="e.g. CM12345678ABCDE"
                      {...form.register("nin")}
                    />
                    <p className="text-xs text-muted-foreground">
                      Your NIN will appear on the tenancy agreement
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Mobile Money</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="mobileMoneyProvider"
                          className="text-xs text-muted-foreground"
                        >
                          Provider
                        </Label>
                        <Select
                          value={form.watch("mobileMoneyProvider") ?? ""}
                          onValueChange={(v) =>
                            form.setValue(
                              "mobileMoneyProvider",
                              v as "mtn" | "airtel" | "",
                            )
                          }
                        >
                          <SelectTrigger id="mobileMoneyProvider">
                            <SelectValue placeholder="Select provider" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="mtn">
                              MTN Mobile Money
                            </SelectItem>
                            <SelectItem value="airtel">Airtel Money</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="mobileMoneyNumber"
                          className="text-xs text-muted-foreground"
                        >
                          Number
                        </Label>
                        <Input
                          id="mobileMoneyNumber"
                          type="tel"
                          placeholder="+256 770 000000"
                          {...form.register("mobileMoneyNumber")}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="dob">Date of Birth</Label>
                      <Input
                        id="dob"
                        type="date"
                        {...form.register("dateOfBirth")}
                      />
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

          {profileStep === "documents" && (
            <Card>
              <CardHeader>
                <CardTitle>Upload Documents</CardTitle>
                <CardDescription>
                  ID and proof of income required.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {uploadedDocs.length > 0 && (
                  <div className="rounded-md border border-primary/15 bg-primary/5 px-3 py-2 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Uploaded files
                    </p>
                    {uploadedDocs.map((d) => (
                      <div
                        key={d.key}
                        className="flex items-center justify-between text-sm"
                      >
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
                      const existing = new Set(prev.map((d) => d.url));
                      return [
                        ...prev,
                        ...results.filter((r) => !existing.has(r.url)),
                      ];
                    })
                  }
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setProfileStep("profile")}
                  >
                    ← Back
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleFinalSubmit}
                    disabled={uploadedDocs.length === 0 || isPending}
                    loading={isPending}
                  >
                    {isResubmit
                      ? "Update & Resubmit ✓"
                      : "Submit Application ✓"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {profileStep === "submitted" && (
            <Card className="text-center">
              <CardContent className="pt-8 pb-8 space-y-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-100/40 mx-auto">
                  <Clock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">
                    {isResubmit
                      ? "Application Updated!"
                      : "Application Submitted!"}
                  </h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    Your landlord will review your application. You&apos;ll
                    receive a link to proceed with payment once approved.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setProfileStep("profile")}
                  className="mx-auto"
                >
                  ← Edit Application
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Pending approval gate ─────────────────────────────────────── */}
      {isApproved && !invite.leaseId && paymentStep !== "done" && (
        <div className="max-w-lg mx-auto">
          <Card className="text-center">
            <CardContent className="pt-8 pb-8 space-y-3">
              <Clock className="h-10 w-10 text-amber-500 mx-auto" />
              <h2 className="text-lg font-semibold">Waiting for lease setup</h2>
              <p className="text-muted-foreground text-sm">
                Your application has been approved. Your landlord is preparing
                your lease — you&apos;ll receive a new link shortly.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── PHASE 2: Payment flow ─────────────────────────────────────── */}
      {isApproved && invite.leaseId && (
        <>
          {/* Agreement preview uses full available width so the document is readable */}
          {paymentStep === "agreement_preview" && (
            <AgreementPreviewStep
              token={token}
              preview={preview}
              onNext={(loadedPreview) => {
                setPreview(loadedPreview);
                setPaymentStep("terms_acceptance");
              }}
            />
          )}

          {/* All other payment steps — centred at max-w-2xl to match the stepper width */}
          {paymentStep !== "agreement_preview" && (
            <div className="max-w-2xl mx-auto space-y-6">
              {paymentStep === "terms_acceptance" && (
                <TermsAcceptanceStep
                  token={token}
                  onNext={(acceptedAt) => {
                    setTermsAcceptedAt(acceptedAt);
                    setPaymentStep("payment");
                  }}
                  onBack={() => setPaymentStep("agreement_preview")}
                />
              )}

              {paymentStep === "payment" &&
                (preview ? (
                  <PaymentStep
                    token={token}
                    leaseId={invite.leaseId!}
                    tenantId={tenant.id}
                    preview={preview}
                    onNext={() => setPaymentStep("payment_pending")}
                    onBack={() => setPaymentStep("terms_acceptance")}
                  />
                ) : isFetchingPreview ? (
                  <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
                    <Loader2 className="h-7 w-7 animate-spin" />
                    <p className="text-sm">Loading payment details…</p>
                  </div>
                ) : (
                  /* Fallback: fetch failed — let user retry via back */
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
                    <p className="text-sm text-destructive font-medium">
                      Unable to load payment details.
                    </p>
                    <button
                      type="button"
                      className="text-sm text-primary hover:underline"
                      onClick={() => {
                        hasFetchedPreviewRef.current = false;
                        fetchPreviewForPayment(undefined, {
                          onSuccess: setPreview,
                        });
                      }}
                    >
                      Try again
                    </button>
                  </div>
                ))}

              {paymentStep === "payment_pending" && (
                <PaymentPendingStep
                  token={token}
                  onPaymentSecured={() => setPaymentStep("payment_success")}
                />
              )}

              {paymentStep === "payment_success" && preview && (
                <PaymentSuccessStep
                  preview={preview}
                  onNext={() => setPaymentStep("signature")}
                />
              )}

              {paymentStep === "signature" && preview && (
                <FinalSignatureStep
                  token={token}
                  preview={preview}
                  termsAcceptedAt={termsAcceptedAt}
                  onSigned={() => setPaymentStep("done")}
                  onBack={() => setPaymentStep("payment_success")}
                />
              )}

              {paymentStep === "done" && (
                <Card className="text-center">
                  <CardContent className="pt-8 pb-8 space-y-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-100/40 mx-auto">
                      <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">
                        Your Tenancy is Active!
                      </h2>
                      <p className="text-muted-foreground text-sm mt-1">
                        Welcome home. Your tenancy at{" "}
                        <strong>
                          {invite.propertyName ?? invite.propertyId}
                        </strong>
                        {invite.unitName && (
                          <>
                            {" "}
                            — <strong>{invite.unitName}</strong>
                          </>
                        )}{" "}
                        is now active. Check your email for your tenancy
                        agreement.
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Questions? Contact your landlord at{" "}
                      <strong>{invite.email}</strong>
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
