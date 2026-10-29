/**
 * Authentication for the versioned control-plane API (`/api/v1/*`).
 *
 * Machine clients present a token as `Authorization: Bearer <token>`.
 * Browser callers may use their session cookie instead (the middleware
 * passes `/api/v1/*` through; these helpers verify the session here).
 * Token management additionally requires admin power: a token (all
 * slice-1 tokens are full-access) or an admin session.
 *
 * Node-only (token verification reads the data dir): never import from
 * `middleware.ts` (Edge) or client components.
 */

import type { NextResponse } from "next/server";
import {
  sessionFromRequest,
  type CookieRequest,
  type UserRole,
} from "./auth";
import { verifyToken, type ApiTokenInfo } from "./api-tokens";
import { apiError, apiUnauthorized } from "./api-response";

export type ApiAuth =
  | { kind: "token"; token: ApiTokenInfo }
  | { kind: "session"; email: string; role: UserRole };

/** Requests carrying either an Authorization header or cookies. */
export interface ApiRequest extends CookieRequest {
  headers: { get(name: string): string | null };
}

function bearerToken(request: ApiRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header) {
    return null;
  }
  const match = /^Bearer (.+)$/.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * Authenticate a `/api/v1/*` request: Bearer token first, then the
 * session cookie. Returns null when neither verifies.
 */
export async function authenticateApiRequest(
  request: ApiRequest,
): Promise<ApiAuth | null> {
  const presented = bearerToken(request);
  if (presented) {
    const token = await verifyToken(presented);
    return token ? { kind: "token", token } : null;
  }
  const session = await sessionFromRequest(request);
  return session
    ? { kind: "session", email: session.email, role: session.role }
    : null;
}

/** Authenticated caller, or a 401 response. */
export async function requireApiAuth(
  request: ApiRequest,
): Promise<ApiAuth | NextResponse> {
  const auth = await authenticateApiRequest(request);
  return auth ?? apiUnauthorized();
}

/**
 * Token-management power: any valid token, or an admin session.
 * Answers 401 when signed out, 403 for a non-admin session.
 */
export async function requireTokenManager(
  request: ApiRequest,
): Promise<ApiAuth | NextResponse> {
  const auth = await authenticateApiRequest(request);
  if (!auth) {
    return apiUnauthorized();
  }
  if (auth.kind === "session" && auth.role !== "admin") {
    return apiError(403, "Only admins can manage API tokens.");
  }
  return auth;
}
