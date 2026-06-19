"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "Listings", href: "/listings" },
  { label: "About", href: "#about" },
  { label: "Contact", href: "#booking" },
];

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <>
      <header
        role="banner"
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-300",
          scrolled
            ? "bg-white/95 backdrop-blur-md shadow-sm border-b border-[hsl(var(--border))]"
            : "bg-transparent",
        )}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          {/* Logo */}
          <Link href="/" aria-label="Crib home" className="shrink-0">
            <Image
              src="/crib-icon-green.png"
              alt="Crib"
              width={160}
              height={40}
              className="h-[34px] sm:h-[38px] md:h-[42px] w-auto"
              priority
            />
          </Link>

          {/* Desktop nav */}
          <nav
            aria-label="Main navigation"
            className="hidden md:flex items-center gap-1"
          >
            {NAV_LINKS.map(({ label, href }) => (
              <a
                key={href}
                href={href}
                className="px-3 py-2 text-sm font-medium text-[hsl(var(--muted-foreground))] rounded-md hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
              >
                {label}
              </a>
            ))}
          </nav>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Login</Link>
            </Button>
            <Button asChild size="sm">
              <a href="#booking">Get Started Free</a>
            </Button>
          </div>

          {/* Mobile hamburger */}
          <button
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((v) => !v)}
            className="md:hidden flex h-9 w-9 items-center justify-center rounded-md text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
          >
            {menuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <div
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          className="fixed inset-0 z-40 md:hidden"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          {/* Panel */}
          <div className="absolute inset-x-0 top-16 bg-white border-b border-[hsl(var(--border))] shadow-xl animate-in slide-in-from-top-2 duration-200 p-4 space-y-1">
            {NAV_LINKS.map(({ label, href }) => (
              <a
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="flex items-center px-4 py-3 text-sm font-medium text-[hsl(var(--foreground))] rounded-lg hover:bg-[hsl(var(--accent))] transition-colors"
              >
                {label}
              </a>
            ))}
            <div className="pt-3 border-t border-[hsl(var(--border))] space-y-2">
              <Button asChild variant="outline" className="w-full">
                <Link href="/login" onClick={() => setMenuOpen(false)}>
                  Login
                </Link>
              </Button>
              <Button asChild className="w-full">
                <a href="#booking" onClick={() => setMenuOpen(false)}>
                  Get Started Free
                </a>
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
