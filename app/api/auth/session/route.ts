import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  sessionToUser,
  verifySession,
} from "@/lib/auth";

/** Current session user, or `{user:null}` when signed out. */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  return NextResponse.json({
    user: session ? sessionToUser(session) : null,
  });
}

/** Sign out: clears the `byov_session` cookie. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
