import type { Metadata } from "next";
import { MarketingNav }        from "@/components/marketing/MarketingNav";
import { HeroSection }         from "@/components/marketing/HeroSection";
import { StatsSection }        from "@/components/marketing/StatsSection";
import { FeaturesSection }     from "@/components/marketing/FeaturesSection";
import { WhyCribSection }      from "@/components/marketing/WhyCribSection";
import { HowItWorksSection }   from "@/components/marketing/HowItWorksSection";
import { PricingSection }      from "@/components/marketing/PricingSection";
import { TestimonialsSection } from "@/components/marketing/TestimonialsSection";
import { AboutSection }        from "@/components/marketing/AboutSection";
import { BookingSection }      from "@/components/marketing/BookingSection";
import { MarketingFooter }     from "@/components/marketing/MarketingFooter";

// ── SEO metadata ──────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "Crib — Modern Property Management for Landlords in Africa",
  description:
    "Crib helps landlords and property managers track rent, manage tenants, handle maintenance, and run their rental portfolio from one organised platform. Built for Uganda and Africa.",
  keywords: [
    "property management Uganda",
    "landlord software Africa",
    "rent collection app",
    "tenant management Uganda",
    "property management software",
    "Crib property",
  ],
  authors: [{ name: "Crib" }],
  openGraph: {
    type: "website",
    url: "https://crib.geoboxafrica.com",
    title: "Crib — Modern Property Management for Landlords in Africa",
    description:
      "Track rent, manage tenants, handle maintenance, and run your entire rental portfolio from one organised platform.",
    siteName: "Crib",
    images: [
      {
        url: "/crib_logo_green.png",
        width: 512,
        height: 512,
        alt: "Crib logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Crib — Modern Property Management for Landlords in Africa",
    description:
      "Track rent, manage tenants, and run your rental portfolio from one organised platform.",
  },
  robots: { index: true, follow: true },
  alternates: { canonical: "https://crib.geoboxafrica.com" },
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <>
      {/* Skip to content — WCAG 2.4.1 */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-lg focus:bg-[#239487] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg"
      >
        Skip to main content
      </a>

      <MarketingNav />

      <main id="main-content">
        <HeroSection />
        <StatsSection />
        <FeaturesSection />
        <WhyCribSection />
        <HowItWorksSection />
        <PricingSection />
        <TestimonialsSection />
        <AboutSection />
        <BookingSection />
      </main>

      <MarketingFooter />
    </>
  );
}
