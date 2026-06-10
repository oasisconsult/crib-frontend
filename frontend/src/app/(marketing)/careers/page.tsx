import type { Metadata } from "next";
import { Briefcase } from "lucide-react";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { ComingSoon } from "@/components/marketing/ComingSoon";

export const metadata: Metadata = {
  title: "Careers — Crib",
  description: "Open roles at Crib — coming soon.",
};

export default function CareersPage() {
  return (
    <MarketingPageShell eyebrow="Company" title="Careers">
      <ComingSoon
        icon={Briefcase}
        title="Open roles"
        description="We're not listing open positions just yet, but we're growing. Check back soon, or reach out via the contact links in the footer if you'd like to introduce yourself."
      />
    </MarketingPageShell>
  );
}
