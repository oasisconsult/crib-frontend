"use client";

import { useRef, useState } from "react";
import { Lock, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ESignatureCanvas } from "@/components/onboarding/ESignatureCanvas";
import { useRequestSigningOtp, useSignAgreement } from "@/hooks/useOnboardingFlow";
import type { AgreementPreview } from "@/types/onboarding";

interface Props {
  token: string;
  preview: AgreementPreview;
  termsAcceptedAt?: string | null;
  onSigned: () => void;
  onBack: () => void;
}

type OtpPhase = "request" | "verify" | "sign";

function fmt(n: number, currency: string) {
  return `${currency} ${n.toLocaleString()}`;
}

export function FinalSignatureStep({
  token,
  preview,
  termsAcceptedAt,
  onSigned,
  onBack,
}: Props) {
  const [otpPhase, setOtpPhase] = useState<OtpPhase>("request");
  const [maskedEmail, setMaskedEmail] = useState<string>("");
  const [otpCode, setOtpCode] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);

  const requestOtp = useRequestSigningOtp(token);
  const {
    mutate: signAgreement,
    isPending: isSigning,
    isError: isSignError,
    error: signError,
  } = useSignAgreement(token);

  function handleRequestOtp() {
    requestOtp.mutate(undefined, {
      onSuccess: (data) => {
        setMaskedEmail(data.emailMasked);
        setOtpPhase("verify");
        setTimeout(() => otpInputRef.current?.focus(), 50);
      },
    });
  }

  function handleVerifyOtp() {
    if (otpCode.length !== 6) return;
    setOtpPhase("sign");
  }

  function handleSign() {
    if (!signature) return;
    signAgreement(
      { signatureDataUrl: signature, otpCode: otpCode || undefined },
      { onSuccess: onSigned },
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-primary" />
          <CardTitle>Sign Your Agreement</CardTitle>
        </div>
        <CardDescription>
          These are the exact terms you previously accepted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Same-terms assurance banner */}
        <div className="rounded-[6px] border border-emerald-200 bg-emerald-50 dark:border-emerald-200 dark:bg-emerald-100/40 p-3 text-sm text-emerald-800 dark:text-emerald-200">
          <p className="font-medium mb-0.5">No surprises</p>
          <p>
            The terms below are identical to the agreement preview you accepted.
            Nothing has changed.
          </p>
        </div>

        {/* Locked terms summary */}
        <div className="rounded-[6px] border bg-muted/10 p-4 text-sm space-y-2 select-none pointer-events-none">
          <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
            Agreed terms
          </p>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Property</span>
              <span className="font-medium">
                {preview.propertyName} — {preview.unitName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Start date</span>
              <span>{preview.startDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Monthly rent</span>
              <span>{fmt(preview.monthlyRent, preview.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Deposit</span>
              <span>{fmt(preview.depositAmount, preview.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Notice period</span>
              <span>{preview.noticePeriodDays} days</span>
            </div>
          </div>
          <Separator />
          <p className="text-xs text-muted-foreground text-center">
            Payment confirmed · Terms accepted on{" "}
            {termsAcceptedAt
              ? new Date(termsAcceptedAt).toLocaleDateString()
              : new Date().toLocaleDateString()}
          </p>
        </div>

        {/* ── OTP: request phase ─────────────────────────────────────────── */}
        {otpPhase === "request" && (
          <div className="rounded-[6px] border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Verify your identity</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  We&apos;ll send a 6-digit code to your registered email address to
                  confirm your identity before signing.
                </p>
              </div>
            </div>
            {requestOtp.isError && (
              <p className="text-sm text-destructive">
                {(requestOtp.error as Error)?.message ?? "Could not send code. Please try again."}
              </p>
            )}
            <Button
              className="w-full"
              onClick={handleRequestOtp}
              disabled={requestOtp.isPending}
              loading={requestOtp.isPending}
            >
              Send verification code
            </Button>
          </div>
        )}

        {/* ── OTP: verify phase ──────────────────────────────────────────── */}
        {otpPhase === "verify" && (
          <div className="rounded-[6px] border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Enter your verification code</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  A 6-digit code was sent to <span className="font-mono">{maskedEmail}</span>.
                  It expires in 15 minutes.
                </p>
              </div>
            </div>
            <Input
              ref={otpInputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="text-center text-lg tracking-[0.4em] font-mono"
            />
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={handleRequestOtp}
                disabled={requestOtp.isPending}
              >
                {requestOtp.isPending ? "Sending…" : "Resend code"}
              </Button>
              <Button
                className="flex-1"
                onClick={handleVerifyOtp}
                disabled={otpCode.length !== 6}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* ── Sign phase ─────────────────────────────────────────────────── */}
        {otpPhase === "sign" && (
          <>
            <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>Identity verified via email OTP</span>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Your signature</p>
              <ESignatureCanvas onSave={setSignature} />
            </div>

            {isSignError && (
              <p className="text-sm text-destructive">
                {(signError as Error)?.message === "Agreement terms have changed"
                  ? "The agreement terms have changed since your preview. Please contact your landlord."
                  : (signError as Error)?.message === "Invalid or expired OTP"
                    ? "Your verification code is invalid or has expired. Please go back and request a new one."
                    : ((signError as Error)?.message ??
                      "Signing failed. Please try again.")}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => { setOtpPhase("verify"); setSignature(null); }}
                disabled={isSigning}
              >
                ← Back
              </Button>
              <Button
                className="flex-1"
                onClick={handleSign}
                disabled={!signature || isSigning}
                loading={isSigning}
              >
                Sign &amp; Activate My Tenancy ✓
              </Button>
            </div>
          </>
        )}

        {/* Back button — only shown during OTP phases */}
        {otpPhase !== "sign" && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack} disabled={requestOtp.isPending}>
              ← Back
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">
          By signing you agree to the tenancy terms and confirm the information
          above is correct.
        </p>
      </CardContent>
    </Card>
  );
}
