import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/auth/pkce
 * Stores the PKCE code_verifier in an httpOnly cookie so the server-side
 * callback route can read it. The login page generates the verifier
 * client-side (browser crypto.subtle) and POSTs it here before redirecting
 * to Logto.
 */
export async function POST(request: NextRequest) {
  const { verifier } = await request.json();
  if (!verifier || typeof verifier !== "string") {
    return NextResponse.json({ error: "missing verifier" }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("pkce_verifier", verifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 300, // 5 minutes — enough for the auth flow
    path: "/",
  });
  return res;
}
