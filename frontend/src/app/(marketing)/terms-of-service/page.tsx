import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { LegalContent } from "@/components/marketing/LegalContent";

export const metadata: Metadata = {
  title: "Terms of Service — Crib",
  description: "The terms that govern your use of the Crib platform and services.",
};

export default function TermsOfServicePage() {
  return (
    <MarketingPageShell eyebrow="Legal" title="Terms of Service">
      <LegalContent lastUpdated="8 June 2026">
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of
          Crib&rsquo;s property-management platform, marketing site, and related services
          (together, the &ldquo;Service&rdquo;). By creating an account, accepting an
          invitation, or otherwise using the Service, you agree to these Terms on behalf of
          yourself and, where applicable, the organisation you represent.
        </p>

        <h2>1. Using the Service</h2>
        <ul>
          <li>You must provide accurate information when creating an account and keep it up to date.</li>
          <li>You are responsible for safeguarding your login credentials and for all activity under your account.</li>
          <li>You must use the Service in compliance with applicable law and not to infringe the rights of others.</li>
          <li>Organisation administrators are responsible for the roles and permissions they grant to members of their workspace.</li>
        </ul>

        <h2>2. Subscriptions &amp; payments</h2>
        <p>
          Certain features of the Service require a paid subscription. Fees, billing cycles,
          and any trial terms are presented at sign-up or in your organisation&rsquo;s billing
          settings. Unless stated otherwise, fees are non-refundable, and we may change pricing
          on reasonable notice for future billing periods.
        </p>

        <h2>3. Your content &amp; data</h2>
        <p>
          You and your organisation retain ownership of the property, tenant, lease, and
          payment data you enter into the Service (&ldquo;Customer Data&rdquo;). You grant us
          a limited licence to host, process, and display Customer Data solely to provide and
          improve the Service. You are responsible for ensuring you have the right to submit
          any personal data of tenants, landlords, or other third parties that you enter.
        </p>

        <h2>4. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Reverse-engineer, copy, or resell the Service without our written permission;</li>
          <li>Attempt to gain unauthorised access to the Service, other accounts, or our systems;</li>
          <li>Use the Service to send unlawful, abusive, or fraudulent communications; or</li>
          <li>Interfere with or disrupt the integrity or performance of the Service.</li>
        </ul>

        <h2>5. Service availability</h2>
        <p>
          We work to keep the Service available and reliable, but we do not guarantee
          uninterrupted or error-free operation. We may suspend access for maintenance,
          security, or legal reasons, and will aim to give reasonable notice where practical.
        </p>

        <h2>6. Termination</h2>
        <p>
          You may stop using the Service and close your account at any time. We may suspend or
          terminate access if you breach these Terms, misuse the Service, or where required by
          law. On termination, your right to use the Service ends, though certain provisions
          (such as data retention obligations and limitations of liability) continue to apply.
        </p>

        <h2>7. Disclaimers &amp; limitation of liability</h2>
        <p>
          The Service is provided &ldquo;as is&rdquo; without warranties of any kind, to the
          fullest extent permitted by law. To the maximum extent permitted by law, Crib will
          not be liable for indirect, incidental, or consequential damages arising from your
          use of the Service.
        </p>

        <h2>8. Changes to these Terms</h2>
        <p>
          We may update these Terms from time to time. We will post the updated version here
          and update the &ldquo;Last updated&rdquo; date above. Continuing to use the Service
          after changes take effect constitutes acceptance of the revised Terms.
        </p>

        <h2>9. Contact us</h2>
        <p>
          Questions about these Terms? Reach us through the &ldquo;Email us&rdquo; or
          &ldquo;WhatsApp Us&rdquo; links in the site footer.
        </p>
      </LegalContent>
    </MarketingPageShell>
  );
}
