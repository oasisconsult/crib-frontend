"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Building2,
  Loader2,
  ShieldCheck,
  Zap,
  Users,
  BarChart3,
  Clock,
  FlaskConical,
  ChevronRight,
  CheckCircle2,
  TrendingUp,
  Home,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_API === "true";

// ── Marketing copy ─────────────────────────────────────────────────────────

const BENEFITS = [
  {
    icon: Zap,
    title: "Rent collection in one click",
    text: "Mobile money, bank transfer, or card — all in one place",
  },
  {
    icon: Users,
    title: "Onboard tenants in minutes",
    text: "Digital applications, e-signatures, and instant notifications",
  },
  {
    icon: BarChart3,
    title: "Live revenue dashboard",
    text: "Know your occupancy and income the moment it changes",
  },
  {
    icon: Clock,
    title: "Automated reminders",
    text: "Late-fee notices sent automatically so you never chase again",
  },
];

const STATS = [
  { value: "1,200+", label: "Units managed", icon: Home },
  { value: "98%", label: "On-time collection", icon: TrendingUp },
  { value: "4.9★", label: "Landlord rating", icon: CheckCircle2 },
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
    badgeColor: "bg-violet-100 text-violet-700",
  },
  {
    id: "user-landlord-1",
    role: "owner" as const,
    roles: ["owner"],
    name: "Robert Mukasa",
    email: "robert@crib.ug",
    initials: "RM",
    description: "3 properties · Kampala",
    gradient: "from-[#239487] to-[#16665D]",
    badge: "Owner",
    badgeColor: "bg-[#F3FCFA] text-[#16665D]",
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
    badgeColor: "bg-emerald-100 text-emerald-700",
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
    badgeColor: "bg-violet-100 text-violet-700",
  },
  {
    id: "owner-manager-1",
    role: "owner" as const,
    roles: ["owner", "manager"],
    name: "Owner Manager",
    email: "owner.manager@crib.ug",
    initials: "OM",
    description: "Owns & manages properties",
    gradient: "from-[#239487] to-emerald-600",
    badge: "Owner · Manager",
    badgeColor: "bg-[#F3FCFA] text-[#16665D]",
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
    badgeColor: "bg-amber-100 text-amber-700",
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
        body: JSON.stringify({
          userId: user.id,
          role: user.role,
          roles: user.roles,
        }),
      });
      if (!res.ok) throw new Error("Dev login failed");
      localStorage.setItem("crib:dev_user_id", user.id);
      const isStaff = user.roles.some((r) => r !== "tenant");
      router.push(isStaff ? "/" : "/portal");
    } catch {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 mb-4">
        <FlaskConical className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
          Dev mode — sign in as
        </span>
        <span className="rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium px-2 py-0.5">
          MOCK
        </span>
      </div>
      {DEV_USERS.map((user) => (
        <button
          key={user.id}
          onClick={() => loginAs(user)}
          disabled={!!loading}
          className={cn(
            "w-full flex items-center gap-3 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2.5 text-left",
            "hover:border-[hsl(var(--primary))]/50 hover:bg-[hsl(var(--accent))] transition-all",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] text-white text-xs font-bold bg-gradient-to-br",
              user.gradient,
            )}
          >
            {loading === user.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              user.initials
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[hsl(var(--foreground))] leading-none">
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
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
              {user.description}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))] shrink-0" />
        </button>
      ))}
      <p className="text-[11px] text-[hsl(var(--muted-foreground))]/60 text-center pt-1">
        Only available when{" "}
        <code className="font-mono">NEXT_PUBLIC_MOCK_API=true</code>
      </p>
    </div>
  );
}

// ── Marketing panel ────────────────────────────────────────────────────────

function MarketingPanel() {
  return (
    <div className="flex flex-col justify-between h-full py-4">
      {/* Headline */}
      <div>
        <div className="inline-flex items-center gap-2 rounded-full bg-white/15 border border-white/20 px-3 py-1 mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-[hsl(43,100%,60%)]" />
          <span className="text-[12px] font-medium text-white/90 tracking-wide">
            Trusted by 200+ landlords in Uganda
          </span>
        </div>
        <h2 className="text-3xl lg:text-4xl font-bold text-white leading-tight mb-4">
          Property management
          <br />
          <span className="text-[hsl(43,100%,68%)]">that works for you</span>
        </h2>
        <p className="text-white/75 text-base leading-relaxed max-w-sm">
          Everything you need to run a profitable rental portfolio — from tenant
          onboarding to rent collection.
        </p>
      </div>

      {/* Benefits list */}
      <div className="space-y-3 my-8">
        {BENEFITS.map((b) => {
          const Icon = b.icon;
          return (
            <div key={b.title} className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-white/15 border border-white/20">
                <Icon className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white leading-tight">
                  {b.title}
                </p>
                <p className="text-xs text-white/65 mt-0.5 leading-relaxed">
                  {b.text}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/15">
        {STATS.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="text-center">
              <Icon className="h-4 w-4 text-[hsl(43,100%,68%)] mx-auto mb-1" />
              <p className="text-xl font-bold text-white leading-none">
                {s.value}
              </p>
              <p className="text-[11px] text-white/60 mt-0.5">{s.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Page content (useSearchParams requires Suspense in Next.js 15) ──────────

function LoginContent() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/dashboard";
  const [loading, setLoading] = useState(false);

  const handleLogin = () => {
    setLoading(true);
    window.location.href = `/api/logto/sign-in?redirectTo=${encodeURIComponent(redirect)}`;
  };

  return (
    <div className="min-h-screen flex bg-[hsl(var(--background))]">
      {/* ── Left — Login form ───────────────────────────────────────────── */}
      <div className="flex flex-col justify-center w-full md:w-[45%] lg:w-[42%] px-8 sm:px-12 py-12 bg-[hsl(var(--card))]">
        <div className="w-full max-w-sm mx-auto">
          {/* Logo */}
          <div className="mb-10">
            <Link href="/" aria-label="Go to Crib home">
              <Image
                src="/crib-icon-green.png"
                alt="Crib"
                width={160}
                height={40}
                priority
                className="h-11 sm:h-12 md:h-14 w-auto"
              />
            </Link>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-[hsl(var(--foreground))] mb-1.5">
              {IS_MOCK ? "Choose your account" : "Welcome back"}
            </h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
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
                className="w-full h-11 text-sm font-semibold"
                size="lg"
                onClick={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Building2 className="h-4 w-4" />
                )}
                {loading ? "Redirecting…" : "Sign in to Crib"}
              </Button>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[hsl(var(--border))]" />
                </div>
                <div className="relative flex justify-center">
                  <span className="flex items-center gap-1.5 bg-[hsl(var(--card))] px-3 text-xs text-[hsl(var(--muted-foreground))]">
                    <ShieldCheck className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
                    Secured by GeoBox OAuth
                  </span>
                </div>
              </div>

              {/* Trust badges */}
              <div className="grid grid-cols-3 gap-2 mb-8">
                {["End-to-end encrypted", "Data protection compliant", "SOC 2 ready"].map(
                  (label) => (
                    <div
                      key={label}
                      className="flex items-center justify-center rounded-[var(--radius-md)] border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-2 py-2.5 text-center"
                    >
                      <span className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] leading-tight">
                        {label}
                      </span>
                    </div>
                  ),
                )}
              </div>

              {/* Sign up link */}
              {/* <p className="text-center text-sm text-[hsl(var(--muted-foreground))]">
                Don&apos;t have an account?{" "}
                <a
                  href="/signup"
                  className="font-semibold text-[hsl(var(--primary))] hover:underline"
                >
                  Sign up free
                </a>
              </p> */}

              {/* Legal */}
              <p className="mt-6 text-center text-[11px] text-[hsl(var(--muted-foreground))]/70 leading-relaxed">
                By continuing, you agree to our{" "}
                <a
                  href="/terms"
                  className="underline hover:text-[hsl(var(--foreground))]"
                >
                  Terms of Service
                </a>{" "}
                and{" "}
                <a
                  href="/privacy"
                  className="underline hover:text-[hsl(var(--foreground))]"
                >
                  Privacy Policy
                </a>
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Right — Marketing panel (hidden on mobile) ──────────────────── */}
      <div
        className="hidden md:flex flex-col justify-center flex-1 px-10 lg:px-14 py-12 relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, #0B3B36 0%, #16665D 45%, #239487 100%)",
        }}
      >
        {/* Decorative circles */}
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-white/5" />
        <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-white/5" />
        <div className="absolute top-1/2 right-8 h-32 w-32 rounded-full bg-white/5" />

        <div className="relative z-10 max-w-md">
          <MarketingPanel />
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
