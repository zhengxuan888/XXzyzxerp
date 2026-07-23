import { NextRequest, NextResponse } from "next/server";
import { parseSessionFromToken } from "@/lib/auth";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/api/auth/login",
  "/api/health",
  "/api/healthz",
  "/_next/",
  "/favicon.ico",
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get("erpv2_session")?.value || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const session = await parseSessionFromToken(sessionToken);
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("returnUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", session.userId);
  if (session.activeMembershipId) {
    requestHeaders.set("x-membership-id", session.activeMembershipId);
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.png$|.*\\.svg$|.*\\.ico$).*)"],
};
