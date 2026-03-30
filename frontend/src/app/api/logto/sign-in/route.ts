export const runtime = "edge";

import { type NextRequest } from "next/server";
import { logtoClient } from "@/lib/logto";

/**
 * GET /api/logto/sign-in
 *
 * Initiates the Logto OIDC sign-in flow using the SDK.
 * The SDK generates PKCE verifier + challenge, stores them in the encrypted
 * session cookie, and redirects the browser to Logto's /oidc/auth endpoint.
 *
 * Query params:
 *   redirectTo — where to send the user after successful sign-in (default "/")
 *
 * The redirectTo value is stored in a short-lived cookie so the callback
 * route can use it after Logto redirects back.
 */
export async function GET(request: NextRequest) {
  const redirectTo = request.nextUrl.searchParams.get("redirectTo") ?? "/";

  // The SDK sets the session cookie + redirects to Logto's OIDC auth endpoint.
  // Default callback URI: ${baseUrl}/api/logto/sign-in-callback (from logto.ts config).
  const sdkResponse = await logtoClient.handleSignIn()(request);

  // Attach a short-lived httpOnly cookie so the callback knows the final destination.
  // Using append so the SDK's own Set-Cookie headers are preserved.
  const response = new Response(null, {
    status: sdkResponse.status,
    headers: new Headers(sdkResponse.headers),
  });
  response.headers.append(
    "Set-Cookie",
    `post_login_redirect=${encodeURIComponent(redirectTo)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`,
  );

  return response;
}
