<<<<<<< HEAD
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Twitter, Linkedin, Facebook, Instagram,
  Mail, Phone, MessageCircle, MapPin,
} from "lucide-react";
import { apiGet } from "@/services/api/client";
import type { ContactInfo } from "@/services/api/contactInfo";

const FOOTER_LINKS = {
  Product: [
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "#pricing" },
    { label: "How it works", href: "#how-it-works" },
    { label: "Book a Demo", href: "#booking" },
    { label: "Login", href: "/login" },
    { label: "Get Started", href: "#booking" },
  ],
  Company: [
    { label: "About", href: "/about" },
    { label: "Blog", href: "/blog" },
    { label: "Careers", href: "/careers" },
    { label: "Press", href: "/press" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "/privacy-policy" },
    { label: "Terms of Service", href: "/terms-of-service" },
    { label: "Cookie Policy", href: "/cookie-policy" },
    { label: "Data Protection", href: "/data-protection" },
  ],
};

const SOCIAL = [
  { icon: Twitter, label: "Twitter", href: "#" },
  { icon: Linkedin, label: "LinkedIn", href: "#" },
  { icon: Facebook, label: "Facebook", href: "#" },
  { icon: Instagram, label: "Instagram", href: "#" },
];

const EMPTY_CONTACT: ContactInfo = { supportEmail: "", supportPhone: "", supportWhatsapp: "" };

export function MarketingFooter() {
  const year = new Date().getFullYear();
  const [contact, setContact] = useState<ContactInfo>(EMPTY_CONTACT);

  // Superadmin-configurable contact details (platform.support_email/_phone/_whatsapp)
  // — the raw address/number is never rendered as visible text, only used as
  // click targets behind generic labels, to discourage scraping. A method is
  // hidden entirely if it isn't configured or the lookup fails.
  useEffect(() => {
    let cancelled = false;
    apiGet<ContactInfo>("/public/contact-info")
      .then((res) => { if (!cancelled && res) setContact(res); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const contactLinks = [
    contact.supportEmail && {
      icon: Mail,
      label: "Email us",
      href: `mailto:${contact.supportEmail}`,
    },
    contact.supportPhone && {
      icon: Phone,
      label: "Call us",
      href: `tel:${contact.supportPhone}`,
    },
    { icon: MapPin, label: "Kampala, Uganda", href: undefined },
    contact.supportWhatsapp && {
      icon: MessageCircle,
      label: "WhatsApp Us",
      href: `https://wa.me/${contact.supportWhatsapp}`,
    },
  ].filter(Boolean) as { icon: typeof Mail; label: string; href?: string }[];

  return (
    <footer
      role="contentinfo"
      className="bg-[#111827] border-t border-white/10"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-14 pb-8">
        {/* Top row */}
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5 pb-12 border-b border-white/10">
          {/* Brand */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-1 space-y-4">
            <Link href="/" aria-label="Crib home">
              <Image
                src="/crib-icon-green.png"
                alt="Crib"
                width={160}
                height={40}
                className="h-8 sm:h-9 w-auto"
              />
            </Link>
            <p className="text-sm text-white/50 leading-relaxed max-w-xs">
              Modern property management for landlords and property managers in
              Africa.
            </p>
            {/* Social */}
            <div className="flex items-center gap-3 pt-1">
              {SOCIAL.map(({ icon: Icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/50 hover:bg-white/20 hover:text-white transition-colors"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([group, links]) => (
            <div key={group}>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30 mb-4">
                {group}
              </p>
              <ul className="space-y-2.5" role="list">
                {links.map(({ label, href }) => (
                  <li key={label}>
                    <a
                      href={href}
                      className="text-sm text-white/50 hover:text-white transition-colors"
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Contact column */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30 mb-4">
              Contact
            </p>
            <ul className="space-y-2.5" role="list">
              {contactLinks.map(({ icon: Icon, label, href }) => (
                <li key={label}>
                  {href ? (
                    <a
                      href={href}
                      className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {label}
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-sm text-white/50">
                      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {label}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom row */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-white/30">
            &copy; {year} Crib, a product of GeoBox Digital Services (U) Ltd. All rights
            reserved. Built in Uganda 🇺🇬
          </p>
          <div className="flex items-center gap-4">
            <a
              href="/privacy-policy"
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              Privacy
            </a>
            <a
              href="/terms-of-service"
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              Terms
            </a>
            <a
              href="/cookie-policy"
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              Cookies
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
=======
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Twitter, Linkedin, Facebook, Instagram,
  Mail, Phone, MessageCircle, MapPin,
} from "lucide-react";
import { apiGet } from "@/services/api/client";
import type { ContactInfo } from "@/services/api/contactInfo";

const FOOTER_LINKS = {
  Product: [
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "#pricing" },
    { label: "How it works", href: "#how-it-works" },
    { label: "Book a Demo", href: "#booking" },
    { label: "Login", href: "/login" },
    { label: "Get Started", href: "#booking" },
  ],
  Company: [
    { label: "About", href: "/about" },
    { label: "Blog", href: "/blog" },
    { label: "Careers", href: "/careers" },
    { label: "Press", href: "/press" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "/privacy-policy" },
    { label: "Terms of Service", href: "/terms-of-service" },
    { label: "Cookie Policy", href: "/cookie-policy" },
    { label: "Data Protection", href: "/data-protection" },
  ],
};

const SOCIAL = [
  { icon: Twitter, label: "Twitter", href: "#" },
  { icon: Linkedin, label: "LinkedIn", href: "#" },
  { icon: Facebook, label: "Facebook", href: "#" },
  { icon: Instagram, label: "Instagram", href: "#" },
];

const EMPTY_CONTACT: ContactInfo = { supportEmail: "", supportPhone: "", supportWhatsapp: "" };

export function MarketingFooter() {
  const year = new Date().getFullYear();
  const [contact, setContact] = useState<ContactInfo>(EMPTY_CONTACT);

  // Superadmin-configurable contact details (platform.support_email/_phone/_whatsapp)
  // — the raw address/number is never rendered as visible text, only used as
  // click targets behind generic labels, to discourage scraping. A method is
  // hidden entirely if it isn't configured or the lookup fails.
  useEffect(() => {
    let cancelled = false;
    apiGet<ContactInfo>("/public/contact-info")
      .then((res) => { if (!cancelled && res) setContact(res); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const contactLinks = [
    contact.supportEmail && {
      icon: Mail,
      label: "Email us",
      href: `mailto:${contact.supportEmail}`,
    },
    contact.supportPhone && {
      icon: Phone,
      label: "Call us",
      href: `tel:${contact.supportPhone}`,
    },
    { icon: MapPin, label: "Kampala, Uganda", href: undefined },
    contact.supportWhatsapp && {
      icon: MessageCircle,
      label: "WhatsApp Us",
      href: `https://wa.me/${contact.supportWhatsapp}`,
    },
  ].filter(Boolean) as { icon: typeof Mail; label: string; href?: string }[];

  return (
    <footer
      role="contentinfo"
      className="bg-[#111827] border-t border-white/10"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-14 pb-8">
        {/* Top row */}
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5 pb-12 border-b border-white/10">
          {/* Brand */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-1 space-y-4">
            <Link href="/" aria-label="Crib home">
              <Image
                src="/crib-icon-green.png"
                alt="Crib"
                width={160}
                height={40}
                className="h-8 sm:h-9 w-auto"
              />
            </Link>
            <p className="text-sm text-white/50 leading-relaxed max-w-xs">
              Modern property management for landlords and property managers in
              Africa.
            </p>
            {/* Social */}
            <div className="flex items-center gap-3 pt-1">
              {SOCIAL.map(({ icon: Icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/50 hover:bg-white/20 hover:text-white transition-colors"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([group, links]) => (
            <div key={group}>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30 mb-4">
                {group}
              </p>
              <ul className="space-y-2.5" role="list">
                {links.map(({ label, href }) => (
                  <li key={label}>
                    <a
                      href={href}
                      className="text-sm text-white/50 hover:text-white transition-colors"
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Contact column */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30 mb-4">
              Contact
            </p>
            <ul className="space-y-2.5" role="list">
              {contactLinks.map(({ icon: Icon, label, href }) => (
                <li key={label}>
                  {href ? (
                    <a
                      href={href}
                      className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {label}
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-sm text-white/50">
                      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {label}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom row */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-white/30">
            &copy; {year} Crib, a product of GeoBox Digital Services (U) Ltd. All rights
            reserved. Built in Uganda 🇺🇬
          </p>
          <div className="flex items-center gap-4">
            <a
              href="/privacy-policy"
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              Privacy
            </a>
            <a
              href="/terms-of-service"
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              Terms
            </a>
            <a
              href="/cookie-policy"
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              Cookies
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
>>>>>>> c5b456736fe5b4d2905d6e5582a5cb3aad64eac6
