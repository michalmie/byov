import { NextResponse } from "next/server";
import {
  createSession,
  isEmailAllowed,
  isProviderEnabled,
  resolveRequestOrigin,
  sanitizeNextPath,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  verifyMagicLinkToken,
} from "@/lib/auth";
import { resolveLoginRole } from "@/lib/auth-bootstrap";

/**
 * Consume a magic-link token: sets the `byov_session` cookie and redirects
 * to `next` (or `/`). Failures redirect to /login with a generic error.
 * Redirects use the public origin (see `resolveRequestOrigin`): behind a
 * proxy `request.url` is the internal listen address (e.g. 0.0.0.0:3014),
 * which browsers refuse to open.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const next = sanitizeNextPath(url.searchParams.get("next"));
  const origin = resolveRequestOrigin(request);

  const verified = token ? await verifyMagicLinkToken(token) : null;
  if (
    !verified ||
    !isProviderEnabled("magic-link") ||
    !isEmailAllowed(verified.email)
  ) {
    return NextResponse.redirect(new URL("/login?error=not-allowed", origin));
  }

  const session = await createSession({
    email: verified.email,
    provider: "magic-link",
    role: await resolveLoginRole(verified.email),
  });
  const response = NextResponse.redirect(new URL(next, origin));
  response.cookies.set(SESSION_COOKIE_NAME, session, sessionCookieOptions(request));
  return response;
}
