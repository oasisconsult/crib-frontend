import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/auth/token
 * Returns the access token from the httpOnly session cookie so client-side
 * code (AuthInitializer) can store it in sessionStorage for axios Bearer auth.
 * Only the value already stored server-side is ever returned — this endpoint
 * does NOT generate or extend tokens.
 */
export async function GET(request: NextRequest) {
  const session = request.cookies.get("logto_session")?.value;
  if (!session) {
    return NextResponse.json({ error: "No session" }, { status: 401 });
  }
  return NextResponse.json({ token: session });
}
