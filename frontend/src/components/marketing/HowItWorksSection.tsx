import { Building2, Users, TrendingUp, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    number: "01",
    icon: Building2,
    title: "Add your properties",
    desc: "Create your property portfolio in minutes. Add units, set rent amounts, and configure rules for each property.",
    color: "bg-[#f3fcfa] text-[#239487]",
    border: "border-[#239487]/20",
  },
  {
    number: "02",
    icon: Users,
    title: "Manage tenants and operations",
    desc: "Onboard tenants digitally, track lease agreements, handle maintenance requests, and communicate — all from one place.",
    color: "bg-indigo-50 text-indigo-600",
    border: "border-indigo-200",
  },
  {
    number: "03",
    icon: TrendingUp,
    title: "Track and grow your business",
    desc: "Get clear insights into your rental income, occupancy, and outstanding payments. Make informed decisions about your portfolio.",
    color: "bg-emerald-50 text-emerald-600",
    border: "border-emerald-200",
  },
];

export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="bg-[#f9fafb] py-20 lg:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">

        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#239487] mb-3">
            How It Works
          </p>
          <h2
            id="how-it-works-heading"
            className="text-3xl sm:text-4xl font-bold tracking-tight text-[hsl(var(--foreground))] mb-4"
          >
            Get up and running in under an hour
          </h2>
          <p className="text-[hsl(var(--muted-foreground))] text-lg leading-relaxed">
            No lengthy onboarding. No training required. Crib is built to be intuitive
            from day one — whether you have 2 units or 200.
          </p>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Connector line (desktop) */}
          <div
            aria-hidden="true"
            className="hidden lg:block absolute top-16 left-[calc(16.67%-1px)] right-[calc(16.67%-1px)] h-px bg-gradient-to-r from-transparent via-[hsl(var(--border))] to-transparent"
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {STEPS.map(({ number, icon: Icon, title, desc, color, border }, i) => (
              <div key={i} className="relative flex flex-col items-center text-center">
                {/* Icon circle */}
                <div className={`relative z-10 mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border-2 ${color} ${border} bg-white shadow-sm`}>
                  <Icon className="h-7 w-7" aria-hidden="true" />
                  <span className="absolute -top-2.5 -right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-[hsl(var(--foreground))] text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                </div>

                {/* Step number */}
                <p className="text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2">
                  Step {number}
                </p>

                <h3 className="text-lg font-bold text-[hsl(var(--foreground))] mb-3">
                  {title}
                </h3>
                <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed max-w-xs">
                  {desc}
                </p>

                {/* Arrow between steps */}
                {i < STEPS.length - 1 && (
                  <ArrowRight
                    className="lg:hidden mt-6 h-5 w-5 text-[hsl(var(--muted-foreground))]/40 rotate-90"
                    aria-hidden="true"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-14 text-center">
          <Button asChild size="xl">
            <Link href="/login?action=register">
              Start for free — no card required
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
