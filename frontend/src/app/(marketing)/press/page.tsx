import type { Metadata } from "next";
import { Megaphone } from "lucide-react";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { ComingSoon } from "@/components/marketing/ComingSoon";

export const metadata: Metadata = {
  title: "Press — Crib",
  description: "Press resources and media coverage for Crib — coming soon.",
};

export default function PressPage() {
  return (
    <MarketingPageShell eyebrow="Company" title="Press">
      <ComingSoon
        icon={Megaphone}
        title="Press resources"
        description="Media coverage, brand assets, and press contacts will be collected here. In the meantime, journalists and partners can reach our team via the contact links in the footer."
      />
    </MarketingPageShell>
  );
}
