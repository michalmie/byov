/**
 * Shared JSON envelope for the versioned control-plane API (`/api/v1/*`).
 * Success is always `{ ok: true, data }`; every error is
 * `{ ok: false, error }` with an optional `errors` map for per-field
 * validation failures.
 */

import { NextResponse } from "next/server";

/** 200 (or the given status) with `{ ok: true, data }`. */
export function apiOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

/** Error response with `{ ok: false, error }` plus optional extras. */
export function apiError(
  status: number,
  error: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

/** 401 for missing or invalid credentials. */
export function apiUnauthorized(): NextResponse {
  return apiError(401, "Missing or invalid API token.");
}

/** 400 for a missing or malformed JSON body. */
export function apiBadJson(): NextResponse {
  return apiError(400, "Expected a JSON body.");
}
