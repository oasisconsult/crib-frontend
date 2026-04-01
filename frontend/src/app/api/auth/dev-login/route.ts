import { NextRequest, NextResponse } from "next/server";

// Only active in mock/dev mode — returns 404 in production
export async function POST(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_MOCK_API !== "true") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const { userId, role } = (await request.json()) as {
    userId: string;
    role: string;
  };

  if (!userId || !role) {
    return NextResponse.json(
      { error: "userId and role required" },
      { status: 400 },
    );
  }

  const response = NextResponse.json({ ok: true });

  const cookieOpts = {
    httpOnly: true,
    secure: false,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 8, // 8h dev session
    path: "/",
  };

  // Fake session token — middleware only checks existence, not value.
  // Prefixed with "dev." so useAuth can detect mock mode and skip JWT parsing.
  response.cookies.set("logto_session", `dev.${userId}`, cookieOpts);
  response.cookies.set("user_role", role, cookieOpts);
  // No refresh_token in mock mode — useAuth skips refresh for dev sessions

  return response;
}
