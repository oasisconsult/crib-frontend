import { ArrowRight, CheckCircle, Bell, Wrench, MessageCircle } from "lucide-react";

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
    { label: "Properties", value: "12",       dot: "bg-[#239487]" },
    { label: "Tenants",    value: "84",       dot: "bg-indigo-400" },
    { label: "Revenue",    value: "UGX 8.4M", dot: "bg-emerald-400" },
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
      {/* Browser chrome — light macOS style */}
      <div className="relative rounded-xl overflow-hidden border border-gray-200 shadow-[0_20px_48px_rgba(0,0,0,0.12)]">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#ececec] border-b border-gray-300">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          <div className="mx-auto flex items-center gap-1.5 rounded-md bg-white/80 border border-gray-300 px-3 py-1">
            <div className="h-2 w-2 rounded-full bg-[#239487]" />
            <span className="text-[11px] text-gray-500 font-mono">app.crib.ug/dashboard</span>
          </div>
        </div>

        {/* App frame — light mode */}
        <div className="flex h-[340px] bg-[#f9fafb]">

          {/* Sidebar */}
          <div className="w-40 shrink-0 bg-white border-r border-gray-200 flex flex-col">
            <div className="p-3 border-b border-gray-100">
              {/* Real Crib logo — decorative */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/crib-icon-green.png" alt="" className="h-5 w-auto" />
            </div>
            <nav className="flex-1 p-2 space-y-0.5">
              {sidebarItems.map(item => (
                <div
                  key={item.label}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded text-[11px] font-medium ${
                    item.active
                      ? "bg-[#f3fcfa] text-[#239487]"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  <div className={`h-1.5 w-1.5 rounded-full ${item.active ? "bg-[#239487]" : "bg-gray-300"}`} />
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
                <div className="h-2.5 w-28 rounded-full bg-gray-200 mb-1" />
                <div className="h-1.5 w-20 rounded-full bg-gray-100" />
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-6 w-6 rounded-full bg-[#239487]/10 flex items-center justify-center">
                  <Bell className="h-3 w-3 text-[#239487]" />
                </div>
                <div className="h-6 w-6 rounded-full bg-gray-200" />
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2">
              {stats.map(s => (
                <div key={s.label} className="rounded-lg bg-white border border-gray-200 p-2.5 shadow-sm">
                  <div className={`h-1.5 w-1.5 rounded-full ${s.dot} mb-1.5`} />
                  <div className="text-[11px] font-bold text-gray-800 leading-none mb-0.5">{s.value}</div>
                  <div className="text-[9px] text-gray-400">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Tenant list */}
            <div className="rounded-lg bg-white border border-gray-200 overflow-hidden shadow-sm">
              <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Recent Tenants
                </span>
              </div>
              {tenantRows.map((row, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-5 rounded-full bg-[#239487]/15 flex items-center justify-center text-[9px] font-bold text-[#239487]">
                      {row.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-[10px] font-medium text-gray-700">{row.name}</div>
                      <div className="text-[9px] text-gray-400">{row.unit}</div>
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

      {/* Floating: rent collected badge */}
      <div className="absolute -bottom-4 -left-4 z-10 flex items-center gap-2 rounded-xl bg-white shadow-lg border border-[hsl(var(--border))] px-3 py-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle className="h-4 w-4 text-emerald-600" />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[hsl(var(--foreground))]">Rent collected</p>
          <p className="text-[10px] text-[hsl(var(--muted-foreground))]">UGX 450,000 · Apt 3A</p>
        </div>
      </div>

      {/* Floating: maintenance resolved badge */}
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
      {/* Subtle radial teal glow — no dot grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 55% at 75% 45%, rgba(35,148,135,0.07) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6 py-20 lg:py-28">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* Left — copy ──────────────────────────────────────────────── */}
          <div className="space-y-8">

            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-[#239487]/30 bg-[#f3fcfa] px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#239487] animate-pulse" aria-hidden="true" />
              <span className="text-xs font-semibold text-[#16665d]">
                300+ landlords across Uganda
              </span>
            </div>

            {/* Headline */}
            <div className="space-y-4">
              <h1
                id="hero-headline"
                className="text-4xl sm:text-5xl lg:text-[3.25rem] font-bold tracking-tight text-[hsl(var(--foreground))] leading-[1.1]"
              >
                Manage your rental properties{" "}
                <span className="text-[#239487]">without the chaos.</span>
              </h1>
              <p className="text-lg text-[hsl(var(--muted-foreground))] leading-relaxed max-w-lg">
                Crib gives landlords and property managers across Uganda a clear view of every
                property, every tenant, and every rent payment — from one organised platform.
              </p>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-start gap-3">
              <Button asChild size="xl">
                <a href="#booking">
                  Book a Demo
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </Button>
              <Button asChild variant="outline" size="xl">
                <a
                  href="https://wa.me/256700000000"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  Chat on WhatsApp
                </a>
              </Button>
            </div>

            {/* Trust signals — local, operational */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
              {[
                "1,200+ units managed",
                "Kampala · Wakiso · Entebbe · Jinja",
                "Free plan available",
              ].map(t => (
                <span
                  key={t}
                  className="flex items-center gap-1.5 text-sm text-[hsl(var(--muted-foreground))]"
                >
                  <CheckCircle className="h-3.5 w-3.5 text-[#239487] shrink-0" aria-hidden="true" />
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Right — dashboard illustration ───────────────────────────── */}
          <div className="relative lg:pl-6">
            <DashboardMockup />
          </div>

        </div>
      </div>
    </section>
  );
}
