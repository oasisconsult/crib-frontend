"use client";

import { use, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import {
  Clock,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Home,
  Mail,
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
import { landlordsApi } from "@/services/api/landlords";

interface Props {
  params: Promise<{ token: string }>;
}

type Step = "welcome" | "details" | "review" | "success";

function isExpiredError(err: unknown): boolean {
  const resp = (err as Record<string, unknown>)?.response as
    | Record<string, unknown>
    | undefined;
  return resp?.status === 410 || (err as { status?: number })?.status === 410;
}

export default function LandlordOnboardingPage({ params }: Props) {
  const { token } = use(params);

  const { data, isLoading, error } = useQuery({
    queryKey: ["landlord-onboarding", token],
    queryFn: () => landlordsApi.getOnboarding(token),
    retry: false,
  });

  const [step, setStep] = useState<Step>("welcome");
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "" });

  const { mutate: complete, isPending: completing } = useMutation({
    mutationFn: () =>
      landlordsApi.completeOnboarding(token, {
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone || undefined,
      }),
    onSuccess: () => setStep("success"),
  });

  // Seed form from invite data when it loads
  useEffect(() => {
    if (data) {
      setForm({
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone ?? "",
      });
    }
  }, [data]);

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
                  Landlord invite links are valid for 7 days. Please contact
                  your property manager to send a new invite.
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
                Contact your property manager for a new invite.
              </p>
            </div>
          ))}

        {/* Steps */}
        {!isLoading && !error && data && (
          <>
            {/* Step indicator */}
            {step !== "success" && (() => {
              const allSteps = ["welcome", "details", "review"] as const;
              const ci = allSteps.indexOf(step as typeof allSteps[number]);
              return (
                <div className="flex items-start mb-8">
                  {allSteps.map((s, i) => {
                    const isDone = i < ci;
                    const isActive = step === s;
                    const label = s === "welcome" ? "Welcome" : s === "details" ? "Your Details" : "Review";
                    return (
                      <div key={s} className="flex items-start flex-1 last:flex-none">
                        {/* Dot + label */}
                        <div className="flex flex-col items-center shrink-0">
                          <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all ${
                            isActive
                              // Active: primary bg — force white so the number is always legible
                              ? "bg-primary text-white shadow-[0_0_0_4px_hsl(var(--primary)/0.15)]"
                              : isDone
                                // Done: emerald-700 vs white ≈ 5.6:1 → passes AA
                                ? "bg-emerald-700 text-white"
                                // Inactive: outlined circle — foreground text on card bg guarantees contrast
                                : "border-2 border-border bg-card text-foreground"
                          }`}>
                            {isDone ? "✓" : i + 1}
                          </div>
                          <span className={`text-[11px] mt-1 font-semibold whitespace-nowrap ${
                            // Active/done labels: full foreground; inactive: 65% → ~#595959 on white ≈ 7:1 ✓
                            isActive || isDone ? "text-foreground" : "text-foreground/65"
                          }`}>
                            {label}
                          </span>
                        </div>
                        {/* Connector bar — between steps only */}
                        {i < allSteps.length - 1 && (
                          <div className={`flex-1 h-0.5 mt-[14px] mx-2 rounded-full transition-colors ${
                            isDone ? "bg-emerald-700" : "bg-border"
                          }`} />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* ── Welcome ── */}
            {step === "welcome" && (
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-lg font-bold">
                      {data.firstName[0]}
                    </div>
                    <div>
                      <CardTitle className="text-xl leading-tight">
                        Welcome, {data.firstName}!
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        <span className="font-medium text-foreground">{data.agencyName}</span>{" "}
                        has invited you to Crib.
                      </p>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-5">
                  {/* Personal message from agency */}
                  {data.message && (
                    <div className="relative rounded-[8px] bg-primary/5 border border-primary/15 px-4 py-3">
                      <p className="text-sm text-foreground/80 leading-relaxed">
                        {data.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1.5">— {data.agencyName}</p>
                    </div>
                  )}

                  {/* Properties */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      {data.properties.length > 0 ? "Your Properties" : "Properties"}
                    </p>
                    {data.properties.length > 0 ? (
                      <div className="space-y-2">
                        {data.properties.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center gap-3 rounded-[8px] border bg-background px-3 py-2.5"
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-primary/10 text-primary">
                              <Home className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{p.name}</p>
                              {p.address && (
                                <p className="text-xs text-muted-foreground truncate">{p.address}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[8px] border border-dashed border-border bg-muted/30 px-4 py-4 text-center">
                        <p className="text-sm text-muted-foreground">
                          No properties assigned yet — your agency will link them after your account is set up.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* What happens next */}
                  <div className="rounded-[8px] bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 px-4 py-3 flex gap-3">
                    <Mail className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-emerald-800 dark:text-emerald-300">
                      Once you complete this short form, you'll receive an email with your login credentials.
                    </p>
                  </div>

                  <Button className="w-full h-11" onClick={() => setStep("details")}>
                    Get started
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* ── Details ── */}
            {step === "details" && (
              <Card>
                <CardHeader>
                  <CardTitle>Your Details</CardTitle>
                  <CardDescription>
                    Confirm your name and contact information. This will be used
                    for your Crib account.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="firstName">First name *</Label>
                      <Input
                        id="firstName"
                        value={form.firstName}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, firstName: e.target.value }))
                        }
                        placeholder="Jane"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="lastName">Last name *</Label>
                      <Input
                        id="lastName"
                        value={form.lastName}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, lastName: e.target.value }))
                        }
                        placeholder="Smith"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="email">Email address</Label>
                      <Input id="email" value={data.email} disabled />
                      <p className="text-xs text-muted-foreground">
                        Your login email — cannot be changed here
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="phone">Phone number (optional)</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={form.phone}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, phone: e.target.value }))
                        }
                        placeholder="+256 700 000000"
                      />
                    </div>
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
                      onClick={() => setStep("review")}
                      disabled={!form.firstName || !form.lastName}
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
                    Please check your details before we create your account.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="divide-y rounded-[6px] border border-border overflow-hidden">
                    {[
                      {
                        label: "Full name",
                        value: `${form.firstName} ${form.lastName}`,
                      },
                      { label: "Email", value: data.email },
                      { label: "Phone", value: form.phone || "—" },
                      { label: "Agency", value: data.agencyName },
                      {
                        label: "Properties",
                        value: data.properties.map((p) => p.name).join(", "),
                      },
                    ].map(({ label, value }) => (
                      <div
                        key={label}
                        className="flex items-start justify-between px-4 py-3 text-sm"
                      >
                        <span className="text-muted-foreground w-28 shrink-0">
                          {label}
                        </span>
                        <span className="text-right font-medium">{value}</span>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    By submitting, you agree that your account will be created
                    on Crib with the details above. You will receive a login
                    link by email.
                  </p>

                  <div className="flex justify-between">
                    <Button
                      variant="outline"
                      onClick={() => setStep("details")}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Back
                    </Button>
                    <Button onClick={() => complete()} loading={completing}>
                      Create my account
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
                    Account created!
                  </h1>
                  <p className="text-muted-foreground mt-2">
                    Welcome to Crib, {form.firstName}. Your landlord account has
                    been set up.
                  </p>
                </div>
                <div className="rounded-[6px] border border-primary/20 bg-primary/5 p-5 text-left space-y-2">
                  <div className="flex items-center gap-2 text-primary font-medium text-sm">
                    <Mail className="h-4 w-4" />
                    Check your inbox
                  </div>
                  <p className="text-sm text-muted-foreground">
                    We have sent a login link to{" "}
                    <span className="font-medium text-foreground">
                      {data.email}
                    </span>
                    . Click the link in that email to sign in to your dashboard
                    for the first time.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Didn't receive the email? Check your spam folder or contact{" "}
                  {data.agencyName} for help.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
