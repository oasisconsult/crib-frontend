// // "use client";

// import type { Metadata } from "next";
// import { Poppins, Inter } from "next/font/google";
// import "@/styles/globals.css";
// import { QueryClientProvider } from "@tanstack/react-query";
// import { queryClient } from "@/lib/queryClient";
// import { ToastProvider } from "@/components/providers/ToastProvider";
// import { MSWProvider } from "@/components/providers/MSWProvider";
// import { ThemeProvider } from "@/contexts/ThemeContext";
// import { CookieConsentBanner } from "@/components/common/CookieConsentBanner";
// import { ErrorBoundary } from "@/components/common/ErrorBoundary";
// import { performanceMonitor } from "@/lib/performance";

// const poppins = Poppins({
//   subsets: ["latin"],
//   weight: ["400", "500", "600", "700", "800"],
//   variable: "--font-poppins",
//   display: "swap",
// });

// const inter = Inter({
//   subsets: ["latin"],
//   variable: "--font-inter",
//   display: "swap",
// });

// export const metadata: Metadata = {
//   title: "Crib | A modern property management system",
//   icons: {
//     icon: "/favicon.ico",
//     apple: "/apple-icon.png",
//   },
// };

// export default function RootLayout({
//   children,
// }: {
//   children: React.ReactNode;
// }) {
//   return (
//     <html lang="en" suppressHydrationWarning>
//       <head>
//         <meta name="color-scheme" content="light dark" />
//       </head>
//       <body
//         className={`${poppins.variable} ${inter.variable} font-sans antialiased`}
//       >
//         <ErrorBoundary
//           title="Application Error"
//           description="Something went wrong with the application."
//         >
//           <MSWProvider>
//             <QueryClientProvider client={queryClient}>
//               <ThemeProvider>
//                 {children}
//                 <ToastProvider />
//                 <CookieConsentBanner />
//               </ThemeProvider>
//             </QueryClientProvider>
//           </MSWProvider>
//         </ErrorBoundary>
//       </body>
//     </html>
//   );
// }

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";
import { Providers } from "./providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  // Load the weights used across the dashboard
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title:
    "Crib | A modern property management system for landlords and tenants alike",
  icons: {
    icon: "/favicon.ico",
    apple: "/crib_logo_green.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
