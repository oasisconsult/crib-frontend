"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { MSWProvider } from "@/components/providers/MSWProvider";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { CookieConsentBanner } from "@/components/common/CookieConsentBanner";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      title="Application Error"
      description="Something went wrong with the application."
    >
      <MSWProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            {children}
            <ToastProvider />
            {/* <CookieConsentBanner /> */}
          </ThemeProvider>
        </QueryClientProvider>
      </MSWProvider>
    </ErrorBoundary>
  );
}
