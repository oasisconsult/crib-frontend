"use client";

import { use, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import {
  Clock, CheckCircle2, ChevronRight, ChevronLeft,
  Home, Shield, Building2, Mail,
} from "lucide-react";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  getCaretakerOnboarding,
  completeCaretakerOnboarding,
  type CaretakerPermissionLevel,
} from "@/services/api/caretakers";

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

function permissionLabel(level: CaretakerPermissionLevel) {
  return level === "full" ? "Full Access" : "Operations Only";
}

function permissionDescription(level: CaretakerPermissionLevel) {
  return level === "full"
    ? "You can manage properties, tenants, leases, maintenance, payments, and view analytics."
    : "You can manage properties, tenants, leases, and maintenance. Payment amounts and financial reports are not included.";
}

export default function CaretakerOnboardingPage({ params }: Props) {
  const { token } = use(params);

  const { data, isLoading, error } = useQuery({
    queryKey: ["caretaker-onboarding", token],
    queryFn: () => getCaretakerOnboarding(token),
    retry: false,
  });

  const [step, setStep] = useState<Step>("welcome");
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "" });

  const { mutate: complete, isPending: completing } = useMutation({
    mutationFn: () =>
      completeCaretakerOnboarding(token, {
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone || undefined,
      }),
    onSuccess: () => setStep("success"),
  });

  useEffect(() => {
    if (data) {
      setForm({ firstName: data.firstName, lastName: data.lastName, phone: "" });
    }
  }, [data]);

  const canSubmit = form.firstName.trim() && form.lastName.trim();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 px-4 py-8 sm:px-6">
      <div className="max-w-2xl mx-auto">

        {/* Logo */}
        <div className="mb-10">
          <Link href="/" aria-label="Go to Crib home">
            <Image
              src="/crib_logo_green.png"
              alt="Crib"
              width={120}
              height={34}
              priority
              className="w-[100px] sm:w-[110px] md:w-[120px] h-auto"
              style={{ height: "auto" }}
            />
          </Link>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-4">
            <div className="h-7 w-56 skeleton-shimmer rounded" />
            <div className="h-4 w-40 skeleton-shimmer rounded" />
            <div className="h-64 skeleton-shimmer rounded-[6px]" />
          </div>
        )}

        {/* Error: expired link */}
        {!isLoading && error && isExpiredError(error) && (
          <div className="rounded-[6px] border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-8 text-center space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 mx-auto">
              <Clock className="h-7 w-7 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-amber-800 dark:text-amber-200">
                This invite link has expired
              </h2>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-2 max-w-sm mx-auto">
                Caretaker invite links are valid for 7 days.
                Please ask the property owner to send a new invitation.
              </p>
            </div>
          </div>
        )}

        {/* Error: invalid link */}
        {!isLoading && error && !isExpiredError(error) && (
          <div className="rounded-[6px] border border-destructive/30 bg-destructive/5 p-8 text-center space-y-2">
            <h2 className="text-lg font-semibold text-destructive">Invalid Link</h2>
            <p className="text-sm text-muted-foreground">
              This invite link is not recognised or has already been used.
              Please contact the property owner for a new invite.
            </p>
          </div>
        )}

        {/* Steps */}
        {!isLoading && !error && data && (
          <>

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
                        <span className="font-medium text-foreground">{data.ownerName}</span>{" "}
                        has invited you to manage their properties on Crib.
                      </p>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-5">

                  {/* Properties */}
                  {data.propertyNames.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        Properties you will manage
                      </p>
                      <div className="space-y-2">
                        {data.propertyNames.map((name: string) => (
                          <div
                            key={name}
                            className="flex items-center gap-3 rounded-[8px] border bg-background px-3 py-2.5"
                          >
                            <div className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-primary/10">
                              <Building2 className="h-4 w-4 text-primary" aria-hidden />
                            </div>
                            <span className="text-sm font-medium">{name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Access level */}
                  <div className="rounded-[8px] border border-[hsl(var(--border))] bg-muted/20 p-4">
                    <div className="flex items-start gap-3">
                      <Shield className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden />
                      <div>
                        <p className="text-sm font-semibold">
                          {permissionLabel(data.permissionLevel)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          {permissionDescription(data.permissionLevel)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* What happens next */}
                  <div className="rounded-[8px] bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 px-4 py-3 flex gap-3">
                    <Mail className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden />
                    <p className="text-sm text-emerald-800 dark:text-emerald-300">
                      After confirming your details you will receive a login email. Use it to access the dashboard.
                    </p>
                  </div>

                  <Button className="w-full h-11" onClick={() => setStep("details")}>
                    Continue
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* ── Details ── */}
            {step === "details" && (
              <Card>
                <CardHeader>
                  <CardTitle>Confirm Your Details</CardTitle>
                  <CardDescription>
                    These will be used for your Crib caretaker account.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="ct-first">First name *</Label>
                      <Input
                        id="ct-first"
                        value={form.firstName}
                        onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                        placeholder="Jane"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ct-last">Last name *</Label>
                      <Input
                        id="ct-last"
                        value={form.lastName}
                        onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                        placeholder="Nakato"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ct-email">Email address</Label>
                    <Input id="ct-email" value={data.email} disabled />
                    <p className="text-xs text-muted-foreground">Your login email — cannot be changed here</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ct-phone">Phone number (optional)</Label>
                    <Input
                      id="ct-phone"
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="+256 700 000000"
                    />
                  </div>

                  <div className="flex justify-between pt-2">
                    <Button variant="outline" onClick={() => setStep("welcome")}>
                      <ChevronLeft className="h-4 w-4" aria-hidden />
                      Back
                    </Button>
                    <Button onClick={() => setStep("review")} disabled={!canSubmit}>
                      Review
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Review ── */}
            {step === "review" && (
              <Card>
                <CardHeader>
                  <CardTitle>Review &amp; Confirm</CardTitle>
                  <CardDescription>Please check your details before we create your account.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="divide-y rounded-[6px] border border-border overflow-hidden">
                    {[
                      { label: "Full name",   value: `${form.firstName} ${form.lastName}` },
                      { label: "Email",       value: data.email },
                      { label: "Phone",       value: form.phone || "—" },
                      { label: "Managed for", value: data.ownerName },
                      { label: "Properties",  value: data.propertyNames.join(", ") || "—" },
                      { label: "Access level",value: permissionLabel(data.permissionLevel) },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-start justify-between px-4 py-3 text-sm">
                        <span className="text-muted-foreground w-28 shrink-0">{label}</span>
                        <span className="text-right font-medium">{value}</span>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    By confirming, your caretaker account will be created and you will receive a login
                    link at {data.email}.
                  </p>

                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setStep("details")}>
                      <ChevronLeft className="h-4 w-4" aria-hidden />
                      Back
                    </Button>
                    <Button onClick={() => complete()} disabled={completing}>
                      {completing ? "Creating…" : "Create my account"}
                      <CheckCircle2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Success ── */}
            {step === "success" && (
              <div className="text-center space-y-6 py-8">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20 mx-auto">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Account created!</h1>
                  <p className="text-muted-foreground mt-2">
                    Welcome to Crib, {form.firstName}.
                    You can now manage {data.ownerName}&apos;s properties.
                  </p>
                </div>
                <div className="rounded-[6px] border border-primary/20 bg-primary/5 p-5 text-left space-y-2">
                  <div className="flex items-center gap-2 text-primary font-medium text-sm">
                    <Mail className="h-4 w-4" aria-hidden />
                    Check your inbox
                  </div>
                  <p className="text-sm text-muted-foreground">
                    We have sent a login link to{" "}
                    <span className="font-medium text-foreground">{data.email}</span>.
                    Click the link to sign in to your caretaker dashboard.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Didn&apos;t receive the email? Check your spam folder or contact{" "}
                  <a href="mailto:support@crib.ug" className="underline">support@crib.ug</a>.
                </p>
              </div>
            )}

          </>
        )}
      </div>
    </div>
  );
}
