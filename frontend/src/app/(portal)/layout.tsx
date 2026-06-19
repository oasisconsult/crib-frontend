"use client";

import { useEffect } from "react";
import { LogOut, Sun, Moon, Bell } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { AuthInitializer } from "@/components/providers/AuthInitializer";
import { useAppStore } from "@/store/useAppStore";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { useNotificationStats } from "@/hooks/useNotifications";

function PortalNav() {
  const user = useAppStore((s) => s.user);
  const { logout } = useAuth();
  const { isDark, setPreference } = useTheme();
  const { data: notifStats } = useNotificationStats();

  const unreadCount = Math.max(
    0,
    (notifStats?.delivered ?? 0) - (notifStats?.read ?? 0),
  );

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
              className="h-[34px] sm:h-[38px] w-auto"
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
          <button
            aria-label={
              unreadCount > 0
                ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
                : "Notifications"
            }
            className="relative flex h-8 w-8 items-center justify-center rounded-[5px] text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-colors"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground"
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
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

/**
 * PortalAuthGate — client-side session guard for the tenant portal.
 *
 * Mirrors the dashboard's AuthGate pattern:
 *   1. Shows a spinner while auth is initialising (prevents flash of content).
 *   2. Redirects to /login if the session is missing or expired.
 *   3. Redirects non-tenants away from the portal (defence-in-depth alongside middleware).
 *
 * The middleware already handles server-side enforcement; this catches
 * in-page session expiry (e.g. user leaves the tab open for hours).
 */
function PortalAuthGate({ children }: { children: React.ReactNode }) {
  const isAuthInitialized = useAppStore((s) => s.isAuthInitialized);
  const isAuthenticated   = useAppStore((s) => s.isAuthenticated);
  const user              = useAppStore((s) => s.user);

  useEffect(() => {
    if (!isAuthInitialized) return;

    if (!isAuthenticated) {
      window.location.replace("/login?redirect=/portal");
      return;
    }

    // Defence-in-depth: if the authenticated user is not a tenant,
    // redirect them to the appropriate area.
    if (user) {
      const userRoles: string[] =
        (user.roles as string[] | undefined) ??
        (user.role ? [user.role as string] : []);

      if (!userRoles.includes("tenant")) {
        // Staff/owner/manager → staff dashboard
        window.location.replace("/dashboard");
      }
    }
  }, [isAuthInitialized, isAuthenticated, user]);

  // Spinner while auth is initialising — prevents a flash of portal content
  if (!isAuthInitialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Not authenticated — null while the useEffect redirect fires
  if (!isAuthenticated) return null;

  // Authenticated non-tenant — null while the useEffect redirect fires
  if (user) {
    const userRoles: string[] =
      (user.roles as string[] | undefined) ??
      (user.role ? [user.role as string] : []);
    if (!userRoles.includes("tenant")) return null;
  }

  return <>{children}</>;
}

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      {/* Bootstraps token + user profile, schedules silent refresh */}
      <AuthInitializer />
      <PortalAuthGate>
        <PortalNav />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">{children}</main>
      </PortalAuthGate>
    </div>
  );
}
