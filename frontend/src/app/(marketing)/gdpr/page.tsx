import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { LegalContent } from "@/components/marketing/LegalContent";

export const metadata: Metadata = {
  title: "GDPR — Crib",
  description: "How Crib supports GDPR rights for users and organisations operating in or serving the EU/EEA.",
};

export default function GdprPage() {
  return (
    <MarketingPageShell eyebrow="Legal" title="GDPR">
      <LegalContent lastUpdated="8 June 2026">
        <p>
          Crib is built primarily for landlords, agencies, and tenants in Africa, but we
          recognise that some of our users and the people whose data they manage may be
          located in, or have data protection rights under, the European Union or European
          Economic Area (&ldquo;EU/EEA&rdquo;). This page explains how the General Data
          Protection Regulation (&ldquo;GDPR&rdquo;) principles apply to your use of Crib.
        </p>

        <h2>1. Our role</h2>
        <p>
          For data your organisation enters into Crib about its properties, tenants, and
          staff (&ldquo;Customer Data&rdquo;), your organisation acts as the{" "}
          <strong>data controller</strong> and Crib acts as the <strong>data processor</strong>,
          processing that data only on your organisation&rsquo;s instructions and as described
          in our <a href="/privacy-policy">Privacy Policy</a>. For account and billing data
          relating directly to your use of our Service, Crib acts as the data controller.
        </p>

        <h2>2. Lawful basis for processing</h2>
        <p>
          We process personal data on the basis of: performing our contract with you (running
          the Service you&rsquo;ve signed up for), our legitimate interests (such as keeping
          the Service secure and improving it), compliance with legal obligations (such as
          financial record-keeping), and, where applicable, your consent (such as marketing
          communications you&rsquo;ve opted into).
        </p>

        <h2>3. Your rights under GDPR</h2>
        <p>If GDPR applies to you, you have the right to:</p>
        <ul>
          <li><strong>Access</strong> the personal data we hold about you;</li>
          <li><strong>Rectify</strong> inaccurate or incomplete data;</li>
          <li><strong>Erase</strong> your data (&ldquo;right to be forgotten&rdquo;), subject to legal retention requirements;</li>
          <li><strong>Restrict or object to</strong> certain processing of your data;</li>
          <li><strong>Port</strong> your data to another service in a structured, machine-readable format; and</li>
          <li><strong>Withdraw consent</strong> at any time, where processing is based on consent.</li>
        </ul>
        <p>
          To exercise any of these rights, contact us through the &ldquo;Email us&rdquo; or
          &ldquo;WhatsApp Us&rdquo; links in the site footer. If your organisation entered the
          data on your behalf, we may direct your request to them as the data controller.
        </p>

        <h2>4. International data transfers</h2>
        <p>
          Where personal data is transferred outside the EU/EEA (for example, to our hosting
          or service providers), we take steps to ensure it remains protected to a standard
          consistent with GDPR, including the use of appropriate contractual safeguards with
          our processors.
        </p>

        <h2>5. Data protection by design</h2>
        <p>
          We apply role-based access controls, encryption, and audit logging across the
          Service, and we limit the personal data we collect to what is necessary to provide
          and improve it — see our <a href="/privacy-policy">Privacy Policy</a> for details.
        </p>

        <h2>6. Contact us</h2>
        <p>
          Questions about your rights under GDPR or how we process your data? Reach us through
          the &ldquo;Email us&rdquo; or &ldquo;WhatsApp Us&rdquo; links in the site footer.
        </p>
      </LegalContent>
    </MarketingPageShell>
  );
}
