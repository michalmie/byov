/**
 * Database-backed auth stores: one-time codes and rate limiting.
 *
 * This module owns the `auth_otps` and `auth_rate_limits` tables (see
 * `db/migrations/0002_auth_mail.ts`). Semantics match the previous
 * in-memory stores exactly: 6-digit codes with a 10-minute TTL and 5
 * attempts before lockout, and 5 hits per key per rolling minute with
 * old-hit pruning.
 *
 * Node-only (imports `pg` via `@/lib/db`): never import from
 * `middleware.ts` (Edge) or client components. `lib/auth.ts` stays
 * Edge-safe and keeps the sessions, allowlist, roles and magic-link
 * helpers; only the OTP/rate-limit functions live here.
 */

import "../db/migrations/0002_auth_mail";
import { query, queryOne } from "./db";

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_HITS = 5;

/** Length-sensitive constant-time string comparison. */
function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function randomDigits(length: number): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => String(byte % 10)).join("");
}

/** Returns true when the hit is allowed (and records it), false when capped. */
export async function checkRateLimit(key: string): Promise<boolean> {
  const now = Date.now();
  const cutoff = new Date(now - RATE_LIMIT_WINDOW_MS).toISOString();
  await query(
    "DELETE FROM auth_rate_limits WHERE rate_key = $1 AND hit_at <= $2",
    [key, cutoff],
  );
  const row = await queryOne<{ count: string | number }>(
    "SELECT COUNT(*) AS count FROM auth_rate_limits WHERE rate_key = $1 AND hit_at > $2",
    [key, cutoff],
  );
  if (Number(row?.count ?? 0) >= RATE_LIMIT_MAX_HITS) {
    return false;
  }
  await query("INSERT INTO auth_rate_limits (rate_key, hit_at) VALUES ($1, $2)", [
    key,
    new Date(now).toISOString(),
  ]);
  return true;
}

export async function issueOtp(
  email: string,
  options?: { ttlMs?: number },
): Promise<{ code: string; expiresAt: number }> {
  const key = email.trim().toLowerCase();
  const code = randomDigits(6);
  const expiresAt = Date.now() + (options?.ttlMs ?? OTP_TTL_MS);
  await query(
    "INSERT INTO auth_otps (email, code, expires_at, attempts) VALUES ($1, $2, $3, 0) " +
      "ON CONFLICT (email) DO UPDATE SET code = EXCLUDED.code, expires_at = EXCLUDED.expires_at, attempts = 0",
    [key, code, new Date(expiresAt).toISOString()],
  );
  return { code, expiresAt };
}

export type OtpVerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "expired" | "locked" | "mismatch" };

interface OtpRow {
  code: string;
  expires_at: string;
  attempts: number;
}

export async function verifyOtp(
  email: string,
  code: string,
): Promise<OtpVerifyResult> {
  const key = email.trim().toLowerCase();
  const entry = await queryOne<OtpRow>(
    "SELECT code, expires_at, attempts FROM auth_otps WHERE email = $1",
    [key],
  );
  if (!entry) {
    return { ok: false, reason: "missing" };
  }
  if (new Date(entry.expires_at).getTime() <= Date.now()) {
    await query("DELETE FROM auth_otps WHERE email = $1", [key]);
    return { ok: false, reason: "expired" };
  }
  if (entry.attempts >= OTP_MAX_ATTEMPTS) {
    await query("DELETE FROM auth_otps WHERE email = $1", [key]);
    return { ok: false, reason: "locked" };
  }
  if (!timingSafeEqualString(code.trim(), entry.code)) {
    const updated = await queryOne<{ attempts: number }>(
      "UPDATE auth_otps SET attempts = attempts + 1 WHERE email = $1 RETURNING attempts",
      [key],
    );
    const attempts = updated?.attempts ?? entry.attempts + 1;
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await query("DELETE FROM auth_otps WHERE email = $1", [key]);
      return { ok: false, reason: "locked" };
    }
    return { ok: false, reason: "mismatch" };
  }
  await query("DELETE FROM auth_otps WHERE email = $1", [key]);
  return { ok: true };
}
