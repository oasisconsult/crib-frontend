export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";

/**
 * GET /api/auth/token
 *
 * Returns the access token from the httpOnly logto_session cookie so client-
 * side code (AuthInitializer) can store it in sessionStorage for axios Bearer auth.
 *
 * Mock mode:  cookie value is a dev session string; the backend ignores it and
 *             reads X-Dev-User-Id header instead.
 * Real mode:  cookie value is the Logto access token (set by /api/logto/sign-in-callback).
 */
// export async function GET(request: NextRequest) {
//   const session = request.cookies.get("logto_session")?.value;
//   if (!session) {
//     return NextResponse.json({ error: "No session" }, { status: 401 });
//   }
//   return NextResponse.json({ token: session });
// }

// /app/api/auth/token/route.ts

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("logto_session")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ token: accessToken });
}
