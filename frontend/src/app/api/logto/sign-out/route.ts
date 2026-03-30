export const runtime = "edge";

import { type NextRequest } from "next/server";
import { logtoClient } from "@/lib/logto";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3010";

/**
 * GET /api/logto/sign-out
 *
 * Signs the user out of Logto and clears all session/role cookies.
 * The SDK revokes the refresh token and redirects to the Logto logout endpoint,
 * which then redirects back to APP_URL.
 */
export async function GET(request: NextRequest) {
  // SDK revokes tokens + redirects to Logto's end_session_endpoint,
  // which then redirects back to APP_URL.
  const sdkResponse = await logtoClient.handleSignOut(APP_URL)(request);

  // Clear our compat cookies on top of whatever the SDK sets.
  const response = new Response(null, {
    status: sdkResponse.status,
    headers: new Headers(sdkResponse.headers),
  });
  response.headers.append(
    "Set-Cookie",
    "logto_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
  );
  response.headers.append(
    "Set-Cookie",
    "user_role=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
  );

  return response;
}
