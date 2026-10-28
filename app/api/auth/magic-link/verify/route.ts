import { NextResponse } from "next/server";
import {
  createSession,
  isEmailAllowed,
  isProviderEnabled,
  sanitizeNextPath,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  verifyMagicLinkToken,
} from "@/lib/auth";

/**
 * Consume a magic-link token: sets the `byov_session` cookie and redirects
 * to `next` (or `/`). Failures redirect to /login with a generic error.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const next = sanitizeNextPath(url.searchParams.get("next"));

  const verified = token ? await verifyMagicLinkToken(token) : null;
  if (
    !verified ||
    !isProviderEnabled("magic-link") ||
    !isEmailAllowed(verified.email)
  ) {
    return NextResponse.redirect(new URL("/login?error=not-allowed", url));
  }

  const session = await createSession({
    email: verified.email,
    provider: "magic-link",
  });
  const response = NextResponse.redirect(new URL(next, url));
  response.cookies.set(SESSION_COOKIE_NAME, session, sessionCookieOptions());
  return response;
}
