export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";

// Browser-accessible Logto URL — used in the redirect the browser follows.
// Must NOT be a Docker-internal hostname.
const LOGTO_PUBLIC_ENDPOINT =
  process.env.NEXT_PUBLIC_LOGTO_ENDPOINT ?? "http://localhost:3001";
const LOGTO_APP_ID = process.env.NEXT_PUBLIC_LOGTO_APP_ID ?? "";
const LOGTO_API_RESOURCE =
  process.env.NEXT_PUBLIC_LOGTO_API_RESOURCE ?? "http://localhost:8001";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3010";

/**
 * GET /api/logto/sign-in
 *
 * Builds a Logto OIDC authorization URL with PKCE + resource scoping and
 * redirects the browser to it. All work is pure crypto — NO network request
 * to Logto is made by the server (avoids Docker-hostname resolution issues).
 *
 * Query params:
 *   redirectTo — where to send the user after successful sign-in (default "/")
 *
 * Cookies set:
 *   pkce_verifier        — PKCE code_verifier (httpOnly, 5 min)
 *   pkce_state           — OAuth state for CSRF protection (httpOnly, 5 min)
 *   post_login_redirect  — final destination after callback (httpOnly, 10 min)
 */
export async function GET(request: NextRequest) {
  const redirectTo = request.nextUrl.searchParams.get("redirectTo") ?? "/";

  // ── PKCE: code_verifier + code_challenge ─────────────────────────────────
  const verifierBytes = crypto.getRandomValues(new Uint8Array(48));
  const verifier = btoa(String.fromCharCode(...verifierBytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const state = crypto.randomUUID();

  // ── Build Logto authorization URL ────────────────────────────────────────
  const authUrl = new URL(`${LOGTO_PUBLIC_ENDPOINT}/oidc/auth`);
  authUrl.searchParams.set("client_id", LOGTO_APP_ID);
  authUrl.searchParams.set(
    "redirect_uri",
    `${APP_URL}/api/logto/sign-in-callback`,
  );
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set(
    "scope",
    [
      "openid",
      "profile",
      "email",
      "phone",
      "roles",
      "custom_data",
      "offline_access",
      "urn:logto:scope:organizations",
    ].join(" "),
  );
  // resource scopes the access token audience to our backend API
  authUrl.searchParams.set("resource", LOGTO_API_RESOURCE);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(authUrl.toString());

  const c = { httpOnly: true, sameSite: "lax" as const, path: "/" };
  response.cookies.set("pkce_verifier", verifier, { ...c, maxAge: 300 });
  response.cookies.set("pkce_state", state, { ...c, maxAge: 300 });
  response.cookies.set("post_login_redirect", redirectTo, {
    ...c,
    maxAge: 600,
  });

  return response;
}
