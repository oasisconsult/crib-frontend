import { X, Check } from "lucide-react";

const PAINS = [
  { pain: "Tracking rent in spreadsheets that break",      fix: "One dashboard for all rent, all properties" },
  { pain: "Chasing tenants manually every month",          fix: "Automated reminders handle the follow-up" },
  { pain: "Scattered tenant records across WhatsApp & paper", fix: "Centralised tenant profiles and lease history" },
  { pain: "Maintenance jobs falling through the cracks",   fix: "Logged, assigned, and tracked to resolution" },
  { pain: "No visibility into occupancy or cashflow",      fix: "Live insights on who's paid, who hasn't" },
  { pain: "Staff sharing admin access with no control",    fix: "Role-based permissions for every team member" },
];

export function WhyCribSection() {
  return (
    <section
      id="why-crib"
      aria-labelledby="why-crib-heading"
      className="bg-white py-20 lg:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">

        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#239487] mb-3">
            Why Crib
          </p>
          <h2
            id="why-crib-heading"
            className="text-3xl sm:text-4xl font-bold tracking-tight text-[hsl(var(--foreground))] mb-4"
          >
            Stop managing chaos.<br />Start managing properties.
          </h2>
          <p className="text-[hsl(var(--muted-foreground))] text-lg leading-relaxed">
            Most landlords and property managers in Africa are still running their portfolios
            on spreadsheets, WhatsApp groups, and paper receipts. Crib changes that.
          </p>
        </div>

        {/* Comparison table */}
        <div className="rounded-2xl border border-[hsl(var(--border))] overflow-hidden shadow-sm">
          {/* Column headers */}
          <div className="grid grid-cols-2 border-b border-[hsl(var(--border))]">
            <div className="bg-red-50 px-6 py-4 flex items-center gap-2">
              <X className="h-4 w-4 text-red-500 shrink-0" aria-hidden />
              <span className="text-sm font-semibold text-red-700">Without Crib</span>
            </div>
            <div className="bg-[#f3fcfa] px-6 py-4 flex items-center gap-2 border-l border-[hsl(var(--border))]">
              <Check className="h-4 w-4 text-[#239487] shrink-0" aria-hidden />
              <span className="text-sm font-semibold text-[#16665d]">With Crib</span>
            </div>
          </div>

          {PAINS.map(({ pain, fix }, i) => (
            <div
              key={i}
              className="grid grid-cols-2 border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--accent))]/30 transition-colors"
            >
              <div className="px-6 py-4 flex items-start gap-3 border-r border-[hsl(var(--border))]">
                <X className="h-4 w-4 text-red-400 shrink-0 mt-0.5" aria-hidden />
                <p className="text-sm text-[hsl(var(--muted-foreground))]">{pain}</p>
              </div>
              <div className="px-6 py-4 flex items-start gap-3">
                <Check className="h-4 w-4 text-[#239487] shrink-0 mt-0.5" aria-hidden />
                <p className="text-sm text-[hsl(var(--foreground))] font-medium">{fix}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
