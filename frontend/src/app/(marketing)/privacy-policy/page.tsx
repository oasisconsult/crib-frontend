import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { LegalContent } from "@/components/marketing/LegalContent";

export const metadata: Metadata = {
  title: "Privacy Policy — Crib",
  description: "How Crib collects, uses, and protects your personal data.",
};

export default function PrivacyPolicyPage() {
  return (
    <MarketingPageShell eyebrow="Legal" title="Privacy Policy">
      <LegalContent lastUpdated="8 June 2026">
        <p>
          Crib is a property-management platform operated by{" "}
          <strong>GeoBox Digital Services (U) Ltd</strong> (&ldquo;Crib&rdquo;,
          &ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;), a company based in
          Kampala, Uganda. This Privacy Policy explains how we collect, use, share, and
          protect information when you use our property-management platform, marketing site,
          and related services (together, the &ldquo;Service&rdquo;), in line with
          Uganda&rsquo;s Data Protection and Privacy Act, 2019 — see our{" "}
          <a href="/data-protection">Data Protection</a> page for more on your rights.
        </p>

        <h2>1. Information we collect</h2>
        <ul>
          <li>
            <strong>Account &amp; profile data</strong> — name, email address, phone number,
            role (e.g. landlord, agency, tenant, caretaker), and organisation details you
            provide when you sign up or are invited to a workspace.
          </li>
          <li>
            <strong>Property &amp; tenancy data</strong> — information you or your
            organisation enter about properties, units, leases, tenants, payments, and
            maintenance requests in order to use the Service.
          </li>
          <li>
            <strong>Communications</strong> — messages sent through the Service, support
            requests, and demo-booking enquiries, including any contact details you supply.
          </li>
          <li>
            <strong>Usage &amp; device data</strong> — log data, device and browser
            information, and analytics about how you interact with the Service, collected
            automatically to keep it secure and improve it.
          </li>
        </ul>

        <h2>2. How we use information</h2>
        <ul>
          <li>To provide, operate, and maintain the Service you and your organisation rely on.</li>
          <li>To process rent payments, generate statements, and send lease- and tenancy-related notifications.</li>
          <li>To respond to support requests, demo bookings, and other communications you initiate.</li>
          <li>To detect, investigate, and prevent fraud, abuse, and security incidents.</li>
          <li>To improve and develop new features, informed by aggregate, de-identified usage trends.</li>
        </ul>

        <h2>3. How we share information</h2>
        <p>We do not sell your personal data. We share information only:</p>
        <ul>
          <li>Within your organisation, according to the roles and permissions configured by your administrators.</li>
          <li>With service providers who help us operate the Service (e.g. hosting, email, SMS, and payment processing), under contractual confidentiality obligations.</li>
          <li>When required by law, regulation, legal process, or governmental request.</li>
          <li>To protect the rights, property, or safety of Crib, our users, or the public.</li>
        </ul>

        <h2>4. Data retention</h2>
        <p>
          We retain personal data for as long as your account or organisation remains active,
          and for a reasonable period afterwards to meet legal, accounting, or reporting
          obligations (such as tenancy and payment records). You may request deletion of your
          data subject to these obligations — see &ldquo;Your rights&rdquo; below.
        </p>

        <h2>5. Security</h2>
        <p>
          We use industry-standard safeguards — including encryption in transit and at rest,
          role-based access controls, and audit logging — to protect information from
          unauthorised access, alteration, disclosure, or destruction. No system is perfectly
          secure, and we continuously work to strengthen these protections.
        </p>

        <h2>6. Your rights</h2>
        <p>
          Depending on your location, you may have the right to access, correct, export, or
          delete your personal data, or to object to or restrict certain processing. To
          exercise any of these rights, contact us using the details on our{" "}
          <a href="/about">About</a> page or via the contact options in the site footer.
        </p>

        <h2>7. Changes to this policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will post the updated
          version on this page and update the &ldquo;Last updated&rdquo; date above. Material
          changes will be communicated through the Service or by email where appropriate.
        </p>

        <h2>8. Contact us</h2>
        <p>
          Questions about this policy or how we handle your data? Reach us through the
          &ldquo;Email us&rdquo; or &ldquo;WhatsApp Us&rdquo; links in the site footer.
        </p>
      </LegalContent>
    </MarketingPageShell>
  );
}
