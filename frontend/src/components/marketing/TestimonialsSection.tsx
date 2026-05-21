import { Star } from "lucide-react";

const TESTIMONIALS = [
  {
    quote: "Before Crib, I was tracking rent payments in a notebook. Now I can see everything from my phone — who's paid, who's overdue, and which units need attention.",
    name: "Robert Mukasa",
    role: "Landlord",
    location: "Kampala, Uganda",
    properties: "8 units",
    initials: "RM",
    color: "bg-[#239487]",
  },
  {
    quote: "Managing 40 units across 3 properties used to feel impossible. Crib gives my team a shared system that actually works. Maintenance requests no longer get lost.",
    name: "Sarah Nalwanga",
    role: "Property Manager",
    location: "Wakiso, Uganda",
    properties: "40 units",
    initials: "SN",
    color: "bg-violet-500",
  },
  {
    quote: "I used to spend every month-end chasing tenants. With Crib's automated reminders, most payments come in without me lifting a finger. It's changed how I operate.",
    name: "James Otieno",
    role: "Apartment Owner",
    location: "Entebbe, Uganda",
    properties: "12 units",
    initials: "JO",
    color: "bg-indigo-500",
  },
];

function StarRow() {
  return (
    <div className="flex gap-0.5" aria-label="5 stars">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
      ))}
    </div>
  );
}

export function TestimonialsSection() {
  return (
    <section
      id="testimonials"
      aria-labelledby="testimonials-heading"
      className="bg-[#f9fafb] py-20 lg:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">

        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#239487] mb-3">
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
              className="flex flex-col gap-5 rounded-xl border border-[hsl(var(--border))] bg-white p-6 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <StarRow />
              <blockquote>
                <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
                  &ldquo;{quote}&rdquo;
                </p>
              </blockquote>
              <figcaption className="flex items-center gap-3 mt-auto pt-4 border-t border-[hsl(var(--border))]">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${color} text-sm font-bold text-white shrink-0`}>
                  {initials}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[hsl(var(--foreground))]">{name}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    {role} · {location}
                  </p>
                  <p className="text-xs text-[#239487] font-medium">{properties}</p>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
