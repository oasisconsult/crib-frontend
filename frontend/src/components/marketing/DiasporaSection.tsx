import { ArrowRight, TrendingUp, Bell, Users, MessageCircle } from "lucide-react";

const BENEFITS = [
  {
    icon: TrendingUp,
    title: "Track rent without calling your caretaker",
    desc: "See who has paid, who is overdue, and your total monthly income — in real time, from wherever you are in the world.",
  },
  {
    icon: Bell,
    title: "Get notified when things happen",
    desc: "Receive alerts when rent is collected, when a maintenance issue is raised, or when a unit becomes vacant — without waiting for a phone call.",
  },
  {
    icon: Users,
    title: "Give your manager limited access",
    desc: "Assign a caretaker or property manager in Uganda with exactly the access they need. You keep full visibility and control.",
  },
];

export function DiasporaSection() {
  return (
    <section
      id="diaspora"
      aria-labelledby="diaspora-heading"
      className="relative overflow-hidden py-20 lg:py-28"
      style={{
        background: "linear-gradient(135deg, #0B3B36 0%, #16665D 55%, #239487 100%)",
      }}
    >
      {/* Subtle decorative circles */}
      <div aria-hidden="true" className="absolute -top-28 -right-28 h-80 w-80 rounded-full bg-white/[0.04]" />
      <div aria-hidden="true" className="absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-white/[0.04]" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">

          {/* Left — copy ──────────────────────────────────────────────── */}
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-[#4ecdc4] mb-4">
              For Diaspora Landlords
            </p>
            <h2
              id="diaspora-heading"
              className="text-3xl sm:text-4xl font-bold tracking-tight text-white leading-snug mb-5"
            >
              Managing your properties from abroad?
            </h2>
            <p className="text-white/70 text-lg leading-relaxed mb-8">
              Whether you're in London, Nairobi, Toronto, or Dubai — Crib gives you
              a clear view of your rental portfolio back home, without the daily
              phone calls.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href="#booking"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-[#0B3B36] hover:bg-white/90 transition-colors"
              >
                Book a Demo
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
              <a
                href="https://wa.me/256700000000"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/25 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                Chat on WhatsApp
              </a>
            </div>
          </div>

          {/* Right — benefits ─────────────────────────────────────────── */}
          <div className="space-y-6">
            {BENEFITS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 border border-white/15">
                  <Icon className="h-5 w-5 text-[#4ecdc4]" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white mb-1.5">{title}</h3>
                  <p className="text-sm text-white/65 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}
