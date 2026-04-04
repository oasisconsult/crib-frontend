// import { NextRequest, NextResponse } from "next/server";

// export async function GET(request: NextRequest) {
//   const { searchParams } = new URL(request.url);
//   const code = searchParams.get("code");
//   const state = searchParams.get("state");

//   // Use the public app URL so redirects go to the correct host:port,
//   // not the container-internal port Next.js listens on.
//   const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

//   // Logto may redirect back with an error instead of a code
//   const logtoError = searchParams.get("error");
//   if (logtoError || !code) {
//     const msg = logtoError ?? "no_code";
//     console.error(
//       "[auth/callback] Logto error:",
//       msg,
//       searchParams.get("error_description"),
//     );
//     return NextResponse.redirect(
//       new URL(`/login?error=${encodeURIComponent(msg)}`, appUrl),
//     );
//   }

//   // Retrieve PKCE verifier stored in a cookie (set by the login page server action)
//   // The login page stores it in sessionStorage (client-side), so we read it from
//   // a cookie that the login page sets via a small API route instead.
//   const codeVerifier = request.cookies.get("pkce_verifier")?.value;
//   console.log("[auth/callback] cookies present:", [
//     ...request.cookies.getAll().map((c) => c.name),
//   ]);
//   if (!codeVerifier) {
//     console.error("[auth/callback] Missing PKCE verifier cookie");
//     return NextResponse.redirect(
//       new URL("/login?error=missing_verifier", appUrl),
//     );
//   }

//   // Exchange code for tokens using PKCE (SPA — no client secret)
//   const tokenRes = await fetch(`${process.env.LOGTO_ENDPOINT}/oidc/token`, {
//     method: "POST",
//     headers: { "Content-Type": "application/x-www-form-urlencoded" },
//     body: new URLSearchParams({
//       grant_type: "authorization_code",
//       code,
//       redirect_uri: `${appUrl}/api/logto/sign-in-callback`,
//       client_id: process.env.NEXT_PUBLIC_LOGTO_APP_ID ?? "",
//       resource: process.env.LOGTO_API_RESOURCE,
//       code_verifier: codeVerifier,
//     }),
//   });

//   if (!tokenRes.ok) {
//     const body = await tokenRes.text();
//     console.error(
//       "[auth/callback] Token exchange failed:",
//       tokenRes.status,
//       body,
//     );
//     return NextResponse.redirect(
//       new URL("/login?error=token_exchange", appUrl),
//     );
//   }

//   const tokens = await tokenRes.json();
//   console.log(
//     "[auth/callback] token keys:",
//     Object.keys(tokens),
//     "has access_token:",
//     !!tokens.access_token,
//   );

//   // Determine redirect target from state
//   let redirect = "/";
//   try {
//     const parsed = JSON.parse(atob(state ?? ""));
//     redirect = parsed.redirect ?? "/";
//   } catch {}

//   const response = NextResponse.redirect(new URL(redirect, appUrl));

//   // Clear the one-time PKCE verifier cookie
//   response.cookies.delete("pkce_verifier");

//   // Set httpOnly session cookie (access token)
//   // response.cookies.set("logto_session", tokens.access_token, {
//   //   httpOnly: true,
//   //   secure: process.env.NODE_ENV === "production",
//   //   sameSite: "lax",
//   //   maxAge: tokens.expires_in,
//   //   path: "/",
//   // });
//   response.cookies.set("access_token", tokens.access_token, {
//     httpOnly: true,
//     secure: process.env.NODE_ENV === "production",
//     sameSite: "lax",
//     maxAge: tokens.expires_in,
//     path: "/",
//   });

//   // Decode the ID token to extract role (simplified — use jose in production)
//   try {
//     const payload = JSON.parse(
//       Buffer.from(tokens.id_token.split(".")[1], "base64url").toString(),
//     );
//     const role: string =
//       payload?.roles?.[0] ??
//       payload?.["urn:logto:scope:roles"]?.[0] ??
//       "landlord";

//     // httpOnly: true — middleware runs server-side and can read httpOnly cookies.
//     // This prevents client JS from reading/forging the role cookie via XSS.
//     response.cookies.set("user_role", role, {
//       httpOnly: true,
//       secure: process.env.NODE_ENV === "production",
//       sameSite: "lax",
//       maxAge: tokens.expires_in,
//       path: "/",
//     });
//   } catch {}

//   return response;
// }

export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const logtoError = searchParams.get("error");
  if (logtoError || !code) {
    const msg = logtoError ?? "no_code";
    console.error(
      "[auth/callback] Logto error:",
      msg,
      searchParams.get("error_description"),
    );
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(msg)}`, appUrl),
    );
  }

  // ── PKCE verifier ─────────────────────────────────────────────
  const codeVerifier = request.cookies.get("pkce_verifier")?.value;

  console.log(
    "[auth/callback] cookies:",
    request.cookies.getAll().map((c) => c.name),
  );

  if (!codeVerifier) {
    console.error("[auth/callback] Missing PKCE verifier");
    return NextResponse.redirect(
      new URL("/login?error=missing_verifier", appUrl),
    );
  }

  // ── Token exchange ────────────────────────────────────────────
  const tokenRes = await fetch(`${process.env.LOGTO_ENDPOINT}/oidc/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${appUrl}/api/logto/sign-in-callback`, // ✅ FIXED
      client_id: process.env.NEXT_PUBLIC_LOGTO_APP_ID ?? "",
      resource: process.env.NEXT_PUBLIC_LOGTO_API_RESOURCE ?? "", // ✅ FIXED
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    console.error(
      "[auth/callback] Token exchange failed:",
      tokenRes.status,
      body,
    );
    return NextResponse.redirect(
      new URL("/login?error=token_exchange", appUrl),
    );
  }

  const tokens = await tokenRes.json();

  console.log(
    "[auth/callback] access_token preview:",
    tokens.access_token?.slice(0, 20),
  );

  // ── Determine redirect ────────────────────────────────────────
  let redirect = "/";
  try {
    const parsed = JSON.parse(atob(state ?? ""));
    redirect = parsed.redirect ?? "/";
  } catch {}

  const response = NextResponse.redirect(new URL(redirect, appUrl));

  // ── Clear PKCE cookie ─────────────────────────────────────────
  response.cookies.delete("pkce_verifier");

  // ── Store session (CRITICAL) ──────────────────────────────────
  response.cookies.set("logto_session", tokens.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: tokens.expires_in,
    path: "/",
  });

  // ── Extract role ──────────────────────────────────────────────
  try {
    const payload = JSON.parse(atob(tokens.id_token.split(".")[1]));

    const role: string =
      payload?.roles?.[0] ??
      payload?.["urn:logto:scope:roles"]?.[0] ??
      "landlord";

    response.cookies.set("user_role", role, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: tokens.expires_in,
      path: "/",
    });
  } catch (err) {
    console.warn("[auth/callback] Failed to decode id_token");
  }

  return response;
}
