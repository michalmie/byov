import { NextResponse } from "next/server";
import {
  isEmailAllowed,
  isProviderEnabled,
  isValidEmail,
  issueMagicLinkToken,
  resolveRequestOrigin,
  sanitizeNextPath,
} from "@/lib/auth";
import { checkRateLimit, issueOtp } from "@/lib/auth-store";
import { sendMail, signInEmail } from "@/lib/auth-mail";

/**
 * Request sign-in by email: one message carrying both the sign-in link
 * and the one-time code (whichever methods are enabled). Always answers
 * `{ok:true}` so the response never reveals whether an email is on the
 * access list.
 */
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
  const { email, next } = (body ?? {}) as {
    email?: unknown;
    next?: unknown;
  };
  if (typeof email !== "string" || !isValidEmail(email)) {
    return NextResponse.json(
      { ok: false, error: "Expected a valid email address." },
      { status: 400 },
    );
  }
  const normalized = email.trim().toLowerCase();
  if (!(await checkRateLimit(`magic-link-request:${normalized}`))) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Try again in a minute." },
      { status: 429 },
    );
  }

  if (isProviderEnabled("magic-link") && isEmailAllowed(normalized)) {
    const token = await issueMagicLinkToken(normalized);
    const link =
      `${resolveRequestOrigin(request)}/api/auth/magic-link/verify` +
      `?token=${encodeURIComponent(token)}` +
      `&next=${encodeURIComponent(sanitizeNextPath(next))}`;
    const code = isProviderEnabled("passwordless")
      ? (await issueOtp(normalized)).code
      : undefined;
    const mail = signInEmail({ code, link });
    try {
      await sendMail({
        to: normalized,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
    } catch {
      return NextResponse.json(
        { ok: false, error: "Could not send the sign-in email. Try again later." },
        { status: 500 },
      );
    }
  }
  return NextResponse.json({ ok: true });
}
