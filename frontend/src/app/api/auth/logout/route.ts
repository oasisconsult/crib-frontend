/**
 * POST /api/auth/logout
 *
 * Secure logout:
 *  1. Revoke the refresh_token at Logto's revocation endpoint
 *  2. Clear all session cookies
 *  3. Return { logoutUrl } — client redirects browser to Logto end_session
 *
 * Using POST (not GET) so the client can send the audit payload in the body
 * and we can revoke the token server-side before the browser navigates away.
 */
export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";

const LOGTO_SERVER_ENDPOINT =
  process.env.LOGTO_ENDPOINT ??
  process.env.NEXT_PUBLIC_LOGTO_ENDPOINT ??
  "http://localhost:3001";
const LOGTO_PUBLIC_ENDPOINT =
  process.env.NEXT_PUBLIC_LOGTO_ENDPOINT ?? "http://localhost:3001";
const LOGTO_APP_ID = process.env.NEXT_PUBLIC_LOGTO_APP_ID ?? "";
const LOGTO_APP_SECRET = (() => {
  const v = process.env.LOGTO_APP_SECRET ?? "";
  return v && !v.startsWith("<") ? v : "";
})();
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const COOKIE_NAMES = [
  "logto_session",
  "refresh_token",
  "user_role",
  "active_org_id",
  "pkce_verifier",
  "pkce_state",
  "post_login_redirect",
  "access_token", // legacy
];

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get("refresh_token")?.value;

  // ── Revoke refresh token at Logto ────────────────────────────────────────
  if (refreshToken) {
    const revokeBody = new URLSearchParams({
      token: refreshToken,
      token_type_hint: "refresh_token",
      client_id: LOGTO_APP_ID,
    });
    if (LOGTO_APP_SECRET) revokeBody.set("client_secret", LOGTO_APP_SECRET);

    try {
      await fetch(`${LOGTO_SERVER_ENDPOINT}/oidc/token/revocation`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: revokeBody,
      });
    } catch (err) {
      // Log but don't block logout — cookies will be cleared regardless
      console.error("[logout] Token revocation failed:", err);
    }
  }

  // ── Build Logto end_session URL (browser will navigate here) ────────────
  const endSessionUrl = new URL(`${LOGTO_PUBLIC_ENDPOINT}/oidc/session/end`);
  endSessionUrl.searchParams.set(
    "post_logout_redirect_uri",
    `${APP_URL}/login`,
  );

  const response = NextResponse.json({ logoutUrl: endSessionUrl.toString() });

  // ── Clear all cookies ────────────────────────────────────────────────────
  const clearOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
  for (const name of COOKIE_NAMES) {
    response.cookies.set(name, "", clearOpts);
  }

  return response;
}

// Keep GET for legacy /api/auth/logout links
export async function GET(request: NextRequest) {
  const refreshToken = request.cookies.get("refresh_token")?.value;

  if (refreshToken) {
    const revokeBody = new URLSearchParams({
      token: refreshToken,
      token_type_hint: "refresh_token",
      client_id: LOGTO_APP_ID,
    });
    if (LOGTO_APP_SECRET) revokeBody.set("client_secret", LOGTO_APP_SECRET);
    try {
      await fetch(`${LOGTO_SERVER_ENDPOINT}/oidc/token/revocation`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: revokeBody,
      });
    } catch {}
  }

  const endSessionUrl = new URL(`${LOGTO_PUBLIC_ENDPOINT}/oidc/session/end`);
  endSessionUrl.searchParams.set(
    "post_logout_redirect_uri",
    `${APP_URL}/login`,
  );
  const response = NextResponse.redirect(endSessionUrl.toString());

  const clearOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
  for (const name of COOKIE_NAMES) {
    response.cookies.set(name, "", clearOpts);
  }

  return response;
}
