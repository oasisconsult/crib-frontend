"use client";

import Link from "next/link";
import { ArrowRight, Settings, CreditCard, Globe, Plug, ToggleLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";

/**
 * Billing settings have moved to the Admin section of the sidebar.
 * This page now serves as a redirect hub for anyone who bookmarked the old URL.
 */
export default function BillingSettingsRedirectPage() {
  const { isSuperAdmin } = usePermissions();

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-center gap-3">
        <p className="text-muted-foreground text-sm">
          Access restricted to platform administrators.
        </p>
        <Button asChild variant="outline">
          <Link href="/subscription">Back to Subscription</Link>
        </Button>
      </div>
    );
  }

  const SECTIONS = [
    {
      href: "/admin/billing",
      icon: CreditCard,
      label: "Billing & Plans",
      desc: "Plans, pricing, feature flags, payment methods (bank, mobile money, cash).",
    },
    {
      href: "/admin/platform",
      icon: Globe,
      label: "Platform & Agency",
      desc: "Agency details, platform defaults, and lease payment rules.",
    },
    {
      href: "/admin/integrations",
      icon: Plug,
      label: "Integrations",
      desc: "Email, SMS, and file storage providers.",
    },
    {
      href: "/admin/features",
      icon: ToggleLeft,
      label: "Feature Flags",
      desc: "Enable or disable platform features for all organisations.",
    },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Admin Settings"
        description="Settings have moved to the sidebar under Settings → (sub-items)."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/subscription">Back to Subscription</Link>
          </Button>
        }
      />

      <div className="rounded-[8px] border border-[hsl(var(--primary))]/20 bg-[hsl(var(--accent))] px-4 py-3 text-sm text-[hsl(var(--primary))] flex items-center gap-2">
        <Settings className="h-4 w-4 shrink-0" />
        <span>
          All settings are now accessible from the <strong>Settings</strong> menu in the left sidebar.
          Quick links below:
        </span>
      </div>

      <div className="space-y-3">
        {SECTIONS.map(({ href, icon: Icon, label, desc }) => (
          <Card key={href} className="hover:shadow-sm transition-shadow">
            <CardContent className="pt-4 pb-4">
              <Link href={href} className="flex items-center gap-4 group">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
