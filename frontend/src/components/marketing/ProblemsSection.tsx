import { HelpCircle, MapPin, Phone, Wrench, FolderX, Eye } from "lucide-react";

const PROBLEMS = [
  {
    icon: HelpCircle,
    title: "Who has paid rent this month?",
    desc: "You have 10 tenants, 3 have sent money, 2 promised 'tomorrow', and you've lost track of the rest.",
    accent: "text-red-600 bg-red-50 border-red-100",
  },
  {
    icon: MapPin,
    title: "Which units are empty right now?",
    desc: "You know roughly which properties are occupied, but you can't quickly tell a prospect which units are actually available.",
    accent: "text-amber-600 bg-amber-50 border-amber-100",
  },
  {
    icon: Phone,
    title: "Chasing tenants every single month",
    desc: "Rent is due on the 1st. By the 5th you're calling. By the 10th you're frustrated. Every. Single. Month.",
    accent: "text-orange-600 bg-orange-50 border-orange-100",
  },
  {
    icon: Wrench,
    title: "Maintenance jobs going nowhere",
    desc: "A tenant reports a leaking roof. You call someone. Three weeks later you're not sure if it was fixed or forgotten.",
    accent: "text-red-600 bg-red-50 border-red-100",
  },
  {
    icon: FolderX,
    title: "Records scattered everywhere",
    desc: "Lease agreements in a folder. Receipts on WhatsApp. Tenant IDs in a drawer. Nothing in one place.",
    accent: "text-amber-600 bg-amber-50 border-amber-100",
  },
  {
    icon: Eye,
    title: "No visibility when you're away",
    desc: "Whether you're in another city or abroad, you depend on your caretaker's word for what's happening at your property.",
    accent: "text-orange-600 bg-orange-50 border-orange-100",
  },
];

export function ProblemsSection() {
  return (
    <section
      id="problems"
      aria-labelledby="problems-heading"
      className="bg-[#fafafa] py-20 lg:py-28 border-t border-[hsl(var(--border))]"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Header */}
        <div className="max-w-2xl mx-auto text-center mb-14">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#16665d] mb-3">
            Sound familiar?
          </p>
          <h2
            id="problems-heading"
            className="text-3xl sm:text-4xl font-bold tracking-tight text-[hsl(var(--foreground))] mb-4"
          >
            Managing rental properties is harder than it should be.
          </h2>
          <p className="text-[hsl(var(--muted-foreground))] text-lg leading-relaxed">
            Most landlords and property managers in Uganda are running their
            portfolios on notebooks, spreadsheets, and WhatsApp groups. The
            result is confusion, missed payments, and constant stress.
          </p>
        </div>

        {/* Problem grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {PROBLEMS.map(({ icon: Icon, title, desc, accent }) => (
            <div
              key={title}
              className="rounded-xl border border-[hsl(var(--border))] bg-white p-6"
            >
              <div
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${accent} mb-4`}
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-2">
                {title}
              </h3>
              <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
                {desc}
              </p>
            </div>
          ))}
        </div>

        {/* Bridge to solution */}
        <div className="mt-10 rounded-xl border border-[#239487]/25 bg-[#f3fcfa] px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-[hsl(var(--foreground))]">
              Crib solves every one of these.
            </p>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
              One organised platform for your entire rental portfolio.
            </p>
          </div>
          <a
            href="#features"
            className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold text-[#239487] hover:text-[#16665d] transition-colors"
            aria-label="See Crib features"
          >
            See How it works
            <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>
    </section>
  );
}
