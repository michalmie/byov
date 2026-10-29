/**
 * Control-plane API tokens: issuance, verification and revocation for
 * machine clients (CLI, MCP connector).
 *
 * A token is an opaque bearer secret, `byov_<id>_<secret>`: the `<id>` is
 * a public lookup key (used for listing and revocation), the `<secret>`
 * carries 192 bits of entropy. Only the SHA-256 hash of the full token
 * is stored on disk — the secret itself is shown once at issuance and
 * never again. Crypto uses WebCrypto (same pattern as `lib/auth.ts`);
 * the file store is Node-only and must never be imported from
 * `middleware.ts` (Edge) or client components.
 *
 * Provisioning: the very first token is issued without authentication
 * (fresh-install bootstrap, same trust model as the first-login admin
 * bootstrap in `lib/auth-bootstrap.ts`); once any token record exists,
 * issuance requires a valid token or an admin session.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const API_TOKENS_FILE_NAME = "api-tokens.json";

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

/**
 * Writable server data dir: BYOV_DATA_DIR wins, else the auth data dir
 * (AUTH_DATA_DIR) so single-dir deployments keep one location, else
 * `<cwd>/data` (gitignored).
 */
export function getServerDataDir(): string {
  const configured = (process.env.BYOV_DATA_DIR ?? "").trim();
  if (configured) {
    return configured;
  }
  const authDir = (process.env.AUTH_DATA_DIR ?? "").trim();
  if (authDir) {
    return authDir;
  }
  return join(process.cwd(), "data");
}

export function getApiTokensFilePath(): string {
  return join(getServerDataDir(), API_TOKENS_FILE_NAME);
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
// File store (Node-only)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function parseRecord(entry: unknown): ApiTokenRecord | null {
  if (!isRecord(entry)) {
    return null;
  }
  const { id, name, tokenHash, createdAt, lastUsedAt, revokedAt } = entry;
  if (
    typeof id !== "string" ||
    !isTokenId(id) ||
    typeof name !== "string" ||
    name.length === 0 ||
    typeof tokenHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(tokenHash) ||
    !isIsoDate(createdAt) ||
    (lastUsedAt !== null && !isIsoDate(lastUsedAt)) ||
    (revokedAt !== null && !isIsoDate(revokedAt))
  ) {
    return null;
  }
  return { id, name, tokenHash, createdAt, lastUsedAt, revokedAt };
}

/** All stored records; corrupt entries are skipped, a missing file is []. */
export function readTokenRecords(): ApiTokenRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(getApiTokensFilePath(), "utf8"));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const records: ApiTokenRecord[] = [];
  for (const entry of parsed) {
    const record = parseRecord(entry);
    if (record) {
      records.push(record);
    }
  }
  return records;
}

function writeTokenRecords(records: ApiTokenRecord[]): void {
  mkdirSync(getServerDataDir(), { recursive: true });
  // Owner-only on creation, like a credentials file (same trust as .env).
  writeFileSync(getApiTokensFilePath(), `${JSON.stringify(records)}\n`, {
    mode: 0o600,
  });
}

/** True once any token record exists (closes the first-token bootstrap). */
export function hasAnyTokens(): boolean {
  return readTokenRecords().length > 0;
}

/** Public metadata for every token, oldest first. */
export function listTokenInfos(): ApiTokenInfo[] {
  return readTokenRecords()
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(tokenRecordToInfo);
}

/**
 * Issue a token: mint, store its hash, and return the metadata plus the
 * full secret. The secret is shown only here — it cannot be recovered.
 */
export async function issueToken(name: string): Promise<{
  info: ApiTokenInfo;
  token: string;
}> {
  const records = readTokenRecords();
  const { id, token } = mintToken();
  const record: ApiTokenRecord = {
    id,
    name: name.trim(),
    tokenHash: await hashToken(token),
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  };
  records.push(record);
  writeTokenRecords(records);
  return { info: tokenRecordToInfo(record), token };
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
  const records = readTokenRecords();
  const record = records.find((entry) => entry.id === id);
  if (!record || record.revokedAt) {
    return null;
  }
  const presentedHash = await hashToken(presented);
  if (!timingSafeEqualString(presentedHash, record.tokenHash)) {
    return null;
  }
  record.lastUsedAt = new Date().toISOString();
  try {
    writeTokenRecords(records);
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
export function revokeToken(id: string): ApiTokenInfo | null {
  const records = readTokenRecords();
  const record = records.find((entry) => entry.id === id);
  if (!record) {
    return null;
  }
  if (!record.revokedAt) {
    record.revokedAt = new Date().toISOString();
    writeTokenRecords(records);
  }
  return tokenRecordToInfo(record);
}
