import { Building2, TrendingUp, Star, Users } from "lucide-react";

const STATS = [
  { icon: Building2,   value: "1,200+", label: "Units managed",        desc: "Across Uganda" },
  { icon: Users,       value: "300+",   label: "Landlords onboarded",  desc: "And growing" },
  { icon: TrendingUp,  value: "98%",    label: "On-time collection",   desc: "With automated reminders" },
  { icon: Star,        value: "4.9★",   label: "Landlord satisfaction",desc: "Based on user feedback" },
];

export function StatsSection() {
  return (
    <section aria-label="Platform statistics" className="bg-[#f3fcfa] border-y border-[#239487]/15 py-14">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {STATS.map(({ icon: Icon, value, label, desc }) => (
            <div key={label} className="text-center space-y-1">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#239487]/10 mb-3">
                <Icon className="h-5 w-5 text-[#239487]" aria-hidden="true" />
              </div>
              <p className="text-3xl font-bold text-[#0B3B36] tracking-tight">{value}</p>
              <p className="text-sm font-semibold text-[#16665d]">{label}</p>
              <p className="text-xs text-[#239487]/70">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
