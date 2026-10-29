/**
 * Control-plane API tokens: issuance, verification and revocation for
 * machine clients (CLI, MCP connector).
 *
 * A token is an opaque Bearer [REDACTED], `byov_<id>_<secret>`: the `<id>` is
 * a public lookup key (used for listing and revocation), the `<secret>`
 * carries 192 bits of entropy. Only the SHA-256 hash of the full token
 * is stored in Postgres — the secret itself is shown once at issuance and
 * never again. Crypto uses WebCrypto (same pattern as `lib/auth.ts`);
 * the database store is Node-only and must never be imported from
 * `middleware.ts` (Edge) or client components.
 *
 * Provisioning: the very first token is issued without authentication
 * (fresh-install bootstrap, same trust model as the first-login admin
 * bootstrap in `lib/auth-bootstrap.ts`); once any token record exists,
 * issuance requires a valid token or an admin session.
 */

import { query, queryOne } from "@/lib/db";
import "@/db/migrations/0001_tokens_apps";

/** `byov_` + 12-char id + 32-char secret. */
export const TOKEN_PREFIX = "byov_";
const TOKEN_ID_LENGTH = 12;
const TOKEN_SECRET_BYTES = 24;
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export const MAX_TOKEN_NAME = 60;

/** A stored token record. `tokenHash` is SHA-256 hex of the full token. */
export interface ApiTokenRecord {
  id: string;
  name: string;
  tokenHash: string;
  createdAt: string;
  /** Last successful verification, ISO timestamp or null when unused. */
  lastUsedAt: string | null;
  /** ISO timestamp once revoked; null while active. */
  revokedAt: string | null;
}

/** Token metadata safe to expose over the API (no hash, no secret). */
export interface ApiTokenInfo {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export function tokenRecordToInfo(record: ApiTokenRecord): ApiTokenInfo {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
    revokedAt: record.revokedAt,
  };
}

// ---------------------------------------------------------------------------
// Token minting, parsing and hashing (Edge-safe: WebCrypto only)
// ---------------------------------------------------------------------------

function randomId(): string {
  const bytes = new Uint8Array(TOKEN_ID_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ID_ALPHABET[byte % ID_ALPHABET.length]).join(
    "",
  );
}

function randomSecret(): string {
  const bytes = new Uint8Array(TOKEN_SECRET_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/** Mint a fresh token. Returns the public id and the full secret. */
export function mintToken(): { id: string; token: string } {
  const id = randomId();
  return { id, token: `${TOKEN_PREFIX}${id}_${randomSecret()}` };
}

function isTokenId(value: string): boolean {
  return (
    value.length === TOKEN_ID_LENGTH &&
    [...value].every((char) => ID_ALPHABET.includes(char))
  );
}

/** The public lookup id inside a presented token, or null when malformed. */
export function parseTokenId(presented: string): string | null {
  const value = presented.trim();
  if (!value.startsWith(TOKEN_PREFIX)) {
    return null;
  }
  const rest = value.slice(TOKEN_PREFIX.length);
  const separator = rest.indexOf("_");
  if (separator === -1) {
    return null;
  }
  const id = rest.slice(0, separator);
  const secret = rest.slice(separator + 1);
  if (!isTokenId(id) || secret.length === 0) {
    return null;
  }
  return id;
}

/** SHA-256 hex digest of the full presented token (the stored form). */
export async function hashToken(presented: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(presented.trim()),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Length-sensitive constant-time string comparison (Edge-safe). */
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

/** Token display name rules; null when valid, else the error message. */
export function validateTokenName(name: unknown): string | null {
  if (typeof name !== "string" || name.trim().length === 0) {
    return "Give the token a name.";
  }
  if (name.trim().length > MAX_TOKEN_NAME) {
    return `Keep the name under ${MAX_TOKEN_NAME} characters.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Postgres store (Node-only)
// ---------------------------------------------------------------------------

/** One `api_tokens` row. `pg` returns TIMESTAMPTZ columns as Dates. */
interface ApiTokenRow {
  id: string;
  name: string;
  tokenHash: string;
  createdAt: Date | string;
  lastUsedAt: Date | string | null;
  revokedAt: Date | string | null;
}

const TOKEN_COLUMNS = `id, name, token_hash AS "tokenHash", created_at AS "createdAt", last_used_at AS "lastUsedAt", revoked_at AS "revokedAt"`;

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function optionalIsoString(value: Date | string | null): string | null {
  return value === null ? null : toIsoString(value);
}

function rowToRecord(row: ApiTokenRow): ApiTokenRecord {
  return {
    id: row.id,
    name: row.name,
    tokenHash: row.tokenHash,
    createdAt: toIsoString(row.createdAt),
    lastUsedAt: optionalIsoString(row.lastUsedAt),
    revokedAt: optionalIsoString(row.revokedAt),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

/** All stored records, oldest first. */
export async function readTokenRecords(): Promise<ApiTokenRecord[]> {
  const rows = await query<ApiTokenRow>(
    `SELECT ${TOKEN_COLUMNS} FROM api_tokens ORDER BY created_at ASC, id ASC`,
  );
  return rows.map(rowToRecord);
}

/** True once any token record exists (closes the first-token bootstrap). */
export async function hasAnyTokens(): Promise<boolean> {
  const row = await queryOne<{ one: number }>(
    "SELECT 1 AS one FROM api_tokens LIMIT 1",
  );
  return row !== null;
}

/** Public metadata for every token, oldest first. */
export async function listTokenInfos(): Promise<ApiTokenInfo[]> {
  const records = await readTokenRecords();
  return records.map(tokenRecordToInfo);
}

/**
 * Issue a token: mint, store its hash, and return the metadata plus the
 * full secret. The secret is shown only here — it cannot be recovered.
 */
export async function issueToken(name: string): Promise<{
  info: ApiTokenInfo;
  token: string;
}> {
  const trimmed = name.trim();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { id, token } = mintToken();
    const record: ApiTokenRecord = {
      id,
      name: trimmed,
      tokenHash: await hashToken(token),
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      revokedAt: null,
    };
    try {
      await query(
        "INSERT INTO api_tokens (id, name, token_hash, created_at) VALUES ($1, $2, $3, $4)",
        [record.id, record.name, record.tokenHash, record.createdAt],
      );
    } catch (error) {
      // A minted id colliding with an existing row is vanishingly rare;
      // mint again rather than failing issuance.
      if (isUniqueViolation(error) && attempt < 2) {
        continue;
      }
      throw error;
    }
    return { info: tokenRecordToInfo(record), token };
  }
  throw new Error("[api-tokens] could not mint a unique token id");
}

/**
 * Verify a presented token. Returns the token metadata on success and
 * records the use; null when malformed, unknown, revoked, or mismatched.
 */
export async function verifyToken(
  presented: string,
): Promise<ApiTokenInfo | null> {
  const id = parseTokenId(presented);
  if (!id) {
    return null;
  }
  const row = await queryOne<ApiTokenRow>(
    `SELECT ${TOKEN_COLUMNS} FROM api_tokens WHERE id = $1`,
    [id],
  );
  if (!row) {
    return null;
  }
  const record = rowToRecord(row);
  if (record.revokedAt) {
    return null;
  }
  const presentedHash = await hashToken(presented);
  if (!timingSafeEqualString(presentedHash, record.tokenHash)) {
    return null;
  }
  record.lastUsedAt = new Date().toISOString();
  try {
    await query("UPDATE api_tokens SET last_used_at = $1 WHERE id = $2", [
      record.lastUsedAt,
      id,
    ]);
  } catch {
    // The token is valid; a failed use-stamp must not fail the call.
  }
  return tokenRecordToInfo(record);
}

/**
 * Revoke a token by id. The record is kept with `revokedAt` set so the
 * list stays auditable. Returns the metadata, or null when unknown.
 * Revoking an already-revoked token is a no-op returning its metadata.
 */
export async function revokeToken(id: string): Promise<ApiTokenInfo | null> {
  const row = await queryOne<ApiTokenRow>(
    `SELECT ${TOKEN_COLUMNS} FROM api_tokens WHERE id = $1`,
    [id],
  );
  if (!row) {
    return null;
  }
  const record = rowToRecord(row);
  if (!record.revokedAt) {
    record.revokedAt = new Date().toISOString();
    await query("UPDATE api_tokens SET revoked_at = $1 WHERE id = $2", [
      record.revokedAt,
      id,
    ]);
  }
  return tokenRecordToInfo(record);
}
