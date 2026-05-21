import Link from "next/link";
import { ArrowRight, Building2, Users, TrendingUp, Bell, CheckCircle, Home, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

// ── CSS-only dashboard illustration ─────────────────────────────────────────

function DashboardMockup() {
  const sidebarItems = [
    { label: "Dashboard",   active: true  },
    { label: "Properties",  active: false },
    { label: "Tenants",     active: false },
    { label: "Payments",    active: false },
    { label: "Maintenance", active: false },
  ];

  const stats = [
    { label: "Properties", value: "12",     color: "bg-[#239487]" },
    { label: "Tenants",    value: "84",     color: "bg-indigo-500" },
    { label: "Revenue",    value: "UGX 8.4M", color: "bg-emerald-500" },
  ];

  const tenantRows = [
    { name: "Grace Nakato",   unit: "Apt 3A", status: "Paid",    statusColor: "bg-emerald-100 text-emerald-700" },
    { name: "John Ssemwanga", unit: "Apt 1B", status: "Due",     statusColor: "bg-amber-100 text-amber-700" },
    { name: "Amina Hassan",   unit: "Apt 5C", status: "Paid",    statusColor: "bg-emerald-100 text-emerald-700" },
    { name: "Peter Okello",   unit: "Apt 2D", status: "Overdue", statusColor: "bg-red-100 text-red-700" },
  ];

  return (
    <div
      aria-hidden="true"
      className="relative w-full max-w-2xl mx-auto select-none"
      role="img"
    >
      {/* Glow effect behind the window */}
      <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-[#239487]/20 via-teal-300/10 to-indigo-400/10 blur-2xl" />

      {/* Browser chrome */}
      <div className="relative rounded-xl overflow-hidden border border-[#334155] shadow-[0_32px_64px_rgba(0,0,0,0.35)]">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#1e2a3a] border-b border-white/10">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          <div className="mx-auto flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1">
            <div className="h-2 w-2 rounded-full bg-[#239487]" />
            <span className="text-[11px] text-white/50 font-mono">app.crib.ug/dashboard</span>
          </div>
        </div>

        {/* App frame */}
        <div className="flex h-[340px] bg-[#0f172a]">

          {/* Sidebar */}
          <div className="w-40 shrink-0 bg-[#1a2535] border-r border-white/[0.07] flex flex-col">
            <div className="p-3 border-b border-white/[0.07]">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded bg-[#239487] flex items-center justify-center">
                  <Home className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-xs font-bold text-white">Crib</span>
              </div>
            </div>
            <nav className="flex-1 p-2 space-y-0.5">
              {sidebarItems.map(item => (
                <div
                  key={item.label}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded text-[11px] font-medium ${
                    item.active
                      ? "bg-[#239487]/20 text-[#4ecdc4]"
                      : "text-white/40"
                  }`}
                >
                  <div className={`h-1.5 w-1.5 rounded-full ${item.active ? "bg-[#239487]" : "bg-white/20"}`} />
                  {item.label}
                </div>
              ))}
            </nav>
          </div>

          {/* Main content */}
          <div className="flex-1 overflow-hidden p-4 space-y-3">
            {/* Header row */}
            <div className="flex items-center justify-between">
              <div>
                <div className="h-2.5 w-28 rounded-full bg-white/20 mb-1" />
                <div className="h-1.5 w-20 rounded-full bg-white/10" />
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-6 w-6 rounded-full bg-[#239487]/30 flex items-center justify-center">
                  <Bell className="h-3 w-3 text-[#4ecdc4]" />
                </div>
                <div className="h-6 w-6 rounded-full bg-white/10" />
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2">
              {stats.map(s => (
                <div key={s.label} className="rounded-lg bg-white/[0.05] border border-white/[0.06] p-2.5">
                  <div className={`h-1.5 w-1.5 rounded-full ${s.color} mb-1.5`} />
                  <div className="text-[11px] font-bold text-white leading-none mb-0.5">{s.value}</div>
                  <div className="text-[9px] text-white/40">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Tenant list */}
            <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] overflow-hidden">
              <div className="px-3 py-1.5 border-b border-white/[0.06]">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
                  Recent Tenants
                </span>
              </div>
              {tenantRows.map((row, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.04] last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-5 rounded-full bg-[#239487]/30 flex items-center justify-center text-[9px] font-bold text-[#4ecdc4]">
                      {row.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-[10px] font-medium text-white/70">{row.name}</div>
                      <div className="text-[9px] text-white/30">{row.unit}</div>
                    </div>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ${row.statusColor}`}>
                    {row.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Floating notification card */}
      <div className="absolute -bottom-4 -left-4 z-10 flex items-center gap-2 rounded-xl bg-white shadow-lg border border-[hsl(var(--border))] px-3 py-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle className="h-4 w-4 text-emerald-600" />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[hsl(var(--foreground))]">Rent collected</p>
          <p className="text-[10px] text-[hsl(var(--muted-foreground))]">UGX 450,000 · Apt 3A</p>
        </div>
      </div>

      {/* Floating maintenance card */}
      <div className="absolute -top-4 -right-4 z-10 flex items-center gap-2 rounded-xl bg-white shadow-lg border border-[hsl(var(--border))] px-3 py-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100">
          <Wrench className="h-4 w-4 text-amber-600" />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[hsl(var(--foreground))]">Maintenance resolved</p>
          <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Unit 2B · Plumbing</p>
        </div>
      </div>
    </div>
  );
}

// ── Hero Section ────────────────────────────────────────────────────────────

export function HeroSection() {
  return (
    <section
      id="hero"
      aria-labelledby="hero-headline"
      className="relative min-h-screen flex items-center pt-16 overflow-hidden bg-white"
    >
      {/* Subtle background grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          opacity: 0.4,
        }}
      />
      {/* Gradient overlay to fade grid at edges */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white via-transparent to-[#f3fcfa]/60"
      />

      <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6 py-20 lg:py-28">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* Left: copy */}
          <div className="space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-[#239487]/30 bg-[#f3fcfa] px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#239487] animate-pulse" />
              <span className="text-xs font-semibold text-[#16665d]">
                Built for African landlords &amp; property managers
              </span>
            </div>

            {/* Headline */}
            <div className="space-y-3">
              <h1
                id="hero-headline"
                className="text-4xl sm:text-5xl lg:text-[3.25rem] font-bold tracking-tight text-[hsl(var(--foreground))] leading-[1.1]"
              >
                Property management{" "}
                <span className="text-[#239487]">that actually works.</span>
              </h1>
              <p className="text-lg sm:text-xl text-[hsl(var(--muted-foreground))] leading-relaxed max-w-lg">
                Crib helps landlords and property managers track rent, manage tenants,
                handle maintenance, and run their entire rental portfolio — from one
                organised platform.
              </p>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-start gap-3">
              <Button asChild size="xl">
                <a href="#booking">
                  Get Started Free
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button asChild variant="outline" size="xl">
                <a href="#how-it-works">See how it works</a>
              </Button>
            </div>

            {/* Trust signals */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2">
              {[
                "Free plan available",
                "No credit card required",
                "Set up in minutes",
              ].map(t => (
                <span key={t} className="flex items-center gap-1.5 text-sm text-[hsl(var(--muted-foreground))]">
                  <CheckCircle className="h-3.5 w-3.5 text-[#239487] shrink-0" />
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Right: dashboard illustration */}
          <div className="relative lg:pl-6">
            <DashboardMockup />
          </div>
        </div>
      </div>
    </section>
  );
}
