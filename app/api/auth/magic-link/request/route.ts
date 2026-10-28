import { NextResponse } from "next/server";
import {
  checkRateLimit,
  isEmailAllowed,
  isProviderEnabled,
  isValidEmail,
  issueMagicLinkToken,
  sanitizeNextPath,
} from "@/lib/auth";
import { magicLinkEmail, sendMail } from "@/lib/auth-mail";

/**
 * Request a magic sign-in link. Always answers `{ok:true}` so the response
 * never reveals whether an email is on the access list.
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
  if (!checkRateLimit(`magic-link-request:${normalized}`)) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Try again in a minute." },
      { status: 429 },
    );
  }

  if (isProviderEnabled("magic-link") && isEmailAllowed(normalized)) {
    const token = await issueMagicLinkToken(normalized);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
    const origin = siteUrl || new URL(request.url).origin;
    const link =
      `${origin}/api/auth/magic-link/verify` +
      `?token=${encodeURIComponent(token)}` +
      `&next=${encodeURIComponent(sanitizeNextPath(next))}`;
    const mail = magicLinkEmail(link);
    try {
      await sendMail({ to: normalized, subject: mail.subject, text: mail.text });
    } catch {
      return NextResponse.json(
        { ok: false, error: "Could not send the link. Try again later." },
        { status: 500 },
      );
    }
  }
  return NextResponse.json({ ok: true });
}
