/**
 * GET /api/logto/sign-in
 *
 * Initiates the OIDC authorization code flow with PKCE.
 * Builds the Logto authorization URL and redirects the browser to it.
 * No server-to-Logto network call is made here — pure crypto only.
 *
 * Query params:
 *   redirectTo — post-login destination (default "/")
 *
 * Sets httpOnly cookies:
 *   pkce_verifier       — PKCE code_verifier (5 min)
 *   pkce_state          — OAuth state for CSRF protection (5 min)
 *   post_login_redirect — final destination after callback (10 min)
 */
export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import {
  LOGTO_PUBLIC_URL,
  LOGTO_APP_ID,
  API_RESOURCE,
  APP_URL,
} from "@/lib/config";
import { COOKIE, cookieOpts, TTL } from "@/lib/cookies";

export async function GET(request: NextRequest) {
  const redirectTo = request.nextUrl.searchParams.get("redirectTo") ?? "/";

  // ── PKCE ─────────────────────────────────────────────────────────────────
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

  // ── Authorization URL ─────────────────────────────────────────────────────
  const authUrl = new URL(`${LOGTO_PUBLIC_URL}/oidc/auth`);
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
  authUrl.searchParams.set("resource", API_RESOURCE);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set(COOKIE.PKCE_VERIFIER, verifier, {
    ...cookieOpts.flow,
    maxAge: TTL.PKCE,
  });
  response.cookies.set(COOKIE.PKCE_STATE, state, {
    ...cookieOpts.flow,
    maxAge: TTL.PKCE,
  });
  response.cookies.set(COOKIE.POST_LOGIN_REDIRECT, redirectTo, {
    ...cookieOpts.flow,
    maxAge: TTL.POST_REDIRECT,
  });

  return response;
}
