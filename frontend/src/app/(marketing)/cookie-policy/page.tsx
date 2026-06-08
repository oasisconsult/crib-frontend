import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { LegalContent } from "@/components/marketing/LegalContent";

export const metadata: Metadata = {
  title: "Cookie Policy — Crib",
  description: "How Crib uses cookies and similar technologies on our marketing site and platform.",
};

export default function CookiePolicyPage() {
  return (
    <MarketingPageShell eyebrow="Legal" title="Cookie Policy">
      <LegalContent lastUpdated="8 June 2026">
        <p>
          This Cookie Policy explains how Crib uses cookies and similar technologies on our
          marketing site and platform, and the choices available to you.
        </p>

        <h2>1. What cookies are</h2>
        <p>
          Cookies are small text files placed on your device when you visit a website. They
          help the site function correctly, remember your preferences, and let us understand
          how the site is used.
        </p>

        <h2>2. How we use cookies</h2>
        <ul>
          <li>
            <strong>Essential cookies</strong> — required for core functionality such as
            signing in, keeping you authenticated, and maintaining session security. The
            Service will not function correctly without these.
          </li>
          <li>
            <strong>Preference cookies</strong> — remember settings such as your selected
            theme or language so you don&rsquo;t have to set them again on every visit.
          </li>
          <li>
            <strong>Analytics cookies</strong> — help us understand how visitors use our
            marketing site (e.g. which pages are popular) so we can improve it. Where used,
            data is aggregated and not used to identify you personally.
          </li>
        </ul>
        <p>We do not use cookies for third-party advertising or to sell your data.</p>

        <h2>3. Managing cookies</h2>
        <p>
          Most browsers let you view, manage, and delete cookies through their settings. You
          can usually choose to block cookies entirely or be notified before one is set —
          note that disabling essential cookies will prevent parts of the Service (such as
          signing in) from working correctly.
        </p>

        <h2>4. Changes to this policy</h2>
        <p>
          We may update this Cookie Policy from time to time to reflect changes to the
          technologies we use or for legal reasons. We will post the updated version here and
          update the &ldquo;Last updated&rdquo; date above.
        </p>

        <h2>5. Contact us</h2>
        <p>
          Questions about how we use cookies? Reach us through the &ldquo;Email us&rdquo; or
          &ldquo;WhatsApp Us&rdquo; links in the site footer.
        </p>
      </LegalContent>
    </MarketingPageShell>
  );
}
