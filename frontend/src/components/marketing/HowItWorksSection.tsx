import { Building2, Users, TrendingUp, ArrowRight } from "lucide-react";

const STEPS = [
  {
    number: "01",
    icon: Building2,
    title: "Add your properties and units",
    desc: "Set up your portfolio in minutes. Add each property, define the units, set rent amounts, and you're ready to go.",
    color: "bg-[#f3fcfa] text-[#239487]",
    border: "border-[#239487]/20",
  },
  {
    number: "02",
    icon: Users,
    title: "Onboard your tenants",
    desc: "Invite tenants digitally, record lease agreements, and handle maintenance requests — all from one place your whole team can use.",
    color: "bg-indigo-50 text-indigo-600",
    border: "border-indigo-200",
  },
  {
    number: "03",
    icon: TrendingUp,
    title: "Track rent and stay in control",
    desc: "Monitor payments, see who's overdue, and get clear reports on your portfolio's performance — without chasing anyone manually.",
    color: "bg-emerald-50 text-emerald-600",
    border: "border-emerald-200",
  },
];

export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="bg-white py-20 lg:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">

        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#16665d] mb-3">
            How It Works
          </p>
          <h2
            id="how-it-works-heading"
            className="text-3xl sm:text-4xl font-bold tracking-tight text-[hsl(var(--foreground))] mb-4"
          >
            Set up in a day. Use it every day.
          </h2>
          <p className="text-[hsl(var(--muted-foreground))] text-lg leading-relaxed">
            No lengthy onboarding. No training required. Crib is built to be straightforward
            from day one.
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
                  <span
                    className="absolute -top-2.5 -right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-[hsl(var(--foreground))] text-[10px] font-bold text-white"
                    aria-label={`Step ${i + 1}`}
                  >
                    {i + 1}
                  </span>
                </div>

                <p className="text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2">
                  Step {number}
                </p>
                <h3 className="text-lg font-bold text-[hsl(var(--foreground))] mb-3">
                  {title}
                </h3>
                <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed max-w-xs">
                  {desc}
                </p>

                {/* Arrow between steps — mobile only */}
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
          <a
            href="#booking"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-6 py-3 text-sm font-semibold text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary))]/90 transition-colors"
          >
            Book a Demo
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>

      </div>
    </section>
  );
}
