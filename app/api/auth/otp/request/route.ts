import { NextResponse } from "next/server";
import {
  checkRateLimit,
  isEmailAllowed,
  isProviderEnabled,
  isValidEmail,
  issueOtp,
} from "@/lib/auth";
import { otpEmail, sendMail } from "@/lib/auth-mail";

/**
 * Request a one-time sign-in code. Always answers `{ok:true}` so the
 * response never reveals whether an email is on the access list.
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
  const { email } = (body ?? {}) as { email?: unknown };
  if (typeof email !== "string" || !isValidEmail(email)) {
    return NextResponse.json(
      { ok: false, error: "Expected a valid email address." },
      { status: 400 },
    );
  }
  const normalized = email.trim().toLowerCase();
  if (!checkRateLimit(`otp-request:${normalized}`)) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Try again in a minute." },
      { status: 429 },
    );
  }

  if (isProviderEnabled("passwordless") && isEmailAllowed(normalized)) {
    const { code } = issueOtp(normalized);
    const mail = otpEmail(code);
    try {
      await sendMail({ to: normalized, subject: mail.subject, text: mail.text });
    } catch {
      return NextResponse.json(
        { ok: false, error: "Could not send the code. Try again later." },
        { status: 500 },
      );
    }
  }
  return NextResponse.json({ ok: true });
}
