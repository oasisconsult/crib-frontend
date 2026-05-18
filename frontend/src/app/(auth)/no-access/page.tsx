import Image from "next/image";
import Link from "next/link";
import { MailOpen, Building2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NoAccessPage() {
  return (
    <div className="min-h-screen flex bg-[hsl(var(--background))]">
      {/* ── Left — Message panel ─────────────────────────────────────────── */}
      <div className="flex flex-col justify-center w-full md:w-[45%] lg:w-[42%] px-8 sm:px-12 py-12 bg-[hsl(var(--card))]">
        <div className="w-full max-w-sm mx-auto">
          {/* Logo */}
          <div className="mb-10">
            <Image
              src="/crib_logo_green.png"
              alt="Crib"
              width={160}
              height={44}
              priority
              className="w-[120px] sm:w-[140px] md:w-[160px] h-auto"
              style={{ height: "auto" }}
            />
          </div>

          {/* Icon */}
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--muted))] border border-[hsl(var(--border))] mb-6">
            <MailOpen className="h-6 w-6 text-[hsl(var(--muted-foreground))]" />
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-[hsl(var(--foreground))] mb-2">
              Waiting for access
            </h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
              Your account has been created but you haven&apos;t been invited to
              an organisation yet.
            </p>
            <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed mt-2">
              Contact your property manager or agency to receive an invitation
              link.
            </p>
          </div>

          {/* What to do */}
          <div className="rounded-[var(--radius-lg)] border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 p-4 mb-8 space-y-3">
            <p className="text-xs font-semibold text-[hsl(var(--foreground))] uppercase tracking-wide">
              What happens next?
            </p>
            <ol className="space-y-2">
              {[
                "Your manager will send you an invitation by email",
                "Click the link in the email to join the organisation",
                "Sign in again — your dashboard will be ready",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-[hsl(var(--muted-foreground))]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] text-[10px] font-bold mt-0.5">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          <Button asChild variant="outline" className="w-full h-10 gap-2">
            <Link href="/login">
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </Link>
          </Button>
        </div>
      </div>

      {/* ── Right — Decorative panel (hidden on mobile) ──────────────────── */}
      <div
        className="hidden md:flex flex-col justify-center flex-1 px-10 lg:px-14 py-12 relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, #0B3B36 0%, #16665D 45%, #239487 100%)",
        }}
      >
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-white/5" />
        <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-white/5" />
        <div className="absolute top-1/2 right-8 h-32 w-32 rounded-full bg-white/5" />

        <div className="relative z-10 max-w-md">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 border border-white/20 mb-8">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-4 leading-tight">
            Property management
            <br />
            <span className="text-[hsl(43,100%,68%)]">made simple</span>
          </h2>
          <p className="text-white/75 text-base leading-relaxed">
            Crib brings landlords, managers, and tenants onto one platform —
            streamlining rent collection, maintenance, and communication.
          </p>
        </div>
      </div>
    </div>
  );
}
