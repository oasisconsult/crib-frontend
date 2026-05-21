import { Star } from "lucide-react";

const TESTIMONIALS = [
  {
    quote:
      "Before Crib, I was tracking rent in a notebook and calling everyone every month-end. Now I can see exactly who's paid, who's overdue, and which units need attention — from my phone.",
    name:       "Robert Mukasa",
    role:       "Landlord",
    location:   "Kampala, Uganda",
    properties: "8 units",
    initials:   "RM",
    color:      "bg-[#239487]",
  },
  {
    quote:
      "Managing 40 units across 3 properties used to feel impossible. Crib gives my team one shared system that actually works. Maintenance requests no longer get lost.",
    name:       "Sarah Nalwanga",
    role:       "Property Manager",
    location:   "Wakiso, Uganda",
    properties: "40 units",
    initials:   "SN",
    color:      "bg-[#16665d]",
  },
  {
    quote:
      "I'm based in the UK and own three properties in Kampala. Crib lets me see everything in real time — rent status, occupancy, maintenance — without having to call anyone.",
    name:       "James Ochieng",
    role:       "Diaspora Landlord",
    location:   "London, UK · Properties in Kampala",
    properties: "12 units",
    initials:   "JO",
    color:      "bg-indigo-600",
  },
];

function StarRow() {
  return (
    <div className="flex gap-0.5" aria-label="5 out of 5 stars">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
      ))}
    </div>
  );
}

export function TestimonialsSection() {
  return (
    <section
      id="testimonials"
      aria-labelledby="testimonials-heading"
      className="bg-white py-20 lg:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">

        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#16665d] mb-3">
            What Landlords Say
          </p>
          <h2
            id="testimonials-heading"
            className="text-3xl sm:text-4xl font-bold tracking-tight text-[hsl(var(--foreground))]"
          >
            Trusted by landlords across Uganda
          </h2>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map(({ quote, name, role, location, properties, initials, color }) => (
            <figure
              key={name}
              className="flex flex-col gap-5 rounded-xl border border-[hsl(var(--border))] bg-[#fafafa] p-6 hover:bg-white hover:shadow-sm transition-all duration-200"
            >
              <StarRow />
              <blockquote className="flex-1">
                <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
                  &ldquo;{quote}&rdquo;
                </p>
              </blockquote>
              <figcaption className="flex items-center gap-3 pt-4 border-t border-[hsl(var(--border))]">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${color} text-sm font-bold text-white shrink-0`}
                  aria-hidden="true"
                >
                  {initials}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[hsl(var(--foreground))]">{name}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    {role} · {location}
                  </p>
                  <p className="text-xs text-[#239487] font-medium mt-0.5">{properties}</p>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>

        {/* City spread note */}
        <p className="text-sm text-center text-[hsl(var(--muted-foreground))] mt-10">
          Landlords using Crib across{" "}
          <span className="font-medium text-[hsl(var(--foreground))]">
            Kampala, Wakiso, Entebbe, Jinja, Mbarara, Gulu, Mukono
          </span>{" "}
          and beyond.
        </p>

      </div>
    </section>
  );
}
