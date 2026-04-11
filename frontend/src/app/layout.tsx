"use client";

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { MSWProvider } from "@/components/providers/MSWProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { CookieConsentBanner } from "@/components/common/CookieConsentBanner";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ErrorBoundary title="Application Error" description="Something went wrong with the application.">
          <MSWProvider>
            <QueryClientProvider client={queryClient}>
              <ThemeProvider>
                {children}
                <ToastProvider />
                <CookieConsentBanner />
              </ThemeProvider>
            </QueryClientProvider>
          </MSWProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
