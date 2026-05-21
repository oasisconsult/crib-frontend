"use client";

import { use, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import {
  Building2,
  Clock,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Mail,
  User,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { agencyInvitesApi } from "@/services/api/agencyInvites";

interface Props {
  params: Promise<{ token: string }>;
}

type Step = "welcome" | "agency" | "manager" | "review" | "success";

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
    <div className="flex items-start mb-8">
      {visible.map((s, i) => {
        const isDone = i < ci;
        const isActive = current === s;
        return (
          <div key={s} className="flex items-start flex-1 last:flex-none">
            {/* Dot + label */}
            <div className="flex flex-col items-center shrink-0">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all ${
                isActive
                  ? "bg-primary text-white shadow-[0_0_0_4px_hsl(var(--primary)/0.15)]"
                  : isDone
                    ? "bg-emerald-700 text-white"           // emerald-700/white ≈ 5.6:1 → WCAG AA ✓
                    : "border-2 border-border bg-card text-foreground" // outlined → foreground on card ✓
              }`}>
                {isDone ? "✓" : i + 1}
              </div>
              <span className={`text-[11px] mt-1 font-semibold whitespace-nowrap ${
                isActive || isDone ? "text-foreground" : "text-foreground/65"
              }`}>
                {labels[s]}
              </span>
            </div>
            {/* Connector bar — between steps only */}
            {i < visible.length - 1 && (
              <div className={`flex-1 h-0.5 mt-[14px] mx-2 rounded-full transition-colors ${
                isDone ? "bg-emerald-700" : "bg-border"
              }`} />
            )}
          </div>
        );
      })}
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

  const {
    mutate: complete,
    isPending: completing,
    error: completeError,
  } = useMutation({
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
  const managerValid =
    !!managerForm.managerFirstName && !!managerForm.managerLastName;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 px-4 py-8 sm:px-6">
      <div className="max-w-3xl mx-auto">
        {/* Logo */}
        <div className="mb-10">
          <Link href="/" aria-label="Go to Crib home">
            <Image
              src="/crib-icon-green.png"
              alt="Crib"
              width={40}
              height={40}
              priority
              className="h-10 w-10"
              style={{ height: 'auto' }}
            />
          </Link>
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
        {!isLoading &&
          error &&
          (isExpiredError(error) ? (
            <div className="rounded-[6px] border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-8 text-center space-y-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 mx-auto">
                <Clock className="h-7 w-7 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-amber-800 dark:text-amber-200">
                  This invite has expired
                </h2>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-2 max-w-sm mx-auto">
                  Agency invite links are valid for 14 days. Please contact Crib
                  support to request a new invite.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-[6px] border border-destructive/30 bg-destructive/5 p-8 text-center space-y-2">
              <h2 className="text-lg font-semibold text-destructive">
                Invalid Link
              </h2>
              <p className="text-sm text-muted-foreground">
                This invite link is not recognised or has already been used.
                Contact Crib support for assistance.
              </p>
            </div>
          ))}

        {/* Steps */}
        {!isLoading && !error && data && (
          <>
            {step !== "success" && <StepIndicator current={step} />}

            {/* ── Welcome ── */}
            {step === "welcome" && (
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-xl leading-tight">Welcome to Crib</CardTitle>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Set up <span className="font-medium text-foreground">{data.agencyName}</span> in a few steps.
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* What happens next */}
                  <div className="space-y-2.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">What to expect</p>
                    <ul className="space-y-2">
                      {[
                        "Confirm your agency name and contact details",
                        "Set up your personal manager profile",
                        "Review everything before submitting",
                        "Receive your login credentials by email",
                      ].map((item, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold mt-0.5">
                            {i + 1}
                          </span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-[8px] bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 px-4 py-3 flex gap-3">
                    <Mail className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-emerald-800 dark:text-emerald-300">
                      Takes about 2 minutes. You'll receive an email with login credentials when done.
                    </p>
                  </div>

                  <Button className="w-full h-11" onClick={() => setStep("agency")}>
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
                    These details will appear on tenancy agreements and
                    communications. The agency name becomes locked after you
                    submit.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="a-name">Agency name *</Label>
                    <Input
                      id="a-name"
                      value={agencyForm.agencyName}
                      onChange={(e) =>
                        setAgencyForm((f) => ({
                          ...f,
                          agencyName: e.target.value,
                        }))
                      }
                      placeholder="e.g. Crib Properties Ltd"
                    />
                    <p className="text-xs text-muted-foreground">
                      Only a superadmin can change this after onboarding
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="a-phone">Phone</Label>
                      <Input
                        id="a-phone"
                        type="tel"
                        value={agencyForm.agencyPhone}
                        onChange={(e) =>
                          setAgencyForm((f) => ({
                            ...f,
                            agencyPhone: e.target.value,
                          }))
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="a-country">Country</Label>
                      <Input
                        id="a-country"
                        value={agencyForm.agencyCountry}
                        onChange={(e) =>
                          setAgencyForm((f) => ({
                            ...f,
                            agencyCountry: e.target.value,
                          }))
                        }
                        placeholder="UG"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="a-currency">Currency</Label>
                      <Input
                        id="a-currency"
                        value={agencyForm.agencyCurrency}
                        onChange={(e) =>
                          setAgencyForm((f) => ({
                            ...f,
                            agencyCurrency: e.target.value,
                          }))
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
                        setAgencyForm((f) => ({
                          ...f,
                          agencyAddress: e.target.value,
                        }))
                      }
                      placeholder="Plot 12, Kampala Road, Kampala"
                    />
                  </div>

                  <div className="flex justify-between pt-2">
                    <Button
                      variant="outline"
                      onClick={() => setStep("welcome")}
                    >
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    Please check all details before creating your agency
                    account.
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
                        {
                          label: "Phone",
                          value: agencyForm.agencyPhone || "—",
                        },
                        {
                          label: "Email",
                          value: agencyForm.agencyContactEmail || "—",
                        },
                        {
                          label: "Country",
                          value: agencyForm.agencyCountry || "—",
                        },
                        {
                          label: "Currency",
                          value: agencyForm.agencyCurrency || "—",
                        },
                        {
                          label: "Address",
                          value: agencyForm.agencyAddress || "—",
                        },
                      ].map(({ label, value }) => (
                        <div
                          key={label}
                          className="flex items-center justify-between px-4 py-2.5 text-sm"
                        >
                          <span className="text-muted-foreground w-24 shrink-0">
                            {label}
                          </span>
                          <span className="text-right font-medium">
                            {value}
                          </span>
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
                        <div
                          key={label}
                          className="flex items-center justify-between px-4 py-2.5 text-sm"
                        >
                          <span className="text-muted-foreground w-24 shrink-0">
                            {label}
                          </span>
                          <span className="text-right font-medium">
                            {value}
                          </span>
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
                    By submitting, you confirm that the above details are
                    correct. Your agency organisation will be created and you
                    will receive login credentials by email.
                  </p>

                  <div className="flex justify-between">
                    <Button
                      variant="outline"
                      onClick={() => setStep("manager")}
                    >
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
                <div className="rounded-[8px] bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-4 text-left space-y-1.5">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-medium text-sm">
                    <Mail className="h-4 w-4" />
                    Check your inbox
                  </div>
                  <p className="text-sm text-emerald-800/80 dark:text-emerald-300/80">
                    We've sent your login credentials to{" "}
                    <span className="font-semibold text-emerald-900 dark:text-emerald-200">
                      {data.managerEmail}
                    </span>
                    . Use those details to sign in and start managing your properties.
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
