"use client";

import { use, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Building2,
  Clock,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Mail,
  User,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { agencyInvitesApi } from "@/services/api/agencyInvites";

interface Props {
  params: Promise<{ token: string }>;
}

type Step = "welcome" | "agency" | "manager" | "review" | "success";
const STEPS: Step[] = ["welcome", "agency", "manager", "review"];

function isExpiredError(err: unknown): boolean {
  const resp = (err as Record<string, unknown>)?.response as
    | Record<string, unknown>
    | undefined;
  return resp?.status === 410 || (err as { status?: number })?.status === 410;
}

function StepIndicator({ current }: { current: Step }) {
  const labels: Record<Step, string> = {
    welcome: "Welcome",
    agency: "Agency",
    manager: "Manager",
    review: "Review",
    success: "Done",
  };
  const visible: Step[] = ["welcome", "agency", "manager", "review"];
  const ci = visible.indexOf(current);
  return (
    <div className="flex items-center gap-2 mb-8">
      {visible.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
              current === s
                ? "bg-primary text-primary-foreground"
                : i < ci
                  ? "bg-emerald-600 text-white"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {i < ci ? "✓" : i + 1}
          </div>
          <span
            className={`text-xs hidden sm:block ${
              current === s ? "text-foreground font-medium" : "text-muted-foreground"
            }`}
          >
            {labels[s]}
          </span>
          {i < visible.length - 1 && <div className="h-px w-5 bg-border" />}
        </div>
      ))}
    </div>
  );
}

export default function AgencyOnboardingPage({ params }: Props) {
  const { token } = use(params);

  const { data, isLoading, error } = useQuery({
    queryKey: ["agency-onboarding", token],
    queryFn: () => agencyInvitesApi.getOnboarding(token),
    retry: false,
  });

  const [step, setStep] = useState<Step>("welcome");

  const [agencyForm, setAgencyForm] = useState({
    agencyName: "",
    agencyPhone: "",
    agencyContactEmail: "",
    agencyCountry: "",
    agencyCurrency: "UGX",
    agencyAddress: "",
  });

  const [managerForm, setManagerForm] = useState({
    managerFirstName: "",
    managerLastName: "",
  });

  // Seed from invite data
  useEffect(() => {
    if (data) {
      setAgencyForm({
        agencyName: data.agencyName,
        agencyPhone: data.agencyPhone ?? "",
        agencyContactEmail: data.agencyContactEmail ?? "",
        agencyCountry: data.agencyCountry ?? "",
        agencyCurrency: data.agencyCurrency ?? "UGX",
        agencyAddress: data.agencyAddress ?? "",
      });
      setManagerForm({
        managerFirstName: data.managerFirstName,
        managerLastName: data.managerLastName,
      });
    }
  }, [data]);

  const { mutate: complete, isPending: completing, error: completeError } = useMutation({
    mutationFn: () =>
      agencyInvitesApi.completeOnboarding(token, {
        agencyName: agencyForm.agencyName,
        managerFirstName: managerForm.managerFirstName,
        managerLastName: managerForm.managerLastName,
        agencyPhone: agencyForm.agencyPhone || undefined,
        agencyContactEmail: agencyForm.agencyContactEmail || undefined,
        agencyCountry: agencyForm.agencyCountry || undefined,
        agencyCurrency: agencyForm.agencyCurrency || undefined,
        agencyAddress: agencyForm.agencyAddress || undefined,
      }),
    onSuccess: () => setStep("success"),
  });

  const agencyValid = !!agencyForm.agencyName;
  const managerValid = !!managerForm.managerFirstName && !!managerForm.managerLastName;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 px-4 py-8 sm:px-6">
      <div className="max-w-lg mx-auto">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-10">
          <div className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-primary text-primary-foreground">
            <Building2 className="h-4 w-4" />
          </div>
          <span className="text-xl font-bold tracking-tight">Crib</span>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-4">
            <div className="h-7 w-56 skeleton-shimmer rounded" />
            <div className="h-4 w-40 skeleton-shimmer rounded" />
            <div className="h-80 skeleton-shimmer rounded-[6px]" />
          </div>
        )}

        {/* Error states */}
        {!isLoading && error && (
          isExpiredError(error) ? (
            <div className="rounded-[6px] border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-8 text-center space-y-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 mx-auto">
                <Clock className="h-7 w-7 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-amber-800 dark:text-amber-200">
                  This invite has expired
                </h2>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-2 max-w-sm mx-auto">
                  Agency invite links are valid for 14 days. Please contact Crib support
                  to request a new invite.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-[6px] border border-destructive/30 bg-destructive/5 p-8 text-center space-y-2">
              <h2 className="text-lg font-semibold text-destructive">Invalid Link</h2>
              <p className="text-sm text-muted-foreground">
                This invite link is not recognised or has already been used.
                Contact Crib support for assistance.
              </p>
            </div>
          )
        )}

        {/* Steps */}
        {!isLoading && !error && data && (
          <>
            {step !== "success" && <StepIndicator current={step} />}

            {/* ── Welcome ── */}
            {step === "welcome" && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Welcome to Crib</CardTitle>
                  <CardDescription>
                    You've been invited to set up{" "}
                    <strong>{data.agencyName}</strong> on the Crib property
                    management platform.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="rounded-[6px] bg-muted/60 border border-border p-4 space-y-3 text-sm">
                    <p className="font-medium">What happens next:</p>
                    <ul className="space-y-1.5 text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-600 shrink-0" />
                        Confirm your agency details and manager profile
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-600 shrink-0" />
                        Your organisation will be created on Crib
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-600 shrink-0" />
                        You'll receive login credentials by email
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-600 shrink-0" />
                        Log in and start managing your properties
                      </li>
                    </ul>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Invited by:</span>{" "}
                    Crib Platform
                  </div>

                  <Button className="w-full" onClick={() => setStep("agency")}>
                    Set up my agency
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* ── Agency Details ── */}
            {step === "agency" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Agency Details
                  </CardTitle>
                  <CardDescription>
                    These details will appear on tenancy agreements and communications.
                    The agency name becomes locked after you submit.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="a-name">Agency name *</Label>
                    <Input
                      id="a-name"
                      value={agencyForm.agencyName}
                      onChange={(e) =>
                        setAgencyForm((f) => ({ ...f, agencyName: e.target.value }))
                      }
                      placeholder="e.g. GeoBox Properties Ltd"
                    />
                    <p className="text-xs text-muted-foreground">
                      Only a superadmin can change this after onboarding
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="a-phone">Phone</Label>
                      <Input
                        id="a-phone"
                        type="tel"
                        value={agencyForm.agencyPhone}
                        onChange={(e) =>
                          setAgencyForm((f) => ({ ...f, agencyPhone: e.target.value }))
                        }
                        placeholder="+256 700 000000"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="a-email">Contact email</Label>
                      <Input
                        id="a-email"
                        type="email"
                        value={agencyForm.agencyContactEmail}
                        onChange={(e) =>
                          setAgencyForm((f) => ({
                            ...f,
                            agencyContactEmail: e.target.value,
                          }))
                        }
                        placeholder="info@agency.com"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="a-country">Country</Label>
                      <Input
                        id="a-country"
                        value={agencyForm.agencyCountry}
                        onChange={(e) =>
                          setAgencyForm((f) => ({ ...f, agencyCountry: e.target.value }))
                        }
                        placeholder="Uganda"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="a-currency">Currency</Label>
                      <Input
                        id="a-currency"
                        value={agencyForm.agencyCurrency}
                        onChange={(e) =>
                          setAgencyForm((f) => ({ ...f, agencyCurrency: e.target.value }))
                        }
                        placeholder="UGX"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="a-addr">Address</Label>
                    <Input
                      id="a-addr"
                      value={agencyForm.agencyAddress}
                      onChange={(e) =>
                        setAgencyForm((f) => ({ ...f, agencyAddress: e.target.value }))
                      }
                      placeholder="Plot 12, Kampala Road, Kampala"
                    />
                  </div>

                  <div className="flex justify-between pt-2">
                    <Button variant="outline" onClick={() => setStep("welcome")}>
                      <ChevronLeft className="h-4 w-4" />
                      Back
                    </Button>
                    <Button
                      onClick={() => setStep("manager")}
                      disabled={!agencyValid}
                    >
                      Continue
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Manager Profile ── */}
            {step === "manager" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Manager Profile
                  </CardTitle>
                  <CardDescription>
                    This will be your personal manager account on Crib.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="m-first">First name *</Label>
                      <Input
                        id="m-first"
                        value={managerForm.managerFirstName}
                        onChange={(e) =>
                          setManagerForm((f) => ({
                            ...f,
                            managerFirstName: e.target.value,
                          }))
                        }
                        placeholder="Tom"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="m-last">Last name *</Label>
                      <Input
                        id="m-last"
                        value={managerForm.managerLastName}
                        onChange={(e) =>
                          setManagerForm((f) => ({
                            ...f,
                            managerLastName: e.target.value,
                          }))
                        }
                        placeholder="Mukasa"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="m-email">Email address</Label>
                    <Input id="m-email" value={data.managerEmail} disabled />
                    <p className="text-xs text-muted-foreground">
                      Your login email — cannot be changed here
                    </p>
                  </div>

                  <div className="flex justify-between pt-2">
                    <Button variant="outline" onClick={() => setStep("agency")}>
                      <ChevronLeft className="h-4 w-4" />
                      Back
                    </Button>
                    <Button
                      onClick={() => setStep("review")}
                      disabled={!managerValid}
                    >
                      Continue
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Review ── */}
            {step === "review" && (
              <Card>
                <CardHeader>
                  <CardTitle>Review & Confirm</CardTitle>
                  <CardDescription>
                    Please check all details before creating your agency account.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Agency
                    </p>
                    <div className="rounded-[6px] border border-border divide-y overflow-hidden">
                      {[
                        { label: "Name", value: agencyForm.agencyName },
                        { label: "Phone", value: agencyForm.agencyPhone || "—" },
                        { label: "Email", value: agencyForm.agencyContactEmail || "—" },
                        { label: "Country", value: agencyForm.agencyCountry || "—" },
                        { label: "Currency", value: agencyForm.agencyCurrency || "—" },
                        { label: "Address", value: agencyForm.agencyAddress || "—" },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                          <span className="text-muted-foreground w-24 shrink-0">{label}</span>
                          <span className="text-right font-medium">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Manager
                    </p>
                    <div className="rounded-[6px] border border-border divide-y overflow-hidden">
                      {[
                        {
                          label: "Name",
                          value: `${managerForm.managerFirstName} ${managerForm.managerLastName}`,
                        },
                        { label: "Email", value: data.managerEmail },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                          <span className="text-muted-foreground w-24 shrink-0">{label}</span>
                          <span className="text-right font-medium">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {completeError && (
                    <div className="rounded-[6px] bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
                      {(completeError as any)?.response?.data?.detail ??
                        "Something went wrong. Please try again."}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    By submitting, you confirm that the above details are correct. Your
                    agency organisation will be created and you will receive login
                    credentials by email.
                  </p>

                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setStep("manager")}>
                      <ChevronLeft className="h-4 w-4" />
                      Back
                    </Button>
                    <Button onClick={() => complete()} loading={completing}>
                      Create agency
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Success ── */}
            {step === "success" && (
              <div className="text-center space-y-6 py-8">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40 mx-auto">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">
                    {agencyForm.agencyName} is live!
                  </h1>
                  <p className="text-muted-foreground mt-2">
                    Your agency has been set up on Crib. Welcome,{" "}
                    {managerForm.managerFirstName}!
                  </p>
                </div>
                <div className="rounded-[6px] border border-primary/20 bg-primary/5 p-5 text-left space-y-2">
                  <div className="flex items-center gap-2 text-primary font-medium text-sm">
                    <Mail className="h-4 w-4" />
                    Check your inbox
                  </div>
                  <p className="text-sm text-muted-foreground">
                    We've sent your login credentials to{" "}
                    <span className="font-medium text-foreground">{data.managerEmail}</span>.
                    Use those details to sign in and start managing your properties.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Didn't receive the email? Check your spam folder or contact{" "}
                  <a href="mailto:support@crib.ug" className="underline">
                    support@crib.ug
                  </a>
                  .
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
