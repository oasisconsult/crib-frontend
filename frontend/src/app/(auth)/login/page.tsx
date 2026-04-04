"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Building2,
  Loader2,
  ShieldCheck,
  Star,
  Zap,
  Users,
  BarChart3,
  Clock,
  FlaskConical,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_API === "true";

// ── Marketing copy ─────────────────────────────────────────────────────────

const BENEFITS = [
  {
    icon: Zap,
    text: "Collect rent in one click — mobile money, bank, or card",
  },
  { icon: Users, text: "Onboard tenants in minutes, not days" },
  {
    icon: BarChart3,
    text: "Know your occupancy and revenue the moment it changes",
  },
  {
    icon: Clock,
    text: "Automated late-fee reminders so you never chase again",
  },
];

const STATS = [
  { value: "1,200+", label: "Units managed" },
  { value: "98%", label: "On-time collection" },
  { value: "4.9★", label: "Landlord rating" },
];

// ── Dev user catalogue ─────────────────────────────────────────────────────

export const DEV_USERS = [
  {
    id: "user-superadmin-1",
    role: "superadmin" as const,
    name: "Crib Admin",
    email: "admin@crib.ug",
    initials: "CA",
    description: "Full platform access",
    gradient: "from-violet-500 to-indigo-600",
    badge: "Superadmin",
    badgeColor:
      "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  },
  {
    id: "user-landlord-1",
    role: "owner" as const,
    name: "Robert Mukasa",
    email: "robert@crib.ug",
    initials: "RM",
    description: "3 properties · Kampala",
    gradient: "from-blue-500 to-cyan-600",
    badge: "Owner",
    badgeColor:
      "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  },
  {
    id: "user-manager-1",
    role: "manager" as const,
    name: "Sarah Nalwanga",
    email: "sarah@crib.ug",
    initials: "SN",
    description: "Property Manager",
    gradient: "from-emerald-500 to-teal-600",
    badge: "Manager",
    badgeColor:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  },
  {
    id: "tenant-1",
    role: "tenant" as const,
    name: "Aisha Nakawunde",
    email: "aisha.nakawunde@gmail.com",
    initials: "AN",
    description: "Unit 1 · Kololo Heights",
    gradient: "from-amber-500 to-orange-600",
    badge: "Tenant",
    badgeColor:
      "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  },
];

// ── Dev login panel ────────────────────────────────────────────────────────

function DevLoginPanel() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function loginAs(user: (typeof DEV_USERS)[number]) {
    setLoading(user.id);
    try {
      const res = await fetch("/api/auth/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, role: user.role }),
      });
      if (!res.ok) throw new Error("Dev login failed");
      // Write localStorage BEFORE navigating so useAuth bootstrap finds it
      localStorage.setItem("crib:dev_user_id", user.id);
      const dest = user.role === "tenant" ? "/portal" : "/";
      router.push(dest);
    } catch {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <FlaskConical className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-semibold text-foreground">
          Dev mode — sign in as
        </span>
        <span className="rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 text-[10px] font-medium px-2 py-0.5">
          MOCK
        </span>
      </div>
      {DEV_USERS.map((user) => (
        <button
          key={user.id}
          onClick={() => loginAs(user)}
          disabled={!!loading}
          className={cn(
            "w-full flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5 text-left",
            "hover:border-primary/50 hover:bg-muted/40 transition-all",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          {/* Avatar */}
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white text-xs font-bold bg-gradient-to-br",
              user.gradient,
            )}
          >
            {loading === user.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              user.initials
            )}
          </div>
          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground leading-none">
                {user.name}
              </span>
              <span
                className={cn(
                  "text-[10px] font-medium rounded-full px-1.5 py-0.5 leading-none",
                  user.badgeColor,
                )}
              >
                {user.badge}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {user.description}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      ))}
      <p className="text-[11px] text-muted-foreground/60 text-center pt-1">
        Only available when{" "}
        <code className="font-mono">NEXT_PUBLIC_MOCK_API=true</code>
      </p>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/";
  const [loading, setLoading] = useState(false);

  const handleLogin = () => {
    setLoading(true);
    // Delegate to the server-side SDK sign-in route which handles PKCE,
    // resource scoping, and org-scoped token requests correctly.
    window.location.href = `/api/logto/sign-in?redirectTo=${encodeURIComponent(redirect)}`;
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* ── LEFT — Sign-in form ───────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center p-8 lg:p-12 bg-background lg:w-1/2 lg:flex-none">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-10">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Building2 className="h-4.5 w-4.5" />
            </div>
            <span className="text-xl font-bold tracking-tight">Crib</span>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {IS_MOCK ? "Choose your account" : "Welcome back"}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {IS_MOCK
                ? "Select a role to explore the dashboard."
                : "Sign in to your Crib account to continue."}
            </p>
          </div>

          {/* Dev picker OR Logto button */}
          {IS_MOCK ? (
            <DevLoginPanel />
          ) : (
            <>
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

              <div className="grid grid-cols-3 gap-3 mb-8">
                {["End-to-end encrypted", "GDPR compliant", "SOC 2 ready"].map(
                  (label) => (
                    <div
                      key={label}
                      className="flex items-center justify-center rounded-lg border border-border bg-muted/40 px-2 py-2.5 text-center"
                    >
                      <span className="text-[10px] font-medium text-muted-foreground leading-tight">
                        {label}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </>
          )}

          {/* Footer links */}
          {!IS_MOCK && (
            <>
              <p className="text-center text-sm text-muted-foreground">
                Don&apos;t have an account?{" "}
                <a
                  href="/signup"
                  className="font-medium text-primary hover:underline underline-offset-4"
                >
                  Sign up free
                </a>
              </p>
              <p className="mt-6 text-center text-[11px] text-muted-foreground/70 leading-relaxed">
                By continuing, you agree to our{" "}
                <a
                  href="/terms"
                  className="underline underline-offset-2 hover:text-muted-foreground"
                >
                  Terms of Service
                </a>{" "}
                and{" "}
                <a
                  href="/privacy"
                  className="underline underline-offset-2 hover:text-muted-foreground"
                >
                  Privacy Policy
                </a>
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── RIGHT — Marketing copy ────────────────────────────── */}
      <div
        className={cn(
          "hidden lg:flex flex-col justify-between overflow-hidden",
          "flex-1 min-h-screen p-12",
          "bg-[radial-gradient(ellipse_at_top_right,_#312e81_0%,_#1e1b4b_40%,_#0f0a2e_100%)]",
        )}
      >
        {/* Mesh glow */}
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: `
              radial-gradient(circle at 80% 20%, rgba(139,92,246,0.45) 0%, transparent 50%),
              radial-gradient(circle at 20% 80%, rgba(99,102,241,0.3) 0%, transparent 50%)
            `,
          }}
          aria-hidden="true"
        />

        {/* Top badge */}
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1">
            <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
            <span className="text-xs font-medium text-violet-200">
              Uganda&apos;s #1 Property Platform
            </span>
          </div>
        </div>

        {/* Main copy */}
        <div className="relative z-10 flex-1 flex flex-col justify-center space-y-8 py-8">
          <div className="space-y-4">
            <h2 className="text-4xl font-extrabold text-white leading-tight tracking-tight">
              Stop chasing rent.
              <br />
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
          <ul className="space-y-3.5">
            {BENEFITS.map((b) => (
              <li key={b.text} className="flex items-center gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/20 border border-violet-400/20">
                  <b.icon className="h-3.5 w-3.5 text-violet-300" />
                </div>
                <span className="text-sm text-white/75">{b.text}</span>
              </li>
            ))}
          </ul>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-center backdrop-blur-sm"
              >
                <p className="text-xl font-bold text-white">{s.value}</p>
                <p className="text-[11px] text-white/50 mt-0.5 leading-tight">
                  {s.label}
                </p>
              </div>
            ))}
          </div>

          {/* Testimonial */}
          <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 space-y-3">
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star
                  key={i}
                  className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400"
                />
              ))}
            </div>
            <p className="text-sm text-white/70 leading-relaxed italic">
              &ldquo;Before Crib I was using WhatsApp and Excel. Now I manage 18
              units from my phone and collect rent on the 1st of every month
              without calling a single tenant.&rdquo;
            </p>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-400 text-white text-xs font-bold">
                JK
              </div>
              <div>
                <p className="text-xs font-semibold text-white/90">
                  James Kizito
                </p>
                <p className="text-[11px] text-white/45">
                  Landlord · 18 units · Kampala
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="relative z-10 text-xs text-white/25">
          © {new Date().getFullYear()} Crib. All rights reserved.
        </p>
      </div>
    </div>
  );
}
