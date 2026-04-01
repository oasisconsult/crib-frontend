/**
 * GET /api/logto/sign-out
 *
 * Clears all session cookies and redirects the browser to Logto's
 * end_session_endpoint. Logto will redirect back to APP_URL/login.
 *
 * Prefer POST /api/auth/logout for programmatic logout (revokes refresh token).
 * This GET route exists for direct link navigation (e.g. email links).
 */
export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { LOGTO_PUBLIC_URL, APP_URL } from "@/lib/config";
import { clearAuthCookies } from "@/lib/cookies";

export async function GET(_request: NextRequest) {
  const endSessionUrl = new URL(`${LOGTO_PUBLIC_URL}/oidc/session/end`);
  endSessionUrl.searchParams.set(
    "post_logout_redirect_uri",
    `${APP_URL}/login`,
  );

  const response = NextResponse.redirect(endSessionUrl.toString());
  clearAuthCookies(response);
  return response;
}
