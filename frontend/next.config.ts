<<<<<<< HEAD
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n.ts");

const nextConfig: NextConfig = {
  output: "standalone",  // required for Docker production image (creates .next/standalone)
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // IMPORTANT: Do not rewrite /api/v1/* directly to the backend.
  // We use an App Router route handler at `src/app/api/v1/[...path]/route.ts`
  // as a BFF proxy that injects Authorization from the httpOnly cookie.
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "**.minio.io" },
    ],
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    typedRoutes: true,
  },
  async redirects() {
    return [
      // The "GDPR" legal page was renamed to "Data Protection" to reflect
      // Uganda's Data Protection and Privacy Act, 2019 (rather than implying
      // an EU-GDPR-equivalent law by that name).
      { source: "/gdpr", destination: "/data-protection", permanent: true },
    ];
  },
  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    // Next.js 15 App Router generates inline scripts for React Server Components
    // hydration and chunk loading — 'unsafe-inline' is required in both envs.
    // 'unsafe-eval' is only needed in dev for MSW / hot reload.
    const scriptSrc = isDev
      ? "'self' 'unsafe-inline' 'unsafe-eval'"
      : "'self' 'unsafe-inline'";

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              `script-src ${scriptSrc}`,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              isDev
                ? "connect-src 'self' http://localhost:* https:"
                : "connect-src 'self' https:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
=======
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n.ts");

const nextConfig: NextConfig = {
  output: "standalone",  // required for Docker production image (creates .next/standalone)
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // IMPORTANT: Do not rewrite /api/v1/* directly to the backend.
  // We use an App Router route handler at `src/app/api/v1/[...path]/route.ts`
  // as a BFF proxy that injects Authorization from the httpOnly cookie.
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "**.minio.io" },
    ],
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    typedRoutes: true,
  },
  async redirects() {
    return [
      // The "GDPR" legal page was renamed to "Data Protection" to reflect
      // Uganda's Data Protection and Privacy Act, 2019 (rather than implying
      // an EU-GDPR-equivalent law by that name).
      { source: "/gdpr", destination: "/data-protection", permanent: true },
    ];
  },
  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    // Next.js 15 App Router generates inline scripts for React Server Components
    // hydration and chunk loading — 'unsafe-inline' is required in both envs.
    // 'unsafe-eval' is only needed in dev for MSW / hot reload.
    const scriptSrc = isDev
      ? "'self' 'unsafe-inline' 'unsafe-eval'"
      : "'self' 'unsafe-inline'";

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              `script-src ${scriptSrc}`,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              isDev
                ? "connect-src 'self' http://localhost:* https:"
                : "connect-src 'self' https:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
>>>>>>> c5b456736fe5b4d2905d6e5582a5cb3aad64eac6
