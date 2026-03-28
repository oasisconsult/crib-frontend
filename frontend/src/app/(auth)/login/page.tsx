"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Building2,
  Loader2,
  ShieldCheck,
  Users,
  Star,
  Zap,
  BarChart3,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

// ── Conversion-focused feature list ───────────────────────────────────────
const BENEFITS = [
  { icon: Zap,       text: "Collect rent in one click — mobile money, bank, or card" },
  { icon: Users,     text: "Onboard tenants in minutes, not days" },
  { icon: BarChart3, text: "Know your occupancy and revenue the moment it changes" },
  { icon: Clock,     text: "Automated late-fee reminders so you never chase again" },
];

// ── Social proof numbers ───────────────────────────────────────────────────
const STATS = [
  { value: "1,200+", label: "Units managed" },
  { value: "98%",    label: "On-time collection" },
  { value: "4.9★",   label: "Landlord rating" },
];

// ── Page ───────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/";
  const [loading, setLoading] = useState(false);

  const handleLogin = () => {
    setLoading(true);
    const logtoUrl = new URL(
      `${process.env.NEXT_PUBLIC_LOGTO_ENDPOINT}/oidc/auth`,
    );
    logtoUrl.searchParams.set("client_id", process.env.NEXT_PUBLIC_LOGTO_APP_ID ?? "");
    logtoUrl.searchParams.set("redirect_uri", `${window.location.origin}/api/auth/callback`);
    logtoUrl.searchParams.set("response_type", "code");
    logtoUrl.searchParams.set("scope", "openid profile email phone roles offline_access");
    logtoUrl.searchParams.set("state", btoa(JSON.stringify({ redirect })));
    window.location.href = logtoUrl.toString();
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* ── Left panel — illustration ─────────────────────────── */}
      <div className={cn(
        "relative flex flex-col justify-between overflow-hidden",
        "lg:w-1/2 lg:min-h-screen",
        "p-8 lg:p-12",
        // Rich gradient: deep indigo → violet
        "bg-[radial-gradient(ellipse_at_top_left,_#312e81_0%,_#1e1b4b_40%,_#0f0a2e_100%)]",
      )}>
        {/* Subtle mesh overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: `
              radial-gradient(circle at 20% 20%, rgba(139,92,246,0.4) 0%, transparent 50%),
              radial-gradient(circle at 80% 80%, rgba(99,102,241,0.3) 0%, transparent 50%)
            `,
          }}
          aria-hidden="true"
        />

        {/* Brand */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 shadow-lg">
            <Building2 className="h-4.5 w-4.5 text-white" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">Crib</span>
        </div>

        {/* Hero copy */}
        <div className="relative z-10 flex-1 flex flex-col justify-center py-8 space-y-8">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 self-start rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1">
            <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
            <span className="text-xs font-medium text-violet-200">Uganda&apos;s #1 Property Platform</span>
          </div>

          {/* Headline */}
          <div className="space-y-3">
            <h2 className="text-3xl lg:text-4xl font-extrabold text-white leading-tight tracking-tight">
              Stop chasing rent.<br />
              <span className="bg-gradient-to-r from-violet-300 to-indigo-300 bg-clip-text text-transparent">
                Start growing your portfolio.
              </span>
            </h2>
            <p className="text-base text-white/60 max-w-sm leading-relaxed">
              Crib handles rent collection, tenant onboarding, lease management,
              and analytics — so you can focus on what matters.
            </p>
          </div>

          {/* Benefit bullets */}
          <ul className="space-y-3">
            {BENEFITS.map((b) => (
              <li key={b.text} className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-violet-500/20 border border-violet-400/20 mt-0.5">
                  <b.icon className="h-3.5 w-3.5 text-violet-300" />
                </div>
                <span className="text-sm text-white/75 leading-relaxed">{b.text}</span>
              </li>
            ))}
          </ul>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 pt-2">
            {STATS.map((s) => (
              <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-center backdrop-blur-sm">
                <p className="text-lg font-bold text-white">{s.value}</p>
                <p className="text-[11px] text-white/50 mt-0.5 leading-tight">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Testimonial */}
          <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 space-y-3">
            <div className="flex gap-0.5">
              {[1,2,3,4,5].map((i) => (
                <Star key={i} className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400" />
              ))}
            </div>
            <p className="text-sm text-white/70 leading-relaxed italic">
              &ldquo;Before Crib I was using WhatsApp and Excel. Now I manage 18 units
              from my phone and collect rent on the 1st of every month without calling a single tenant.&rdquo;
            </p>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-400 text-white text-xs font-bold">
                JK
              </div>
              <div>
                <p className="text-xs font-semibold text-white/90">James Kizito</p>
                <p className="text-[11px] text-white/45">Landlord · 18 units · Kampala</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom legal on mobile only */}
        <p className="relative z-10 mt-4 text-xs text-white/25 lg:hidden">
          © {new Date().getFullYear()} Crib. All rights reserved.
        </p>
      </div>

      {/* ── Right panel — sign-in form ────────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center p-8 lg:p-12 bg-background">
        <div className="w-full max-w-sm">
          {/* Mobile logo (hidden on desktop where left panel shows it) */}
          <div className="flex items-center justify-center gap-2.5 mb-10 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Building2 className="h-4.5 w-4.5" />
            </div>
            <span className="text-xl font-bold tracking-tight">Crib</span>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Welcome back
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Sign in to your Crib account to continue.
            </p>
          </div>

          {/* Sign-in button */}
          <Button
            className="w-full h-11 text-sm font-semibold shadow-md"
            size="lg"
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Building2 className="h-4 w-4" />
            )}
            {loading ? "Redirecting…" : "Continue with Logto"}
          </Button>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="flex items-center gap-1.5 bg-background px-3 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                Secured by Logto OIDC
              </span>
            </div>
          </div>

          {/* Trust badges */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            {[
              { label: "End-to-end encrypted" },
              { label: "GDPR compliant" },
              { label: "SOC 2 ready" },
            ].map((b) => (
              <div
                key={b.label}
                className="flex items-center justify-center rounded-lg border border-border bg-muted/40 px-2 py-2.5 text-center"
              >
                <span className="text-[10px] font-medium text-muted-foreground leading-tight">
                  {b.label}
                </span>
              </div>
            ))}
          </div>

          {/* Sign up link */}
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <a href="/signup" className="font-medium text-primary hover:underline underline-offset-4">
              Sign up free
            </a>
          </p>

          {/* Legal */}
          <p className="mt-6 text-center text-[11px] text-muted-foreground/70 leading-relaxed">
            By continuing, you agree to our{" "}
            <a href="/terms" className="underline underline-offset-2 hover:text-muted-foreground">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/privacy" className="underline underline-offset-2 hover:text-muted-foreground">
              Privacy Policy
            </a>
          </p>
        </div>

        {/* Desktop footer */}
        <p className="hidden lg:block absolute bottom-6 right-8 text-xs text-muted-foreground/50">
          © {new Date().getFullYear()} Crib
        </p>
      </div>
    </div>
  );
}
