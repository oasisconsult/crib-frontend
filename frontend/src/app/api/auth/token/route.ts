export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { logtoClient, LOGTO_API_RESOURCE } from "@/lib/logto";

/**
 * GET /api/auth/token
 *
 * Returns an access token for the backend API.
 *
 * Mock mode: reads the logto_session cookie set by /api/auth/dev-login and
 *            returns it as-is (the backend ignores it in favour of X-Dev-User-Id).
 *
 * Real mode: uses the Logto SDK to obtain a valid access token scoped to the
 *            backend API resource (audience = LOGTO_API_RESOURCE).
 *            If the access token is expired the SDK will refresh it automatically
 *            using the stored refresh_token.
 */
export async function GET(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_MOCK_API === "true") {
    const session = request.cookies.get("logto_session")?.value;
    if (!session) {
      return NextResponse.json({ error: "No session" }, { status: 401 });
    }
    return NextResponse.json({ token: session });
  }

  // getLogtoContext reads the encrypted SDK session cookie, decrypts it, and
  // uses the stored refresh_token to obtain a fresh access_token if needed.
  const context = await logtoClient.getLogtoContext(request, {
    getAccessToken: true,
    resource: LOGTO_API_RESOURCE,
  });

  if (!context.isAuthenticated || !context.accessToken) {
    return NextResponse.json({ error: "No session" }, { status: 401 });
  }

  return NextResponse.json({ token: context.accessToken });
}
