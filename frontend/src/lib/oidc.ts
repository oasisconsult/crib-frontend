/**
 * oidc.ts — Logto OIDC token exchange helpers (server-side only).
 *
 * All token exchange logic lives here. Route handlers call these functions
 * instead of duplicating fetch + URLSearchParams boilerplate.
 *
 * NOTE: Constants are evaluated lazily (inside functions) rather than at
 * module load time. This ensures Edge runtime routes always read the current
 * process.env values, including server-only vars like LOGTO_ENDPOINT.
 */

import { LOGTO_APP_ID, LOGTO_APP_SECRET, API_RESOURCE } from "./config";
import { decodeJwt } from "./auth";
import type { UserRole } from "@/types";

function tokenEndpoint(): string {
  // Read at call time so Edge runtime picks up LOGTO_ENDPOINT correctly
  const base =
    process.env.LOGTO_ENDPOINT ??
    process.env.NEXT_PUBLIC_LOGTO_ENDPOINT ??
    "http://localhost:3001";
  return `${base}/oidc/token`;
}

function revokeEndpoint(): string {
  const base =
    process.env.LOGTO_ENDPOINT ??
    process.env.NEXT_PUBLIC_LOGTO_ENDPOINT ??
    "http://localhost:3001";
  return `${base}/oidc/token/revocation`;
}

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  role: UserRole;
  orgId?: string;
}

// ── Internal fetch helper ────────────────────────────────────────────────────

async function postToTokenEndpoint(
  params: Record<string, string>,
): Promise<TokenSet> {
  const body = new URLSearchParams(params);
  if (LOGTO_APP_SECRET) body.set("client_secret", LOGTO_APP_SECRET);

  const url = tokenEndpoint();
  console.debug("[oidc] POST", url, "grant_type:", params.grant_type);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(
      "[oidc] Token endpoint error:",
      res.status,
      text,
      "url:",
      url,
    );
    throw new OidcError(res.status, text);
  }

  return res.json() as Promise<TokenSet>;
}

export class OidcError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`OIDC error ${status}: ${body}`);
    this.name = "OidcError";
  }
}

// ── Role extraction ──────────────────────────────────────────────────────────

export function extractRole(accessToken: string): UserRole {
  const claims = decodeJwt(accessToken);
  if (!claims) return "owner" as UserRole;

  const globalRoles = claims.roles ?? [];
  const orgRoles = claims.organization_roles ?? [];

  if (globalRoles.includes("superadmin")) return "superadmin" as UserRole;

  if (orgRoles.length > 0) {
    // Org-scoped tokens use plain role names; ID tokens use "orgId:roleName"
    const raw = orgRoles[0];
    return (raw.includes(":") ? raw.split(":").pop()! : raw) as UserRole;
  }

  return "owner" as UserRole;
}

// ── Token exchange functions ─────────────────────────────────────────────────

/**
 * Exchange an authorization code for tokens (PKCE flow).
 * Called once during the sign-in callback.
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<TokenSet> {
  return postToTokenEndpoint({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: LOGTO_APP_ID,
    code_verifier: codeVerifier,
  });
}

/**
 * Refresh an access token using a refresh token.
 * Logto rotates the refresh token on every use.
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<TokenSet> {
  return postToTokenEndpoint({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: LOGTO_APP_ID,
    resource: API_RESOURCE,
  });
}

/**
 * Exchange a refresh token for an org-scoped access token.
 * The resulting token carries organization_id + organization_roles claims.
 */
export async function getOrgScopedToken(
  refreshToken: string,
  orgId: string,
): Promise<TokenSet> {
  return postToTokenEndpoint({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: LOGTO_APP_ID,
    resource: API_RESOURCE,
    organization_id: orgId,
  });
}

/**
 * Revoke a refresh token at the Logto revocation endpoint.
 * Called during logout. Errors are swallowed — logout must always succeed.
 */
export async function revokeToken(token: string): Promise<void> {
  try {
    const body = new URLSearchParams({
      token,
      token_type_hint: "refresh_token",
      client_id: LOGTO_APP_ID,
    });
    if (LOGTO_APP_SECRET) body.set("client_secret", LOGTO_APP_SECRET);

    await fetch(revokeEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    // Revocation failure must never block logout
  }
}

/**
 * Full session token resolution:
 *  1. Refresh the base access token
 *  2. If an orgId is provided, exchange for an org-scoped token
 *  3. Extract role from the final access token
 *
 * Returns a normalised SessionTokens object ready to be written to cookies.
 */
export async function resolveSessionTokens(
  refreshToken: string,
  activeOrgId?: string,
): Promise<SessionTokens> {
  // Step 1: base refresh
  const base = await refreshAccessToken(refreshToken);

  let accessToken = base.access_token;
  // Use the new refresh token from the rotation if available
  const newRefreshToken = base.refresh_token ?? refreshToken;

  // Step 2: org-scoped token
  if (activeOrgId) {
    try {
      const orgTokens = await getOrgScopedToken(newRefreshToken, activeOrgId);
      accessToken = orgTokens.access_token;
    } catch {
      // Fall back to base access token — org scope is best-effort
    }
  }

  // Step 3: extract role + org from final token
  const claims = decodeJwt(accessToken);
  const role = extractRole(accessToken);
  const orgId = claims?.organization_id ?? activeOrgId;

  return {
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn: base.expires_in,
    role,
    orgId,
  };
}
