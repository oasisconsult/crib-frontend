// import { NextRequest, NextResponse } from "next/server";

// const PUBLIC_ROUTES = [
//   "/login",
//   "/signup",
//   "/api/auth",
//   "/api/logto", // Logto SDK auth routes (sign-in, callback, sign-out)
//   "/_next",
//   "/favicon.ico",
// ];

// const TENANT_ONLY_ROUTES = ["/portal"];
// const ADMIN_ONLY_ROUTES = ["/admin"];

// function isPublic(pathname: string) {
//   return PUBLIC_ROUTES.some((r) => pathname.startsWith(r));
// }

// // Onboarding token routes are always public
// function isOnboardingRoute(pathname: string) {
//   return pathname.startsWith("/onboarding/");
// }

// export function middleware(request: NextRequest) {
//   const { pathname } = request.nextUrl;

//   if (isPublic(pathname) || isOnboardingRoute(pathname)) {
//     return NextResponse.next();
//   }

//   // In mock/dev mode the dev-login route sets a fake session cookie.
//   // Skip the Logto session check entirely — the cookie just needs to exist.
//   const isMockMode = process.env.NEXT_PUBLIC_MOCK_API === "true";

//   // Check for session token. Accept any of:
//   //  • logto_session  — compat cookie set by /api/logto/sign-in-callback
//   //  • __session      — legacy alias
//   //  • logto:<appId>  — encrypted session cookie written directly by the Logto SDK
//   const sdkCookieKey = `logto:${process.env.NEXT_PUBLIC_LOGTO_APP_ID ?? ""}`;
//   const sessionToken =
//     request.cookies.get("logto_session")?.value ||
//     request.cookies.get("__session")?.value ||
//     request.cookies.get(sdkCookieKey)?.value;

//   if (!isMockMode && !sessionToken) {
//     const loginUrl = new URL("/login", request.url);
//     loginUrl.searchParams.set("redirect", pathname);
//     return NextResponse.redirect(loginUrl);
//   }

//   // In mock mode with no session yet, redirect to login so user picks a dev account
//   if (isMockMode && !sessionToken) {
//     const loginUrl = new URL("/login", request.url);
//     loginUrl.searchParams.set("redirect", pathname);
//     return NextResponse.redirect(loginUrl);
//   }

//   // Role-based route guards — roles are embedded in the JWT claims
//   // In production, decode the JWT here; for now use a role cookie set by the
//   // callback handler after token exchange.
//   const roleCookie = request.cookies.get("user_role")?.value ?? "";

//   if (ADMIN_ONLY_ROUTES.some((r) => pathname.startsWith(r))) {
//     if (roleCookie !== "superadmin") {
//       return NextResponse.redirect(new URL("/", request.url));
//     }
//   }

//   if (TENANT_ONLY_ROUTES.some((r) => pathname.startsWith(r))) {
//     if (roleCookie !== "tenant") {
//       return NextResponse.redirect(new URL("/", request.url));
//     }
//   }

//   return NextResponse.next();
// }

// export const config = {
//   matcher: [
//     "/((?!_next/static|_next/image|favicon.ico|icons|images|fonts).*)",
//   ],
// };

import { NextRequest, NextResponse } from "next/server";

const PUBLIC_ROUTES = [
  "/login",
  "/signup",
  "/api/auth",
  "/api/logto",
  "/_next",
  "/favicon.ico",
];

function isPublic(pathname: string) {
  return PUBLIC_ROUTES.some((r) => pathname.startsWith(r));
}

function isOnboardingRoute(pathname: string) {
  return pathname.startsWith("/onboarding/");
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname) || isOnboardingRoute(pathname)) {
    return NextResponse.next();
  }

  // ✅ DO NOT CHECK LOGTO SESSION HERE

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|images|fonts).*)"],
};
