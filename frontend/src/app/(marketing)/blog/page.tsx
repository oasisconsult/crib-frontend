import type { Metadata } from "next";
import { Newspaper } from "lucide-react";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { ComingSoon } from "@/components/marketing/ComingSoon";

export const metadata: Metadata = {
  title: "Blog — Crib",
  description: "Stories, guides, and updates from the Crib team — coming soon.",
};

export default function BlogPage() {
  return (
    <MarketingPageShell eyebrow="Company" title="Blog">
      <ComingSoon
        icon={Newspaper}
        title="Our blog"
        description="We're putting together stories, guides, and product updates for landlords and property managers across Africa. Check back soon."
      />
    </MarketingPageShell>
  );
}
