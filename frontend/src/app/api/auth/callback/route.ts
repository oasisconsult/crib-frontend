import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=no_code", request.url));
  }

  // Exchange code for tokens at Logto token endpoint
  const tokenRes = await fetch(
    `${process.env.LOGTO_ENDPOINT}/oidc/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`,
        client_id: process.env.LOGTO_APP_ID ?? "",
        client_secret: process.env.LOGTO_APP_SECRET ?? "",
      }),
    },
  );

  if (!tokenRes.ok) {
    return NextResponse.redirect(
      new URL("/login?error=token_exchange", request.url),
    );
  }

  const tokens = await tokenRes.json();

  // Determine redirect target from state
  let redirect = "/";
  try {
    const parsed = JSON.parse(atob(state ?? ""));
    redirect = parsed.redirect ?? "/";
  } catch {}

  const response = NextResponse.redirect(new URL(redirect, request.url));

  // Set httpOnly session cookie (access token)
  response.cookies.set("logto_session", tokens.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: tokens.expires_in,
    path: "/",
  });

  // Decode the ID token to extract role (simplified — use jose in production)
  try {
    const payload = JSON.parse(
      Buffer.from(tokens.id_token.split(".")[1], "base64url").toString(),
    );
    const role: string =
      payload?.roles?.[0] ?? payload?.["urn:logto:scope:roles"]?.[0] ?? "landlord";

    // httpOnly: true — middleware runs server-side and can read httpOnly cookies.
    // This prevents client JS from reading/forging the role cookie via XSS.
    response.cookies.set("user_role", role, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: tokens.expires_in,
      path: "/",
    });
  } catch {}

  return response;
}
