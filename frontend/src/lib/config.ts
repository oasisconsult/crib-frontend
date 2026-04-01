/**
 * Centralised server-side config for auth routes.
 * All env vars are read here — never scattered across route files.
 *
 * LOGTO_ENDPOINT      — server-reachable URL (may be Docker-internal)
 * NEXT_PUBLIC_LOGTO_ENDPOINT — browser-reachable URL
 * NEXT_PUBLIC_APP_URL — public app URL (used in redirect URIs)
 */

/** Logto endpoint reachable from the Next.js server (may be Docker-internal). */
export const LOGTO_SERVER_URL =
  process.env.LOGTO_ENDPOINT ??
  process.env.NEXT_PUBLIC_LOGTO_ENDPOINT ??
  "http://localhost:3001";

/** Logto endpoint reachable from the browser (always public). */
export const LOGTO_PUBLIC_URL =
  process.env.NEXT_PUBLIC_LOGTO_ENDPOINT ?? "http://localhost:3001";

export const LOGTO_APP_ID = process.env.NEXT_PUBLIC_LOGTO_APP_ID ?? "";

/** Only set for confidential (Traditional Web App) clients. Empty for PKCE-only SPAs. */
export const LOGTO_APP_SECRET = (() => {
  const v = process.env.LOGTO_APP_SECRET ?? "";
  return v && !v.startsWith("<") ? v : "";
})();

/** The API resource identifier registered in Logto — scopes the access token audience. */
export const API_RESOURCE =
  process.env.NEXT_PUBLIC_LOGTO_API_RESOURCE ?? "http://localhost:8001";

/** Public-facing app URL — used in OIDC redirect URIs and post-logout redirects. */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** Backend URL for server-to-server calls (audit log forwarding, etc.). */
export const BACKEND_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

export const IS_PRODUCTION = process.env.NODE_ENV === "production";
