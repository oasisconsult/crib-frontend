import { Home, Globe, Shield, Zap } from "lucide-react";

const VALUES = [
  {
    icon: Home,
    title: "Built for Africa",
    desc: "Designed around how landlords and tenants actually operate in Uganda and across African cities — not copied from Western markets.",
    color: "bg-[#f3fcfa] text-[#239487]",
  },
  {
    icon: Globe,
    title: "Mobile first",
    desc: "Your portfolio, your tenants, your cashflow — accessible from any device, at any time, from anywhere.",
    color: "bg-sky-50 text-sky-600",
  },
  {
    icon: Shield,
    title: "Secure and reliable",
    desc: "Role-based access, encrypted records, and an audit trail that keeps your data safe and your team accountable.",
    color: "bg-violet-50 text-violet-600",
  },
  {
    icon: Zap,
    title: "Operationally focused",
    desc: "Not a listings site, not a CRM. Crib is a day-to-day operational tool built to reduce admin and increase visibility.",
    color: "bg-amber-50 text-amber-600",
  },
];

export function AboutSection() {
  return (
    <section
      id="about"
      aria-labelledby="about-heading"
      className="bg-white py-20 lg:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">

          {/* Left: story */}
          <div className="space-y-6">
            <p className="text-sm font-semibold uppercase tracking-widest text-[#239487]">
              About Crib
            </p>
            <h2
              id="about-heading"
              className="text-3xl sm:text-4xl font-bold tracking-tight text-[hsl(var(--foreground))] leading-snug"
            >
              Modernising rental operations in Africa — one property at a time.
            </h2>
            <div className="space-y-4 text-[hsl(var(--muted-foreground))] leading-relaxed">
              <p>
                Crib was built out of a simple observation: most landlords and property
                managers in Uganda are running sophisticated rental businesses on
                spreadsheets, notebooks, and WhatsApp groups. The tools exist — they just
                were not built for this market.
              </p>
              <p>
                We set out to build a property operations platform that is modern, practical,
                and genuinely useful for the way rental businesses work in Africa. Not a
                luxury listings site. Not a generic CRM. A focused operational tool that
                makes it easier to manage properties, tenants, and rent — every single day.
              </p>
              <p>
                From a single apartment to a portfolio of 100 units, Crib scales with your
                business and stays out of your way.
              </p>
            </div>
          </div>

          {/* Right: values */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {VALUES.map(({ icon: Icon, title, desc, color }) => (
              <div
                key={title}
                className="rounded-xl border border-[hsl(var(--border))] p-5 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${color} mb-3`}>
                  <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                </div>
                <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-1.5">{title}</h3>
                <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
