"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

// Prices match the seeded subscription_plans table exactly.
// UGX annual = total for the year (÷12 for per-month display).
// USD annual = total for the year in cents (÷12 for per-month display).
const PLANS = [
  {
    slug: "free",
    name: "Free",
    desc: "For landlords just getting started.",
    monthlyUGX: 0,
    annualUGX: 0,
    monthlyUSDCents: 0,
    annualUSDCents: 0,
    cta: "Start free",
    ctaVariant: "outline" as const,
    ctaType: "link" as const,
    ctaHref: "/login?action=register",
    features: [
      "1 property",
      "Up to 5 units",
      "1 user",
      "100 MB storage",
      "Basic analytics",
      "Tenant management",
    ],
    popular: false,
  },
  {
    slug: "professional",
    name: "Professional",
    desc: "For growing landlords who need more control.",
    monthlyUGX: 200_000,
    annualUGX: 1_920_000,
    monthlyUSDCents: 4_900,
    annualUSDCents: 47_000,
    cta: "Book a Demo",
    ctaVariant: "default" as const,
    ctaType: "anchor" as const,
    ctaHref: "#booking",
    features: [
      "10 properties",
      "Up to 50 units",
      "3 users",
      "2 GB storage",
      "Advanced analytics",
      "Maintenance workflows",
      "Document storage",
      "Tenant messaging",
    ],
    popular: true,
  },
  {
    slug: "agency",
    name: "Agency",
    desc: "For property management agencies with multiple clients.",
    monthlyUGX: 500_000,
    annualUGX: 4_800_000,
    monthlyUSDCents: 12_900,
    annualUSDCents: 123_800,
    cta: "Book a Demo",
    ctaVariant: "outline" as const,
    ctaType: "anchor" as const,
    ctaHref: "#booking",
    features: [
      "50 properties",
      "Up to 300 units",
      "15 users",
      "20 GB storage",
      "Everything in Professional",
      "Team management",
      "Custom branding",
      "Priority support",
    ],
    popular: false,
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    desc: "Unlimited scale with dedicated infrastructure and support.",
    monthlyUGX: null,   // custom quote — no fixed price
    annualUGX: null,
    monthlyUSDCents: null,
    annualUSDCents: null,
    cta: "Contact Sales",
    ctaVariant: "outline" as const,
    ctaType: "anchor" as const,
    ctaHref: "#booking",
    features: [
      "Unlimited properties",
      "Unlimited units",
      "Unlimited users",
      "Unlimited storage",
      "Everything in Agency",
      "Dedicated support",
      "API access",
      "SSO & audit logs",
    ],
    popular: false,
  },
];

function compactUGX(ugx: number): string {
  if (ugx >= 1_000_000) return `${(ugx / 1_000_000).toFixed(ugx % 1_000_000 === 0 ? 0 : 1)}M`;
  if (ugx >= 1_000)     return `${(ugx / 1_000).toFixed(ugx % 1_000 === 0 ? 0 : 1)}k`;
  return String(ugx);
}

function formatUSD(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(0)}`;
}

export function PricingSection() {
  const [annual, setAnnual] = useState(false);
  const [currency, setCurrency] = useState<"UGX" | "USD">("UGX");

  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="bg-[#fafafa] py-20 lg:py-28"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">

        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#16665d] mb-3">Pricing</p>
          <h2
            id="pricing-heading"
            className="text-3xl sm:text-4xl font-bold tracking-tight text-[hsl(var(--foreground))] mb-4"
          >
            Simple, transparent pricing
          </h2>
          <p className="text-[hsl(var(--muted-foreground))] text-lg leading-relaxed mb-8">
            Start free. Upgrade when you&apos;re ready. No hidden fees, no surprises.
          </p>

          {/* Billing + currency toggles */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {/* Billing period */}
            <div
              className="inline-flex items-center rounded-lg border border-[hsl(var(--border))] bg-white p-1 gap-0.5"
              role="group"
              aria-label="Billing period"
            >
              <button
                onClick={() => setAnnual(false)}
                aria-pressed={!annual}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-md transition-all cursor-pointer",
                  !annual
                    ? "bg-[hsl(var(--foreground))] text-[hsl(var(--background))] shadow-sm font-semibold"
                    : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
                )}
              >
                Monthly
              </button>
              <button
                onClick={() => setAnnual(true)}
                aria-pressed={annual}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-md transition-all cursor-pointer flex items-center gap-1.5",
                  annual
                    ? "bg-[hsl(var(--foreground))] text-[hsl(var(--background))] shadow-sm font-semibold"
                    : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
                )}
              >
                Annual
                <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                  Save 20%
                </span>
              </button>
            </div>

            {/* Currency */}
            <div
              className="inline-flex items-center rounded-lg border border-[hsl(var(--border))] bg-white p-1 gap-0.5"
              role="group"
              aria-label="Display currency"
            >
              {(["UGX", "USD"] as const).map(cur => (
                <button
                  key={cur}
                  onClick={() => setCurrency(cur)}
                  aria-pressed={currency === cur}
                  className={cn(
                    "px-4 py-2 text-sm font-medium rounded-md transition-all cursor-pointer",
                    currency === cur
                      ? "bg-[hsl(var(--foreground))] text-[hsl(var(--background))] shadow-sm font-semibold"
                      : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
                  )}
                >
                  {cur}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 items-start">
          {PLANS.map(plan => {
            const isFree = plan.slug === "free";

            // Per-month display price
            const isCustom = plan.monthlyUGX === null;
            const ugxPerMonth  = !isCustom && plan.annualUGX   != null ? (annual ? Math.round(plan.annualUGX / 12)     : plan.monthlyUGX!)     : 0;
            const usdPerMonth  = !isCustom && plan.annualUSDCents != null ? (annual ? Math.round(plan.annualUSDCents / 12) : plan.monthlyUSDCents!) : 0;

            const priceLabel = isFree
              ? "Free"
              : isCustom
                ? "Custom"
                : currency === "UGX"
                  ? compactUGX(ugxPerMonth)
                  : formatUSD(usdPerMonth);

            return (
              <div
                key={plan.slug}
                className={cn(
                  "relative flex flex-col rounded-xl border bg-white transition-all duration-200",
                  plan.popular
                    ? "border-[#239487] shadow-lg ring-1 ring-[#239487]/20 lg:scale-[1.02] lg:z-10"
                    : "border-[hsl(var(--border))] shadow-sm",
                )}
              >
                {/* Popular badge */}
                {plan.popular && (
                  <div className="absolute -top-3.5 inset-x-0 flex justify-center">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white border border-[#239487]/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#239487] shadow-sm">
                      <Zap className="h-3 w-3" aria-hidden="true" />
                      Most Popular
                    </span>
                  </div>
                )}

                {/* Header */}
                <div className={cn("p-6 rounded-t-xl", plan.popular && "bg-[#f3fcfa]")}>
                  <p className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-4">
                    {plan.name}
                  </p>

                  {/* Currency label */}
                  {!isFree && !isCustom && (
                    <p className="text-[11px] font-semibold tracking-widest uppercase text-[hsl(var(--muted-foreground))] mb-0.5">
                      {currency}
                    </p>
                  )}
                  {isCustom && <div className="h-4 mb-0.5" />}

                  {/* Price */}
                  <div className="flex items-baseline gap-1.5 mb-1">
                    <span className={cn("font-bold tracking-tight leading-none", isFree || isCustom ? "text-2xl" : "text-3xl")}>
                      {priceLabel}
                    </span>
                    {!isFree && !isCustom && <span className="text-sm text-[hsl(var(--muted-foreground))]">/mo</span>}
                  </div>

                  <div className="h-5 mb-3">
                    {!isFree && !isCustom && annual && (
                      <p className="text-xs font-medium text-emerald-700">Save 20% with annual billing</p>
                    )}
                    {!isFree && !isCustom && !annual && (
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">Billed monthly</p>
                    )}
                    {isFree && (
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">No credit card required</p>
                    )}
                    {isCustom && (
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">Tailored to your portfolio</p>
                    )}
                  </div>

                  <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">{plan.desc}</p>
                </div>

                {/* CTA */}
                <div className="px-6 pb-5">
                  {plan.ctaType === "link" ? (
                    <Button asChild variant={plan.ctaVariant} className="w-full">
                      <Link href={plan.ctaHref}>{plan.cta}</Link>
                    </Button>
                  ) : (
                    <Button asChild variant={plan.ctaVariant} className="w-full">
                      <a href={plan.ctaHref}>
                        {plan.cta}
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </a>
                    </Button>
                  )}
                </div>

                {/* Divider */}
                <div className="mx-6 border-t border-[hsl(var(--border))]" />

                {/* Features */}
                <div className="p-6 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-4">
                    Includes
                  </p>
                  <ul className="space-y-2.5">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-start gap-2.5 text-sm">
                        <div className="mt-0.5 h-4 w-4 rounded-full bg-[#f3fcfa] flex items-center justify-center shrink-0">
                          <Check className="h-2.5 w-2.5 text-[#239487]" aria-hidden="true" />
                        </div>
                        <span className="text-[hsl(var(--foreground))]">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>

        {/* VAT note */}
        <p className="text-xs text-center text-[hsl(var(--muted-foreground))] mt-8">
          All prices subject to 18% VAT. Annual plans billed once per year. Payments verified within 24 hours.
        </p>

      </div>
    </section>
  );
}
