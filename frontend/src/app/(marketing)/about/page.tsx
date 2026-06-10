import type { Metadata } from "next";
import { Home, Globe, Shield, Zap, Target, Users } from "lucide-react";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";

export const metadata: Metadata = {
  title: "About — Crib",
  description:
    "Crib is a property operations platform built for landlords and property managers in Africa — modern, mobile-first, and focused on the day-to-day of running a rental business.",
};

const VALUES = [
  {
    icon: Home,
    title: "Built for Africa",
    desc: "Designed around how landlords and tenants actually operate in Uganda and across African cities — not copied from Western markets.",
  },
  {
    icon: Globe,
    title: "Mobile first",
    desc: "Your portfolio, your tenants, your cashflow — accessible from any device, at any time, from anywhere.",
  },
  {
    icon: Shield,
    title: "Secure and reliable",
    desc: "Role-based access, encrypted records, and an audit trail that keeps your data safe and your team accountable.",
  },
  {
    icon: Zap,
    title: "Operationally focused",
    desc: "Not a listings site, not a CRM. Crib is a day-to-day operational tool built to reduce admin and increase visibility.",
  },
];

const PRINCIPLES = [
  {
    icon: Target,
    title: "Our mission",
    desc: "To give every landlord and property manager in Africa — from a single apartment to a portfolio of hundreds of units — the same operational clarity that large institutional landlords take for granted.",
  },
  {
    icon: Users,
    title: "Who we build for",
    desc: "Independent landlords, agencies managing properties on behalf of owners, and the tenants and caretakers who keep those properties running day to day.",
  },
];

export default function AboutPage() {
  return (
    <MarketingPageShell
      eyebrow="About Crib"
      title="Modernising rental operations in Africa — one property at a time."
      description="Crib was built out of a simple observation: most landlords and property managers in Uganda are running sophisticated rental businesses on spreadsheets, notebooks, and WhatsApp groups. The tools exist — they just weren't built for this market."
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-16 space-y-20">
        {/* Story */}
        <section aria-labelledby="story-heading" className="mx-auto max-w-3xl space-y-4 text-[hsl(var(--muted-foreground))] leading-relaxed">
          <h2 id="story-heading" className="sr-only">Our story</h2>
          <p>
            We set out to build a property operations platform that is modern, practical, and
            genuinely useful for the way rental businesses work in Africa. Not a luxury listings
            site. Not a generic CRM. A focused operational tool that makes it easier to manage
            properties, tenants, and rent — every single day.
          </p>
          <p>
            From a single apartment to a portfolio of 100 units, Crib scales with your business
            and stays out of your way — handling leases, rent collection, maintenance requests,
            and tenant communication so you can focus on growing your portfolio instead of
            chasing paperwork.
          </p>
        </section>

        {/* Mission & audience */}
        <section aria-labelledby="principles-heading" className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <h2 id="principles-heading" className="sr-only">Our mission and who we build for</h2>
          {PRINCIPLES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-xl border border-[hsl(var(--border))] p-6">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#f3fcfa] text-[#239487] mb-3">
                <Icon className="h-4.5 w-4.5" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-1.5">{title}</h3>
              <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">{desc}</p>
            </div>
          ))}
        </section>

        {/* Values */}
        <section aria-labelledby="values-heading">
          <h2 id="values-heading" className="text-2xl font-bold tracking-tight text-[hsl(var(--foreground))] text-center mb-10">
            What guides how we build
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {VALUES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-xl border border-[hsl(var(--border))] p-5 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#f3fcfa] text-[#239487] mb-3">
                  <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                </div>
                <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-1.5">{title}</h3>
                <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </MarketingPageShell>
  );
}
