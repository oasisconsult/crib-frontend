/**
 * GET /api/auth/token
 *
 * Returns the current access token from the httpOnly session cookie.
 * Used by the client-side auth bootstrap to load the token into the
 * in-memory token store (never localStorage/sessionStorage).
 *
 * If the session cookie is missing, returns 401.
 * Token validity is not checked here — useAuth handles expiry + refresh.
 */
export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { COOKIE } from "@/lib/cookies";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE.SESSION)?.value;

  if (!token) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }

  return NextResponse.json({ token });
}
