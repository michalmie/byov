/**
 * Passwordless auth core: server sessions, email allowlist, rate limiting,
 * one-time codes and magic-link tokens.
 *
 * This module is imported by `middleware.ts`, so it must stay Edge-safe:
 * Web Crypto only, no `node:*` imports, no `Buffer`. All env vars are read
 * lazily inside functions (never cached at module load) so tests and
 * serverless instances always see the current configuration.
 */

export type AuthProviderId =
  | "passwordless"
  | "magic-link"
  | "entra"
  | "github"
  | "google"
  | "apple";

export type UserRole = "admin" | "member";

export interface SessionPayload {
  sub: string;
  email: string;
  name?: string;
  provider: AuthProviderId;
  role: UserRole;
  iat: number;
  exp: number;
}

export interface AuthUser {
  email: string;
  name: string | null;
  provider: AuthProviderId;
  role: UserRole;
}

export interface AuthProviderInfo {
  id: AuthProviderId;
  label: string;
  enabled: boolean;
}

export const SESSION_COOKIE_NAME = "byov_session";
/** 12 hours, in seconds. */
export const SESSION_MAX_AGE_SECONDS = 43200;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const MAGIC_LINK_TTL_SECONDS = 10 * 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_HITS = 5;

const DEV_FALLBACK_SECRET = "dev-only-insecure-secret";

let warnedInsecureSecret = false;
let warnedOpenAllowlist = false;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function subtleCrypto(): SubtleCrypto {
  const cryptoRef = globalThis.crypto as Crypto | undefined;
  if (!cryptoRef?.subtle) {
    throw new Error("WebCrypto (crypto.subtle) is not available.");
  }
  return cryptoRef.subtle;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeJsonBase64Url(value: unknown): string {
  const json = JSON.stringify(value);
  return bytesToBase64Url(new TextEncoder().encode(json));
}

function decodeJsonBase64Url<T>(input: string): T | null {
  try {
    const json = new TextDecoder().decode(base64UrlToBytes(input));
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

async function hmacSha256Base64Url(
  secret: string,
  data: string,
): Promise<string> {
  const key = await subtleCrypto().importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await subtleCrypto().sign(
    "HMAC",
    key,
    new TextEncoder().encode(data),
  );
  return bytesToBase64Url(new Uint8Array(signature));
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

function randomDigits(length: number): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => String(byte % 10)).join("");
}

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function readSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret) {
    return secret;
  }
  if (!warnedInsecureSecret) {
    warnedInsecureSecret = true;
    console.warn(
      "[auth] AUTH_SECRET is not set; using an insecure dev-only fallback secret.",
    );
  }
  return DEV_FALLBACK_SECRET;
}

function parseList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

// ---------------------------------------------------------------------------
// Email allowlist
// ---------------------------------------------------------------------------

/**
 * Contract order: exact-email match wins, then domain match, then an
 * empty-everywhere dev default that allows with a warning, otherwise deny.
 */
export function isEmailAllowed(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const allowedEmails = parseList(process.env.AUTH_ALLOWED_EMAILS);
  const allowedDomains = parseList(process.env.AUTH_ALLOWED_DOMAINS);

  if (allowedEmails.length > 0 && allowedEmails.includes(normalized)) {
    return true;
  }
  const domain = normalized.split("@")[1] ?? "";
  if (
    allowedDomains.length > 0 &&
    domain.length > 0 &&
    allowedDomains.includes(domain)
  ) {
    return true;
  }
  if (allowedEmails.length === 0 && allowedDomains.length === 0) {
    if (!warnedOpenAllowlist) {
      warnedOpenAllowlist = true;
      console.warn(
        "[auth] AUTH_ALLOWED_EMAILS and AUTH_ALLOWED_DOMAINS are both empty; allowing all emails (dev default).",
      );
    }
    return true;
  }
  return false;
}

export function isValidEmail(email: string): boolean {
  const normalized = email.trim();
  if (normalized.length === 0 || normalized.length > 254) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

// ---------------------------------------------------------------------------
// Roles: configured admins plus the first-login bootstrap claim
// ---------------------------------------------------------------------------

/** Lowercased admin emails from AUTH_ADMIN_EMAILS (may be empty). */
export function getAdminEmails(): string[] {
  return parseList(process.env.AUTH_ADMIN_EMAILS);
}

export function isAdminEmail(
  email: string,
  adminEmails: readonly string[] = getAdminEmails(),
): boolean {
  return adminEmails.includes(email.trim().toLowerCase());
}

export interface RoleResolution {
  adminEmails: readonly string[];
  /** Email holding the bootstrap claim, or null when unclaimed. */
  bootstrapEmail: string | null;
}

/**
 * Pure role decision: configured admins and the bootstrap holder are
 * admins, everyone else is a member. Reading and claiming the bootstrap
 * record is file I/O and lives in `lib/auth-bootstrap.ts` (Node-only).
 */
export function resolveRole(email: string, input: RoleResolution): UserRole {
  const normalized = email.trim().toLowerCase();
  if (input.adminEmails.includes(normalized)) {
    return "admin";
  }
  if (input.bootstrapEmail && input.bootstrapEmail === normalized) {
    return "admin";
  }
  return "member";
}

// ---------------------------------------------------------------------------
// Sessions (`byov_session` cookie value)
// ---------------------------------------------------------------------------

/**
 * `<base64url(payloadJSON)>.<base64url(hmacSigBytes)>`.
 * `sub` defaults to the email (passwordless); OAuth passes the provider's
 * subject. `role` defaults to member (fail closed); login routes pass the
 * resolved role. This is the single canonical session signer —
 * `lib/auth-oauth.ts` delegates to it.
 */
export async function createSession(input: {
  email: string;
  provider: AuthProviderId;
  name?: string;
  ttlSec?: number;
  sub?: string;
  role?: UserRole;
}): Promise<string> {
  const email = input.email.trim().toLowerCase();
  const nowSec = Math.floor(Date.now() / 1000);
  const ttlSec = input.ttlSec ?? SESSION_MAX_AGE_SECONDS;
  const payload: SessionPayload = {
    sub: input.sub ?? email,
    email,
    provider: input.provider,
    role: input.role ?? "member",
    iat: nowSec,
    exp: nowSec + ttlSec,
    ...(input.name ? { name: input.name } : {}),
  };
  const encoded = encodeJsonBase64Url(payload);
  const signature = await hmacSha256Base64Url(readSecret(), encoded);
  return `${encoded}.${signature}`;
}

export async function verifySession(
  token: string,
): Promise<SessionPayload | null> {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) {
    return null;
  }
  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = await hmacSha256Base64Url(readSecret(), encoded);
  if (!timingSafeEqualString(signature, expected)) {
    return null;
  }
  const payload = decodeJsonBase64Url<SessionPayload>(encoded);
  if (
    !payload ||
    typeof payload.email !== "string" ||
    typeof payload.provider !== "string" ||
    typeof payload.exp !== "number" ||
    typeof payload.iat !== "number"
  ) {
    return null;
  }
  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }
  // Sessions minted before roles existed carry no role; fail closed.
  return {
    ...payload,
    role: payload.role === "admin" ? "admin" : "member",
  };
}

export function sessionToUser(payload: SessionPayload): AuthUser {
  return {
    email: payload.email,
    name: payload.name ?? null,
    provider: payload.provider,
    role: payload.role,
  };
}

/** Minimal cookie reader surface; NextRequest satisfies this. */
export interface CookieRequest {
  cookies: {
    get(name: string): { value: string } | undefined;
  };
}

/** Verified session from the request cookies, or null when signed out. */
export async function sessionFromRequest(
  request: CookieRequest,
): Promise<SessionPayload | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return token ? verifySession(token) : null;
}

export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: "lax";
  path: string;
  secure: boolean;
  maxAge: number;
}

/**
 * Whether auth cookies for this request must carry `Secure`. Follows the
 * request scheme (forwarded proto wins behind a proxy) so plain-HTTP
 * deployments such as previews stay log-in-able — a Secure cookie on
 * HTTP is dropped by the browser. AUTH_COOKIE_SECURE pins the flag
 * either way. Without a request, falls back to NODE_ENV.
 */
export function shouldUseSecureCookies(request?: Request): boolean {
  const pinned = (process.env.AUTH_COOKIE_SECURE ?? "").trim().toLowerCase();
  if (pinned === "true") {
    return true;
  }
  if (pinned === "false") {
    return false;
  }
  if (request) {
    const forwarded = request.headers
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim()
      .toLowerCase();
    if (forwarded === "https") {
      return true;
    }
    if (forwarded === "http") {
      return false;
    }
    try {
      return new URL(request.url).protocol === "https:";
    } catch {
      return process.env.NODE_ENV === "production";
    }
  }
  return process.env.NODE_ENV === "production";
}

/** Cookie attributes for `byov_session`, per the shared contract. */
export function sessionCookieOptions(
  request?: Request,
): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: shouldUseSecureCookies(request),
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

// ---------------------------------------------------------------------------
// Rate limiter (in-memory, 5 hits per key per rolling minute)
// ---------------------------------------------------------------------------

// NOTE: single-instance in-memory state. It resets on restart/redeploy and
// is not shared across instances; a shared store (Redis/KV) is the follow-up
// when BYOV runs more than one server instance. The same limit applies to
// the OTP store below; magic-link tokens are stateless and unaffected.
const rateLimitHits = new Map<string, number[]>();

/** Returns true when the hit is allowed (and records it), false when capped. */
export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const hits = (rateLimitHits.get(key) ?? []).filter(
    (at) => at > windowStart,
  );
  if (hits.length >= RATE_LIMIT_MAX_HITS) {
    rateLimitHits.set(key, hits);
    return false;
  }
  hits.push(now);
  rateLimitHits.set(key, hits);
  return true;
}

// ---------------------------------------------------------------------------
// One-time codes (in-memory, keyed by lowercase email)
// ---------------------------------------------------------------------------

interface OtpEntry {
  code: string;
  exp: number;
  attempts: number;
}

// NOTE: single-instance in-memory store — see the rate-limiter note above.
const otpStore = new Map<string, OtpEntry>();

export function issueOtp(
  email: string,
  options?: { ttlMs?: number },
): { code: string; expiresAt: number } {
  const key = email.trim().toLowerCase();
  const code = randomDigits(6);
  const expiresAt = Date.now() + (options?.ttlMs ?? OTP_TTL_MS);
  otpStore.set(key, { code, exp: expiresAt, attempts: 0 });
  return { code, expiresAt };
}

export type OtpVerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "expired" | "locked" | "mismatch" };

export function verifyOtp(email: string, code: string): OtpVerifyResult {
  const key = email.trim().toLowerCase();
  const entry = otpStore.get(key);
  if (!entry) {
    return { ok: false, reason: "missing" };
  }
  if (entry.exp <= Date.now()) {
    otpStore.delete(key);
    return { ok: false, reason: "expired" };
  }
  if (entry.attempts >= OTP_MAX_ATTEMPTS) {
    otpStore.delete(key);
    return { ok: false, reason: "locked" };
  }
  if (!timingSafeEqualString(code.trim(), entry.code)) {
    entry.attempts += 1;
    if (entry.attempts >= OTP_MAX_ATTEMPTS) {
      otpStore.delete(key);
      return { ok: false, reason: "locked" };
    }
    return { ok: false, reason: "mismatch" };
  }
  otpStore.delete(key);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Magic-link tokens (stateless HMAC, 15-minute TTL)
// ---------------------------------------------------------------------------

interface MagicLinkPayload {
  email: string;
  exp: number;
  nonce: string;
}

export async function issueMagicLinkToken(
  email: string,
  options?: { ttlSec?: number },
): Promise<string> {
  const payload: MagicLinkPayload = {
    email: email.trim().toLowerCase(),
    exp:
      Math.floor(Date.now() / 1000) + (options?.ttlSec ?? MAGIC_LINK_TTL_SECONDS),
    nonce: randomNonce(),
  };
  const encoded = encodeJsonBase64Url(payload);
  const signature = await hmacSha256Base64Url(readSecret(), encoded);
  return `${encoded}.${signature}`;
}

export async function verifyMagicLinkToken(
  token: string,
): Promise<{ email: string } | null> {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) {
    return null;
  }
  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = await hmacSha256Base64Url(readSecret(), encoded);
  if (!timingSafeEqualString(signature, expected)) {
    return null;
  }
  const payload = decodeJsonBase64Url<MagicLinkPayload>(encoded);
  if (
    !payload ||
    typeof payload.email !== "string" ||
    typeof payload.exp !== "number" ||
    typeof payload.nonce !== "string" ||
    payload.email.length === 0
  ) {
    return null;
  }
  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }
  return { email: payload.email };
}

// ---------------------------------------------------------------------------
// Providers + `next` redirect guard
// ---------------------------------------------------------------------------

const PROVIDER_LABELS: Record<AuthProviderId, string> = {
  passwordless: "Passwordless code",
  "magic-link": "Email sign-in link",
  entra: "Microsoft Entra ID",
  github: "GitHub",
  google: "Google",
  apple: "Apple",
};

const PROVIDER_ORDER: AuthProviderId[] = [
  "passwordless",
  "magic-link",
  "entra",
  "github",
  "google",
  "apple",
];

function isFlagEnabled(value: string | undefined, defaultOn: boolean): boolean {
  if (value === undefined) {
    return defaultOn;
  }
  const normalized = value.trim().toLowerCase();
  if (defaultOn) {
    return normalized !== "false" && normalized !== "0" && normalized !== "no";
  }
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function getAuthProviders(): AuthProviderInfo[] {
  const enabled: Record<AuthProviderId, boolean> = {
    passwordless: isFlagEnabled(
      process.env.AUTH_PASSWORDLESS_ENABLED,
      true,
    ),
    "magic-link": isFlagEnabled(process.env.AUTH_MAGIC_LINK_ENABLED, true),
    entra: isFlagEnabled(process.env.AUTH_ENTRA_ENABLED, false),
    github: isFlagEnabled(process.env.AUTH_GITHUB_ENABLED, false),
    google: isFlagEnabled(process.env.AUTH_GOOGLE_ENABLED, false),
    apple: isFlagEnabled(process.env.AUTH_APPLE_ENABLED, false),
  };
  return PROVIDER_ORDER.map((id) => ({ id, label: PROVIDER_LABELS[id], enabled: enabled[id] }));
}

export function isProviderEnabled(id: AuthProviderId): boolean {
  return getAuthProviders().some((provider) => provider.id === id && provider.enabled);
}

/**
 * Honors only relative in-app paths (a single leading slash); anything else
 * — absolute URLs, protocol-relative URLs, backslashes, control chars —
 * falls back to `/` so `next` can never become an open redirect.
 */
export function sanitizeNextPath(next: unknown): string {
  if (typeof next !== "string") {
    return "/";
  }
  if (!next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }
  if (/[\r\n\\]/.test(next)) {
    return "/";
  }
  return next;
}

/** Parse an http(s) origin; null when the value is not one. */
function safeHttpOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return rewriteUnspecifiedHost(url.origin);
  } catch {
    return null;
  }
}

/**
 * 0.0.0.0 is a listen address, not an openable one: browsers refuse
 * https://0.0.0.0 and only some accept the http form. Emailed links and
 * OAuth callbacks must point at localhost instead.
 */
function rewriteUnspecifiedHost(origin: string): string {
  try {
    const url = new URL(origin);
    if (url.hostname === "0.0.0.0") {
      url.hostname = "localhost";
      return url.origin;
    }
  } catch {
    // Not a URL at all: leave it for the caller to fall through.
  }
  return origin;
}

/**
 * Base URL for emailed links and OAuth callbacks: NEXT_PUBLIC_SITE_URL
 * wins, else the forwarded host/proto behind a proxy, else the request
 * origin. Deployments behind a proxy should still set
 * NEXT_PUBLIC_SITE_URL — forwarded headers are a fallback, not a promise.
 */
export function resolveRequestOrigin(request: Request): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (configured) {
    const origin = safeHttpOrigin(configured);
    if (origin) return origin;
  }

  const forwardedHost =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? "";
  if (forwardedHost) {
    const forwardedProto =
      request.headers
        .get("x-forwarded-proto")
        ?.split(",")[0]
        ?.trim()
        .toLowerCase() || "https";
    const origin = safeHttpOrigin(`${forwardedProto}://${forwardedHost}`);
    if (origin) return origin;
  }

  return rewriteUnspecifiedHost(new URL(request.url).origin);
}

/** Test-only reset for the in-memory rate-limiter and OTP stores. */
export function _resetAuthStoresForTests(): void {
  rateLimitHits.clear();
  otpStore.clear();
}
