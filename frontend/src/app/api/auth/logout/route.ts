/**
 * POST /api/auth/logout
 *
 * Secure programmatic logout.
 *
 * Flow:
 *  1. Revoke the refresh_token at Logto's revocation endpoint (server-side)
 *  2. Clear all session cookies
 *  3. Return { logoutUrl } — client navigates to Logto end_session
 *
 * Using POST so the client can include an audit payload and we can revoke
 * the token server-side before the browser navigates away.
 * The keepalive fetch in the client ensures this completes even on page unload.
 */
export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { LOGTO_PUBLIC_URL, LOGTO_APP_ID, APP_URL } from "@/lib/config";
import { COOKIE, clearAuthCookies } from "@/lib/cookies";
import { revokeToken } from "@/lib/oidc";

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get(COOKIE.REFRESH)?.value;

  // Revoke server-side — errors are swallowed inside revokeToken
  if (refreshToken) await revokeToken(refreshToken);

  const endSessionUrl = new URL(`${LOGTO_PUBLIC_URL}/oidc/session/end`);
  endSessionUrl.searchParams.set("client_id", LOGTO_APP_ID);
  endSessionUrl.searchParams.set("post_logout_redirect_uri", `${APP_URL}/login`);

  const response = NextResponse.json({ logoutUrl: endSessionUrl.toString() });
  clearAuthCookies(response);
  return response;
}
