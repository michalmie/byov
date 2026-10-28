/**
 * Route protection: every route requires a valid `byov_session` cookie
 * except the public paths below. Pages redirect to /login?next=<path>;
 * /api/* routes get a 401 JSON response. Authenticated requests carry the
 * verified email and role downstream as headers.
 */
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";

export const USER_EMAIL_HEADER = "x-byov-user-email";
export const USER_ROLE_HEADER = "x-byov-user-role";

/** Public paths that never require a session. */
export function isPublicPath(pathname: string): boolean {
  if (pathname === "/login" || pathname.startsWith("/login/")) {
    return true;
  }
  if (pathname === "/auth" || pathname.startsWith("/auth/")) {
    return true;
  }
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) {
    return true;
  }
  if (pathname.startsWith("/_next/")) {
    return true;
  }
  if (pathname === "/favicon.ico") {
    return true;
  }
  // Static assets: favicon/icon/fonts and any file with an extension.
  const lastSegment = pathname.split("/").pop() ?? "";
  if (lastSegment.includes(".")) {
    return true;
  }
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  if (session) {
    const response = NextResponse.next();
    response.headers.set(USER_EMAIL_HEADER, session.email);
    response.headers.set(USER_ROLE_HEADER, session.role);
    // Pages can read the login state server-side from the cookie; the
    // headers are the cheap verified-identity handoff to route handlers.
    return response;
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
