import {
  Users, CreditCard, Building2, Wrench,
  BarChart3, Bell, ShieldCheck, FileText, Home,
} from "lucide-react";

const FEATURES = [
  {
    icon: Users,
    title: "Tenant Management",
    desc: "Onboard tenants digitally, store lease agreements, and keep a complete history for every occupant.",
    color: "bg-violet-100 text-violet-700",
  },
  {
    icon: CreditCard,
    title: "Rent & Payment Tracking",
    desc: "Record payments, track outstanding balances, and send automated reminders — no more chasing tenants.",
    color: "bg-emerald-100 text-emerald-700",
  },
  {
    icon: Building2,
    title: "Multi-Property Management",
    desc: "Manage all your properties and units from one dashboard. No spreadsheets, no switching between tools.",
    color: "bg-[#f3fcfa] text-[#16665d]",
  },
  {
    icon: Wrench,
    title: "Maintenance Requests",
    desc: "Log, assign, and resolve maintenance issues with full status tracking and tenant communication.",
    color: "bg-amber-100 text-amber-700",
  },
  {
    icon: Home,
    title: "Occupancy Management",
    desc: "Track which units are occupied, vacant, or reserved at a glance. Reduce gaps between tenancies.",
    color: "bg-sky-100 text-sky-700",
  },
  {
    icon: Bell,
    title: "Notifications & Alerts",
    desc: "Automated rent reminders, lease expiry alerts, and maintenance updates keep everyone informed.",
    color: "bg-orange-100 text-orange-700",
  },
  {
    icon: BarChart3,
    title: "Reports & Insights",
    desc: "Understand your rental income, occupancy rates, and outstanding payments with clear visual reports.",
    color: "bg-indigo-100 text-indigo-700",
  },
  {
    icon: ShieldCheck,
    title: "Role-Based Access",
    desc: "Give owners, managers, and maintenance teams exactly the access they need — nothing more.",
    color: "bg-rose-100 text-rose-700",
  },
  {
    icon: FileText,
    title: "Document Storage",
    desc: "Store lease agreements, ID copies, and inspection reports securely — accessible from anywhere.",
    color: "bg-teal-100 text-teal-700",
  },
];

export function FeaturesSection() {
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="bg-[#f9fafb] py-20 lg:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">

        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#239487] mb-3">
            Platform Features
          </p>
          <h2
            id="features-heading"
            className="text-3xl sm:text-4xl font-bold tracking-tight text-[hsl(var(--foreground))] mb-4"
          >
            Everything you need to run your rental business
          </h2>
          <p className="text-[hsl(var(--muted-foreground))] text-lg leading-relaxed">
            From tenant onboarding to rent collection to maintenance — Crib handles
            the operational work so you can focus on growing your portfolio.
          </p>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map(({ icon: Icon, title, desc, color }) => (
            <div
              key={title}
              className="group rounded-xl border border-[hsl(var(--border))] bg-white p-6 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
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
