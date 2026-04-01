"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { MobileNav } from "@/components/layout/MobileNav";
import { OfflineBanner } from "@/components/common/OfflineBanner";
import { AuthInitializer } from "@/components/providers/AuthInitializer";
import { useAppStore } from "@/store/useAppStore";

function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const isAuthInitialized = useAppStore((s) => s.isAuthInitialized);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);

  useEffect(() => {
    // Only redirect after auth has fully resolved — avoids flash redirect
    if (isAuthInitialized && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthInitialized, isAuthenticated, router]);

  // Show nothing until we know the auth state
  if (!isAuthInitialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return <>{children}</>;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Bootstraps token + user profile, schedules silent refresh */}
      <AuthInitializer />

      <AuthGate>
        <div className="flex h-screen overflow-hidden bg-background">
          <Sidebar />
          <MobileNav />
          <div className="flex flex-1 flex-col overflow-hidden min-w-0">
            <Header />
            <OfflineBanner />
            <main
              id="main-content"
              className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8"
            >
              {children}
            </main>
          </div>
        </div>
      </AuthGate>
    </>
  );
}
