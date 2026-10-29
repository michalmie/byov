import { NextRequest, NextResponse } from "next/server";
import { isValidEmail, sessionFromRequest } from "@/lib/auth";
import { checkRateLimit } from "@/lib/auth-store";
import { getMailAccountStatus } from "@/lib/mail-config";
import { sendMail, testEmailHtml } from "@/lib/auth-mail";

/**
 * Send a test email through the default sending account (admin-only).
 * Returns the provider error when delivery fails so admins can debug
 * the account; the response never carries account secrets.
 */
export async function POST(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Sign in to send a test email." },
      { status: 401 },
    );
  }
  if (session.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "Only admins can send a test email." },
      { status: 403 },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Expected a JSON body." },
      { status: 400 },
    );
  }
  const { to } = (body ?? {}) as { to?: unknown };
  if (typeof to !== "string" || !isValidEmail(to)) {
    return NextResponse.json(
      { ok: false, error: "Expected a valid recipient address." },
      { status: 400 },
    );
  }
  if (!(await checkRateLimit(`mail-test:${session.email}`))) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Try again in a minute." },
      { status: 429 },
    );
  }
  const status = await getMailAccountStatus();
  if (!status.configured) {
    return NextResponse.json(
      {
        ok: false,
        error: "No sending account configured — save one first.",
      },
      { status: 400 },
    );
  }
  try {
    const accountLabel =
      status.source === "settings" ? "Settings-saved" : "server";
    await sendMail({
      to: to.trim(),
      subject: "BYOV test email",
      text:
        `This test email was sent from your BYOV workspace ` +
        `(${accountLabel} sending account). ` +
        `If you received it, notifications will reach your users.`,
      html: testEmailHtml(accountLabel),
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message.slice(0, 300)
        : "Delivery failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
