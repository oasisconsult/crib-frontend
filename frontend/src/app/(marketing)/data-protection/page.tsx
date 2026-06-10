import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { LegalContent } from "@/components/marketing/LegalContent";

export const metadata: Metadata = {
  title: "Data Protection — Crib",
  description: "How Crib complies with Uganda's Data Protection and Privacy Act, 2019, and protects your personal data.",
};

export default function DataProtectionPage() {
  return (
    <MarketingPageShell eyebrow="Legal" title="Data Protection">
      <LegalContent lastUpdated="8 June 2026">
        <p>
          Crib is operated by GeoBox Digital Services (U) Ltd, a company based in Kampala,
          Uganda. We collect and process personal data in line with Uganda&rsquo;s{" "}
          <strong>Data Protection and Privacy Act, 2019</strong> (the &ldquo;Act&rdquo;) and
          its regulations, which are administered by the{" "}
          <strong>Personal Data Protection Office (PDPO)</strong> under the National
          Information Technology Authority &mdash; Uganda (NITA-U). This page explains how
          those protections apply to your use of Crib.
        </p>

        <h2>1. Our role</h2>
        <p>
          For data your organisation enters into Crib about its properties, tenants, and
          staff (&ldquo;Customer Data&rdquo;), your organisation acts as the{" "}
          <strong>data controller</strong> and Crib (operated by GeoBox Digital Services (U)
          Ltd) acts as the <strong>data processor</strong>, handling that data only on your
          organisation&rsquo;s instructions and as described in our{" "}
          <a href="/privacy-policy">Privacy Policy</a>. For account and billing data relating
          directly to your use of our Service, Crib acts as the data controller and, where
          required, the registered data collector under the Act.
        </p>

        <h2>2. Lawful collection and use</h2>
        <p>
          In line with the Act&rsquo;s principles, we collect personal data for specified,
          clearly stated purposes, only to the extent necessary to provide and improve the
          Service, and we do not process it in a way that is incompatible with those purposes.
          We process personal data on the basis of: performing our contract with you (running
          the Service you&rsquo;ve signed up for), our legitimate business interests (such as
          keeping the Service secure), compliance with legal obligations (such as financial
          record-keeping), and, where applicable, your consent.
        </p>

        <h2>3. Your rights</h2>
        <p>Under the Act, you have the right to:</p>
        <ul>
          <li><strong>Access</strong> the personal data we hold about you;</li>
          <li><strong>Correct or update</strong> personal data that is inaccurate, out of date, incomplete, or misleading;</li>
          <li><strong>Object to</strong> the collection or processing of your personal data on reasonable grounds;</li>
          <li><strong>Request deletion</strong> of personal data that we are no longer authorised to retain, subject to legal record-keeping requirements; and</li>
          <li><strong>Be informed</strong> of the purpose for which your personal data is being collected, and whether it will be shared with third parties.</li>
        </ul>
        <p>
          To exercise any of these rights, contact us through the &ldquo;Email us&rdquo; or
          &ldquo;WhatsApp Us&rdquo; links in the site footer. If your organisation entered the
          data on your behalf (for example, your landlord or property manager), we may direct
          your request to them as the data controller.
        </p>

        <h2>4. Cross-border data transfers</h2>
        <p>
          Where personal data is transferred or stored outside Uganda (for example, with our
          hosting or service providers), we take steps consistent with the Act&rsquo;s
          requirements to ensure the data remains subject to a comparable standard of
          protection, including appropriate contractual safeguards with our processors.
        </p>

        <h2>5. Data protection by design</h2>
        <p>
          We apply role-based access controls, encryption, and audit logging across the
          Service, and we collect only the personal data that is necessary to provide and
          improve it — see our <a href="/privacy-policy">Privacy Policy</a> for details on
          what we collect, how long we keep it, and how we secure it.
        </p>

        <h2>6. International users</h2>
        <p>
          Crib is built primarily for the Ugandan and wider African market, but some of our
          users — or the people whose data they manage — may be connected to other
          jurisdictions, including the European Union or European Economic Area. Where that is
          the case, we aim to handle personal data in a manner consistent with internationally
          recognised standards, including the principles of the EU General Data Protection
          Regulation (&ldquo;GDPR&rdquo;), in addition to our obligations under Ugandan law.
        </p>

        <h2>7. Contact us</h2>
        <p>
          Questions about how we handle your personal data, or wish to exercise your rights
          under the Act? Reach us through the &ldquo;Email us&rdquo; or &ldquo;WhatsApp
          Us&rdquo; links in the site footer. You may also have the right to lodge a complaint
          with the Personal Data Protection Office (PDPO) in Uganda.
        </p>
      </LegalContent>
    </MarketingPageShell>
  );
}
