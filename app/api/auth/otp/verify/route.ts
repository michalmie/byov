import { NextResponse } from "next/server";
import {
  checkRateLimit,
  createSession,
  isEmailAllowed,
  isProviderEnabled,
  isValidEmail,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  verifyOtp,
} from "@/lib/auth";

/** Verify a one-time code; on success sets the `byov_session` cookie. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Expected a JSON body." },
      { status: 400 },
    );
  }
  const { email, code } = (body ?? {}) as {
    email?: unknown;
    code?: unknown;
  };
  if (typeof email !== "string" || !isValidEmail(email)) {
    return NextResponse.json(
      { ok: false, error: "Expected a valid email address." },
      { status: 400 },
    );
  }
  if (typeof code !== "string" || !/^\d{6}$/.test(code.trim())) {
    return NextResponse.json(
      { ok: false, error: "Expected a 6-digit code." },
      { status: 400 },
    );
  }
  const normalized = email.trim().toLowerCase();
  if (!checkRateLimit(`otp-verify:${normalized}`)) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Try again in a minute." },
      { status: 429 },
    );
  }

  // Generic failure either way: never reveal allowlist or method state.
  if (
    !isProviderEnabled("passwordless") ||
    !isEmailAllowed(normalized) ||
    !verifyOtp(normalized, code).ok
  ) {
    return NextResponse.json(
      { ok: false, error: "Invalid or expired code." },
      { status: 401 },
    );
  }

  const token = await createSession({
    email: normalized,
    provider: "passwordless",
  });
  const response = NextResponse.json({
    ok: true,
    user: { email: normalized },
  });
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  return response;
}
