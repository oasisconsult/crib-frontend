import {
  CreditCard, Users, Building2, Wrench, Home, BarChart3,
} from "lucide-react";

const FEATURES = [
  {
    icon: CreditCard,
    title: "Rent & Payment Tracking",
    desc: "Record every payment, track outstanding balances, and send automated reminders. Know exactly who has paid and who owes — without chasing anyone manually.",
    color: "bg-emerald-100 text-emerald-700",
  },
  {
    icon: Users,
    title: "Tenant Management",
    desc: "Onboard tenants digitally, store lease agreements, and keep a complete history for every occupant across all your properties.",
    color: "bg-violet-100 text-violet-700",
  },
  {
    icon: Building2,
    title: "Multi-Property Portfolio",
    desc: "Manage all your properties and units from one dashboard. No spreadsheets, no switching between tools, no losing track of which property is which.",
    color: "bg-[#f3fcfa] text-[#16665d]",
  },
  {
    icon: Home,
    title: "Occupancy Management",
    desc: "See which units are occupied, vacant, or reserved at a glance. Reduce the gap between tenancies and keep your portfolio earning.",
    color: "bg-sky-100 text-sky-700",
  },
  {
    icon: Wrench,
    title: "Maintenance Requests",
    desc: "Log, assign, and resolve maintenance issues with full status tracking. Nothing gets lost, forgotten, or stuck waiting for follow-up.",
    color: "bg-amber-100 text-amber-700",
  },
  {
    icon: BarChart3,
    title: "Reports & Insights",
    desc: "Understand your rental income, occupancy rates, and outstanding payments with clear reports. Make informed decisions about your portfolio.",
    color: "bg-indigo-100 text-indigo-700",
  },
];

export function FeaturesSection() {
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="bg-white py-20 lg:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">

        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#16665d] mb-3">
            What Crib Does
          </p>
          <h2
            id="features-heading"
            className="text-3xl sm:text-4xl font-bold tracking-tight text-[hsl(var(--foreground))] mb-4"
          >
            Everything you need to run your rental properties
          </h2>
          <p className="text-[hsl(var(--muted-foreground))] text-lg leading-relaxed">
            From rent collection to tenant records to maintenance — Crib handles the operational
            work so you can stay organised and in control.
          </p>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map(({ icon: Icon, title, desc, color }) => (
            <div
              key={title}
              className="rounded-xl border border-[hsl(var(--border))] bg-[#fafafa] p-6 hover:bg-white hover:shadow-sm transition-all duration-200"
            >
              <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${color} mb-4`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-[hsl(var(--foreground))] mb-2">
                {title}
              </h3>
              <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
                {desc}
              </p>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
