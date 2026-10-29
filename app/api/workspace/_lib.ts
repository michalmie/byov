// Shared helpers for the workspace API (`/api/workspace/*`). Session
// auth via the unchanged lib/auth cookie session; envelopes match the
// versioned API (`{ ok: true, data }` / `{ ok: false, error }`).

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { sessionFromRequest, type SessionPayload } from "@/lib/auth";
import { apiError } from "@/lib/api-response";

/** Signed-in session, or a 401 response. */
export async function requireWorkspaceSession(
  request: NextRequest,
): Promise<SessionPayload | NextResponse> {
  const session = await sessionFromRequest(request);
  if (!session) {
    return apiError(401, "Sign in to manage the workspace.");
  }
  return session;
}

/** Admin session, or a 401/403 response. */
export async function requireWorkspaceAdmin(
  request: NextRequest,
): Promise<SessionPayload | NextResponse> {
  const session = await sessionFromRequest(request);
  if (!session) {
    return apiError(401, "Sign in to manage the workspace.");
  }
  if (session.role !== "admin") {
    return apiError(403, "Only admins can manage this.");
  }
  return session;
}

/** Parse a JSON object body; returns undefined on missing/malformed JSON. */
export async function readJsonBody(
  request: NextRequest,
): Promise<Record<string, unknown> | undefined> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return undefined;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return undefined;
  }
  return body as Record<string, unknown>;
}

function isFailed(
  value: SessionPayload | NextResponse,
): value is NextResponse {
  return value instanceof NextResponse;
}

export { isFailed as isAuthFailure };
