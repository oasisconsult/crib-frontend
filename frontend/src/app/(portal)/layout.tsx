"use client";

import { LogOut, Sun, Moon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { AuthInitializer } from "@/components/providers/AuthInitializer";
import { useAppStore } from "@/store/useAppStore";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";

function PortalNav() {
  const user = useAppStore((s) => s.user);
  const { logout } = useAuth();
  const { isDark, setPreference } = useTheme();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-4xl mx-auto flex h-14 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Link href="/" aria-label="Go to Crib home">
            <Image
              src="/crib-icon-green.png"
              alt="Crib"
              width={160}
              height={40}
              priority
              className="h-8 sm:h-9 w-auto"
            />
          </Link>
          <span className="text-muted-foreground/50 text-sm">·</span>
          <span className="text-sm text-muted-foreground">Tenant Portal</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPreference(isDark ? "light" : "dark")}
            aria-label="Toggle theme"
            className="flex h-8 w-8 items-center justify-center rounded-[5px] text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-colors"
          >
            {isDark ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
          {user && (
            <>
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium leading-none">{user.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {user.email}
                </p>
              </div>
              <button
                onClick={() => logout()}
                className="flex items-center gap-1.5 rounded-[5px] px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <AuthInitializer />
      <PortalNav />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}
