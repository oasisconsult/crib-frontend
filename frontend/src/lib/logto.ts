/**
 * Logto client configuration.
 *
 * @logto/next handles:
 *  - PKCE (code_verifier / code_challenge generation)
 *  - Authorization code exchange
 *  - Session storage (encrypted httpOnly cookies)
 *  - Token refresh via refresh_token (offline_access scope)
 *  - Organisation-scoped tokens (urn:logto:scope:organizations scope)
 *
 * Route handlers are in:
 *  app/api/logto/sign-in/route.ts
 *  app/api/logto/sign-in-callback/route.ts
 *  app/api/logto/sign-out/route.ts
 *
 * Register in Logto console:
 *  Redirect URI:            ${NEXT_PUBLIC_APP_URL}/api/logto/sign-in-callback
 *  Post sign-out redirect:  ${NEXT_PUBLIC_APP_URL}/
 */

import LogtoClient from "@logto/next";

// The API resource identifier registered in Logto under "API Resources".
// Must match backend setting: logto_api_resource (default: http://localhost:8001).
export const LOGTO_API_RESOURCE =
  process.env.NEXT_PUBLIC_LOGTO_API_RESOURCE ?? "http://localhost:8001";

export const logtoClient = new LogtoClient({
  appId: process.env.NEXT_PUBLIC_LOGTO_APP_ID!,
  appSecret: process.env.LOGTO_APP_SECRET!,

  // Logto OIDC endpoint (e.g. https://auth.crib.app or http://localhost:3001)
  endpoint: process.env.NEXT_PUBLIC_LOGTO_ENDPOINT!,

  // Frontend URL — Logto uses this to build the default callback path:
  //   ${baseUrl}/api/logto/sign-in-callback
  // This MUST be the URL the browser sees, not a Docker-internal hostname.
  baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3010",

  cookieSecret: process.env.NEXTAUTH_SECRET!,
  cookieSecure: process.env.NODE_ENV === "production",

  // Request an access token scoped to our backend API resource.
  // The resulting token will have aud = LOGTO_API_RESOURCE so the backend
  // can validate it. Without this, the token audience would be the client_id.
  resources: [LOGTO_API_RESOURCE],

  scopes: [
    "openid",
    "profile",
    "email",
    "phone",
    "roles",
    "custom_data",
    "offline_access",
    // Org membership + org-level roles in ID token & org-scoped access tokens
    "urn:logto:scope:organizations",
  ],
});

// ── Role constants ─────────────────────────────────────────────────────────────
// These map to organisation-level roles defined in the Logto organisation template.
// They also match the backend Role enum (app/models/profile.py).

export const LOGTO_ORG_ROLES = {
  OWNER: "owner", // Landlord / property owner — full org access
  MANAGER: "manager", // Property manager — org-scoped admin
  TENANT: "tenant", // Tenant — restricted to own lease data
  MAINTENANCE: "maintenance", // Maintenance staff — read-only inspections
} as const;

// Global (non-org) roles defined in Logto under "Roles".
export const LOGTO_GLOBAL_ROLES = {
  SUPERADMIN: "superadmin", // Platform operator — cross-org, system settings
} as const;

export type LogtoOrgRole =
  (typeof LOGTO_ORG_ROLES)[keyof typeof LOGTO_ORG_ROLES];
export type LogtoGlobalRole =
  (typeof LOGTO_GLOBAL_ROLES)[keyof typeof LOGTO_GLOBAL_ROLES];
