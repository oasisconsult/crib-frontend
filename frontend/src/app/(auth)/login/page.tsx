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

const DEV_USERS = [
  {
    id: "user-superadmin-1",
    role: "superadmin" as const,
    roles: ["superadmin"],
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
    roles: ["owner"],
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
    roles: ["manager"],
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
    id: "superadmin-manager-1",
    role: "superadmin" as const,
    roles: ["superadmin", "manager"],
    name: "Super Manager",
    email: "super.manager@crib.ug",
    initials: "SM",
    description: "Platform admin + property manager",
    gradient: "from-violet-500 to-emerald-600",
    badge: "Superadmin · Manager",
    badgeColor:
      "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  },
  {
    id: "owner-manager-1",
    role: "owner" as const,
    roles: ["owner", "manager"],
    name: "Owner Manager",
    email: "owner.manager@crib.ug",
    initials: "OM",
    description: "Owns & manages properties",
    gradient: "from-blue-500 to-emerald-600",
    badge: "Owner · Manager",
    badgeColor:
      "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  },
  {
    id: "tenant-1",
    role: "tenant" as const,
    roles: ["tenant"],
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
        body: JSON.stringify({ userId: user.id, role: user.role, roles: user.roles }),
      });
      if (!res.ok) throw new Error("Dev login failed");
      // Write localStorage BEFORE navigating so useAuth bootstrap finds it
      localStorage.setItem("crib:dev_user_id", user.id);
      const isStaff = user.roles.some((r) => r !== "tenant");
      const dest = isStaff ? "/" : "/portal";
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
    <div className="min-h-screen flex">
      {/* ── LEFT — Sign-in form ───────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center p-8 lg:p-12 bg-white">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white">
              <Building2 className="h-5 w-5" />
            </div>
            <span className="text-2xl font-bold text-gray-900">Crib</span>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {IS_MOCK ? "Choose your account" : "Welcome back"}
            </h1>
            <p className="text-gray-600">
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
                className="w-full h-12 text-base font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg"
                size="lg"
                onClick={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                ) : (
                  <Building2 className="h-5 w-5 mr-2" />
                )}
                {loading ? "Redirecting…" : "Continue with Logto"}
              </Button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center">
                  <span className="flex items-center gap-1.5 bg-white px-3 text-xs text-gray-500">
                    <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
                    Secured by Logto OIDC
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-8">
                {["End-to-end encrypted", "GDPR compliant", "SOC 2 ready"].map(
                  (label) => (
                    <div
                      key={label}
                      className="flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 px-2 py-2.5 text-center"
                    >
                      <span className="text-[10px] font-medium text-gray-600 leading-tight">
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
              <p className="text-center text-sm text-gray-600">
                Don&apos;t have an account?{" "}
                <a
                  href="/signup"
                  className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Sign up free
                </a>
              </p>
              <p className="mt-6 text-center text-[11px] text-gray-500 leading-relaxed">
                By continuing, you agree to our{" "}
                <a
                  href="/terms"
                  className="underline hover:text-gray-700"
                >
                  Terms of Service
                </a>{" "}
                and{" "}
                <a
                  href="/privacy"
                  className="underline hover:text-gray-700"
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
          "bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700",
        )}
      >
        {/* Mesh glow */}
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: `
              radial-gradient(circle at 80% 20%, rgba(255,255,255,0.15) 0%, transparent 50%),
              radial-gradient(circle at 20% 80%, rgba(255,255,255,0.1) 0%, transparent 50%)
            `,
          }}
          aria-hidden="true"
        />

        {/* Top badge */}
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1">
            <Star className="h-3 w-3 text-yellow-300 fill-yellow-300" />
            <span className="text-xs font-medium text-white">
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
              <span className="bg-gradient-to-r from-blue-200 to-indigo-200 bg-clip-text text-transparent">
                Start growing your portfolio.
              </span>
            </h2>
            <p className="text-base text-white/80 max-w-sm leading-relaxed">
              Crib handles rent collection, tenant onboarding, lease management,
              and analytics — so you can focus on what matters.
            </p>
          </div>

          {/* Benefit bullets */}
          <ul className="space-y-3.5">
            {BENEFITS.map((b) => (
              <li key={b.text} className="flex items-center gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/20 border border-white/20">
                  <b.icon className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-sm text-white/90">{b.text}</span>
              </li>
            ))}
          </ul>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-white/20 bg-white/10 px-3 py-3 text-center backdrop-blur-sm"
              >
                <p className="text-xl font-bold text-white">{s.value}</p>
                <p className="text-[11px] text-white/70 mt-0.5 leading-tight">
                  {s.label}
                </p>
              </div>
            ))}
          </div>

          {/* Testimonial */}
          <div className="rounded-xl border border-white/20 bg-white/10 backdrop-blur-sm p-4 space-y-3">
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star
                  key={i}
                  className="h-3.5 w-3.5 text-yellow-300 fill-yellow-300"
                />
              ))}
            </div>
            <p className="text-sm text-white/80 leading-relaxed italic">
              &ldquo;Before Crib I was using WhatsApp and Excel. Now I manage 18
              units from my phone and collect rent on 1st of every month
              without calling a single tenant.&rdquo;
            </p>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-indigo-400 text-white text-xs font-bold">
                JK
              </div>
              <div>
                <p className="text-xs font-semibold text-white/95">
                  James Kizito
                </p>
                <p className="text-[11px] text-white/60">
                  Landlord · 18 units · Kampala
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="relative z-10 text-xs text-white/40">
          © {new Date().getFullYear()} Crib. All rights reserved.
        </p>
      </div>
    </div>
  );
}
