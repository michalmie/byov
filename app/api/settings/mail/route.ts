import { NextRequest, NextResponse } from "next/server";
import { sessionFromRequest, type SessionPayload } from "@/lib/auth";
import {
  clearStoredMailAccount,
  DEFAULT_SMTP_PORT,
  getMailAccountStatus,
  getStoredMailAccount,
  saveStoredMailAccount,
  validateMailAccount,
  type StoredMailAccount,
} from "@/lib/mail-config";

/** Verified admin session, or an error response (401 signed out, 403 member). */
async function requireAdmin(
  request: NextRequest,
): Promise<SessionPayload | NextResponse> {
  const session = await sessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Sign in to manage the sending account." },
      { status: 401 },
    );
  }
  if (session.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "Only admins can manage the sending account." },
      { status: 403 },
    );
  }
  return session;
}

/** Current sending-account status (never includes the password). */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) {
    return admin;
  }
  return NextResponse.json({ ok: true, status: await getMailAccountStatus() });
}

function asDraft(body: unknown): {
  host?: unknown;
  port?: unknown;
  security?: unknown;
  user?: unknown;
  pass?: unknown;
  from?: unknown;
} {
  return (body ?? {}) as {
    host?: unknown;
    port?: unknown;
    security?: unknown;
    user?: unknown;
    pass?: unknown;
    from?: unknown;
  };
}

/**
 * Save the sending account. A blank password keeps the saved one (when
 * one is saved); anything else replaces the whole record.
 */
export async function PUT(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) {
    return admin;
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
  const draft = asDraft(body);
  const stored = await getStoredMailAccount();
  const normalized = {
    host: typeof draft.host === "string" ? draft.host : "",
    port: (draft.port ?? DEFAULT_SMTP_PORT) as number,
    security: typeof draft.security === "string" ? draft.security : "auto",
    user: typeof draft.user === "string" ? draft.user : "",
    pass:
      typeof draft.pass === "string" && draft.pass
        ? draft.pass
        : (stored?.pass ?? ""),
    from: typeof draft.from === "string" ? draft.from : "",
  };
  const errors = validateMailAccount(normalized);
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 400 });
  }
  const account: StoredMailAccount = {
    host: normalized.host.trim(),
    port: normalized.port,
    security: normalized.security as StoredMailAccount["security"],
    user: normalized.user.trim(),
    pass: normalized.pass,
    from: normalized.from.trim(),
  };
  try {
    await saveStoredMailAccount(account);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not save the sending account." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, status: await getMailAccountStatus() });
}

/** Clear the Settings-saved account (falls back to SMTP_* env). */
export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) {
    return admin;
  }
  try {
    await clearStoredMailAccount();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not clear the sending account." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, status: await getMailAccountStatus() });
}
