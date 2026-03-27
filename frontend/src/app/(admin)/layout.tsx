"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { MobileNav } from "@/components/layout/MobileNav";
import { OfflineBanner } from "@/components/common/OfflineBanner";
import { AuthInitializer } from "@/components/providers/AuthInitializer";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AuthInitializer />
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
  );
}
