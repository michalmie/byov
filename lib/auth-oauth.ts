/**
 * OAuth2/OIDC flow helpers for the four external providers (entra, github,
 * google, apple). Web Crypto + fetch only — no new dependencies.
 *
 * NOTE (dedup on merge): the session-cookie signing and `isEmailAllowed`
 * below intentionally mirror the sibling auth-core slice (`lib/auth.ts`,
 * built in parallel and therefore not importable here). Both implement the
 * same shared auth contract; the parent task dedups them at merge time.
 */

import {
  getProvider,
  getProviderEndpoints,
  type OAuthProviderId,
  type ProviderCredentials,
} from "./auth-providers";

/* ------------------------------------------------------------------ */
/* base64url (Web-API only, no Buffer so this also runs on the edge)   */
/* ------------------------------------------------------------------ */

export function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function base64UrlEncodeJson(value: unknown): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(value)));
}

export function base64UrlDecodeBytes(input: string): Uint8Array {
  const standard = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (standard.length % 4)) % 4;
  const binary = atob(standard + "=".repeat(padding));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function base64UrlDecodeJson<T>(input: string): T {
  return JSON.parse(
    new TextDecoder().decode(base64UrlDecodeBytes(input)),
  ) as T;
}

/** Standard base64 (with `+/=` alphabet) -> bytes, for PEM bodies. */
export function base64DecodeBytes(input: string): Uint8Array {
  const compact = input.replace(/\s+/g, "");
  const binary = atob(compact);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/* ------------------------------------------------------------------ */
/* state / nonce / PKCE                                                */
/* ------------------------------------------------------------------ */

export function randomOAuthString(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncodeBytes(bytes);
}

export function randomState(): string {
  return randomOAuthString(32);
}

export function randomNonce(): string {
  return randomOAuthString(32);
}

export function randomCodeVerifier(): string {
  return randomOAuthString(32);
}

/** PKCE S256 code challenge: base64url(sha256(verifier)). */
export async function pkceCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64UrlEncodeBytes(new Uint8Array(digest));
}

/** Constant-time string comparison for the OAuth `state` check. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/* ------------------------------------------------------------------ */
/* authorize URL                                                       */
/* ------------------------------------------------------------------ */

export interface AuthorizeParams {
  state: string;
  /** OIDC nonce (entra/google/apple). The route reuses `state` as the
   * nonce so the callback can verify it against the state cookie without
   * extra storage; both are single-use 256-bit randoms. */
  nonce: string;
  codeChallenge: string;
  redirectUri: string;
}

export function buildAuthorizeUrl(
  id: OAuthProviderId,
  clientId: string,
  params: AuthorizeParams,
): string {
  const meta = getProvider(id);
  if (!meta) throw new Error(`Unknown OAuth provider: ${id}`);
  const { authorizationUrl } = getProviderEndpoints(id);
  const url = new URL(authorizationUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", meta.scope);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (id === "github") {
    // GitHub is OAuth2 (no OIDC): no response_type/nonce.
    return url.toString();
  }
  url.searchParams.set("response_type", "code");
  url.searchParams.set("nonce", params.nonce);
  if (id === "entra") {
    url.searchParams.set("response_mode", "query");
  }
  if (id === "apple") {
    // Apple defaults to a fragment/form_post response; we need the code
    // delivered as a query parameter to our GET callback.
    url.searchParams.set("response_mode", "query");
  }
  return url.toString();
}

/* ------------------------------------------------------------------ */
/* Apple client_secret (ES256 JWT, 5-minute expiry)                     */
/* ------------------------------------------------------------------ */

export interface AppleClientSecretInput {
  teamId: string;
  clientId: string;
  keyId: string;
  privateKeyPem: string;
  nowMs?: number;
}

async function importApplePrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "");
  const raw = base64DecodeBytes(body);
  // Copy into a fresh ArrayBuffer: subtle.importKey wants a BufferSource
  // and TS types the Uint8Array view as potentially shared.
  const bytes = new Uint8Array(raw.byteLength);
  bytes.set(raw);
  return crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer as ArrayBuffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

export async function buildAppleClientSecret(
  input: AppleClientSecretInput,
): Promise<string> {
  const nowSec = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const header = { alg: "ES256", kid: input.keyId };
  const payload = {
    iss: input.teamId,
    iat: nowSec,
    exp: nowSec + 300,
    aud: "https://appleid.apple.com",
    sub: input.clientId,
  };
  const signingInput = `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(payload)}`;
  const key = await importApplePrivateKey(input.privateKeyPem);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
}

/* ------------------------------------------------------------------ */
/* token exchange + identity                                           */
/* ------------------------------------------------------------------ */

export interface TokenResult {
  idToken?: string;
  accessToken?: string;
}

export interface ExchangeInput {
  code: string;
  redirectUri: string;
  codeVerifier: string;
  credentials: ProviderCredentials;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Exchange an authorization code for tokens at the provider. */
export async function exchangeCodeForTokens(
  input: ExchangeInput,
): Promise<TokenResult | null> {
  const { code, redirectUri, codeVerifier, credentials } = input;
  const id = credentials.provider;
  const { tokenUrl } = getProviderEndpoints(id);
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", redirectUri);
  body.set("code_verifier", codeVerifier);

  switch (credentials.provider) {
    case "entra":
    case "github":
    case "google":
      body.set("client_id", credentials.credentials.clientId);
      body.set("client_secret", credentials.credentials.clientSecret);
      break;
    case "apple": {
      const apple = credentials.credentials;
      body.set("client_id", apple.clientId);
      try {
        body.set(
          "client_secret",
          await buildAppleClientSecret({
            teamId: apple.teamId,
            clientId: apple.clientId,
            keyId: apple.keyId,
            privateKeyPem: apple.privateKeyPem,
          }),
        );
      } catch {
        return null;
      }
      break;
    }
  }

  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // GitHub answers urlencoded unless JSON is requested.
        Accept: "application/json",
      },
      body: body.toString(),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  let json: Record<string, unknown>;
  try {
    json = (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof json.error === "string" && json.error.length > 0) return null;
  const idToken = asString(json.id_token);
  const accessToken = asString(json.access_token);
  if (!idToken && !accessToken) return null;
  return { idToken, accessToken };
}

export interface OAuthIdentity {
  sub: string;
  email: string;
  name?: string;
}

interface IdTokenClaims {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  nonce?: unknown;
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  preferred_username?: unknown;
  name?: unknown;
}

function isFutureExp(exp: unknown): boolean {
  return typeof exp === "number" && exp * 1000 > Date.now();
}

function audienceMatches(aud: unknown, clientId: string): boolean {
  if (typeof aud === "string") return timingSafeEqual(aud, clientId);
  if (Array.isArray(aud)) {
    return aud.some(
      (entry) => typeof entry === "string" && timingSafeEqual(entry, clientId),
    );
  }
  return false;
}

function issuerMatches(
  id: OAuthProviderId,
  iss: unknown,
  tenantId = "common",
): boolean {
  if (typeof iss !== "string") return false;
  switch (id) {
    case "entra": {
      // The multi-tenant hosts ("common", "organizations", "consumers")
      // mint tenant-specific issuers, so only the shape is pinned there.
      if (tenantId === "common" || tenantId === "organizations" || tenantId === "consumers") {
        return /^https:\/\/login\.microsoftonline\.com\/[^/]+\/v2\.0$/.test(
          iss,
        );
      }
      return iss === `https://login.microsoftonline.com/${tenantId}/v2.0`;
    }
    case "google":
      return iss === "https://accounts.google.com" || iss === "accounts.google.com";
    case "apple":
      return iss === "https://appleid.apple.com";
    case "github":
      return false;
  }
}

function emailIsVerified(value: unknown): boolean {
  return value === true || value === "true";
}

/**
 * Verify an `id_token`'s audience/issuer/expiry/nonce claims and extract the
 * verified identity.
 *
 * The signature itself is NOT verified against the provider JWKS here: the
 * token arrives over TLS directly from the token endpoint in exchange for a
 * PKCE-bound authorization code, which already authenticates it to this
 * client. FOLLOW-UP: verify id_token signatures against the provider JWKS
 * (with key rotation + caching) as a hardening slice.
 */
export function verifyIdToken(
  id: Exclude<OAuthProviderId, "github">,
  idToken: string,
  opts: { clientId: string; tenantId?: string; nonce?: string },
): OAuthIdentity | null {
  const parts = idToken.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  let claims: IdTokenClaims;
  try {
    claims = base64UrlDecodeJson<IdTokenClaims>(parts[1]);
  } catch {
    return null;
  }
  if (claims === null || typeof claims !== "object") return null;
  if (!audienceMatches(claims.aud, opts.clientId)) return null;
  if (!issuerMatches(id, claims.iss, opts.tenantId)) return null;
  if (!isFutureExp(claims.exp)) return null;
  if (opts.nonce !== undefined) {
    if (typeof claims.nonce !== "string") return null;
    if (!timingSafeEqual(claims.nonce, opts.nonce)) return null;
  }
  if (typeof claims.sub !== "string" || claims.sub.length === 0) return null;

  let email: string | undefined;
  switch (id) {
    case "entra":
      email = asString(claims.email);
      if (!email) {
        const upn = asString(claims.preferred_username);
        if (upn && upn.includes("@")) email = upn;
      }
      break;
    case "google":
      if (!emailIsVerified(claims.email_verified)) return null;
      email = asString(claims.email);
      break;
    case "apple":
      // Apple omits email_verified on some re-auths; require it only when
      // the claim is present.
      if (
        claims.email_verified !== undefined &&
        !emailIsVerified(claims.email_verified)
      ) {
        return null;
      }
      email = asString(claims.email);
      break;
  }
  if (!email || !email.includes("@")) return null;
  const name = asString(claims.name);
  return { sub: claims.sub, email, ...(name ? { name } : {}) };
}

interface GitHubUser {
  id?: unknown;
  name?: unknown;
  email?: unknown;
}

interface GitHubEmailEntry {
  email?: unknown;
  primary?: unknown;
  verified?: unknown;
}

async function fetchJson(
  url: string,
  accessToken: string,
): Promise<unknown | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

/** GitHub identity via /user + /user/emails (primary verified email). */
export async function verifyGitHubIdentity(
  accessToken: string,
): Promise<OAuthIdentity | null> {
  const [userJson, emailsJson] = await Promise.all([
    fetchJson("https://api.github.com/user", accessToken),
    fetchJson("https://api.github.com/user/emails", accessToken),
  ]);
  if (userJson === null || typeof userJson !== "object") return null;
  if (!Array.isArray(emailsJson)) return null;
  const user = userJson as GitHubUser;
  if (typeof user.id !== "number" && typeof user.id !== "string") return null;
  const primary = (emailsJson as GitHubEmailEntry[]).find(
    (entry) =>
      entry.primary === true &&
      entry.verified === true &&
      typeof entry.email === "string" &&
      entry.email.includes("@"),
  );
  if (!primary || typeof primary.email !== "string") return null;
  const name = asString(user.name);
  return {
    sub: String(user.id),
    email: primary.email,
    ...(name ? { name } : {}),
  };
}

export interface ResolveIdentityOpts {
  clientId: string;
  tenantId?: string;
  nonce?: string;
}

export async function resolveOAuthIdentity(
  id: OAuthProviderId,
  tokens: TokenResult,
  opts: ResolveIdentityOpts,
): Promise<OAuthIdentity | null> {
  if (id === "github") {
    if (!tokens.accessToken) return null;
    return verifyGitHubIdentity(tokens.accessToken);
  }
  if (!tokens.idToken) return null;
  return verifyIdToken(id, tokens.idToken, opts);
}

/* ------------------------------------------------------------------ */
/* callback base URL / redirect_uri                                    */
/* ------------------------------------------------------------------ */

/** Contract: NEXT_PUBLIC_SITE_URL wins, else the request origin. */
export function getOAuthCallbackBaseUrl(request: Request): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (configured) return configured;
  return new URL(request.url).origin;
}

export function getOAuthRedirectUri(
  request: Request,
  provider: OAuthProviderId,
): string {
  return `${getOAuthCallbackBaseUrl(request)}/api/auth/oauth/${provider}/callback`;
}

/* ------------------------------------------------------------------ */
/* `next` redirect target                                              */
/* ------------------------------------------------------------------ */

/** Contract: only relative targets (a single leading `/`) are honored. */
export function isSafeNext(value: string | null | undefined): value is string {
  if (!value || !value.startsWith("/")) return false;
  if (value.startsWith("//") || value.startsWith("/\\")) return false;
  return true;
}

export function resolveNext(value: string | null | undefined): string {
  return isSafeNext(value) ? value : "/";
}

/* ------------------------------------------------------------------ */
/* session cookie (local mirror of the auth-core slice)                */
/* ------------------------------------------------------------------ */

export const SESSION_COOKIE_NAME = "byov_session";
export const SESSION_MAX_AGE_SECONDS = 43200; // 12h

export const OAUTH_STATE_COOKIE = "oauth_state";
export const OAUTH_VERIFIER_COOKIE = "oauth_verifier";
export const OAUTH_NEXT_COOKIE = "oauth_next";
export const OAUTH_COOKIE_MAX_AGE_SECONDS = 600; // 10 minutes

const DEV_FALLBACK_SECRET = "dev-only-insecure-secret";

export function getAuthSecret(): string {
  const secret = (process.env.AUTH_SECRET ?? "").trim();
  if (secret) return secret;
  console.warn(
    "[auth] AUTH_SECRET is not set; using an insecure dev-only fallback secret.",
  );
  return DEV_FALLBACK_SECRET;
}

export function shouldUseSecureCookies(): boolean {
  return process.env.NODE_ENV === "production";
}

export interface SessionPayload {
  sub: string;
  email: string;
  name?: string;
  provider: string;
  iat: number;
  exp: number;
}

export interface CreateSessionInput {
  sub: string;
  email: string;
  name?: string;
  provider: OAuthProviderId;
}

/**
 * Contract session value: `<base64url(payloadJSON)>.<base64url(hmacSig)>`
 * where sig = HMAC-SHA256 over the payload segment with AUTH_SECRET.
 */
export async function createSessionValue(
  input: CreateSessionInput,
): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: input.sub,
    email: input.email,
    ...(input.name ? { name: input.name } : {}),
    provider: input.provider,
    iat: nowSec,
    exp: nowSec + SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = base64UrlEncodeJson(payload);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getAuthSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload),
  );
  return `${encodedPayload}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
}

/* ------------------------------------------------------------------ */
/* email allowlist (local mirror of the auth-core slice)               */
/* ------------------------------------------------------------------ */

function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/**
 * Contract allowlist: exact-email match wins, then domain match, then the
 * dev default (both lists empty -> allow + warn), else deny.
 */
export function isEmailAllowed(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const allowedEmails = parseList(process.env.AUTH_ALLOWED_EMAILS);
  const allowedDomains = parseList(process.env.AUTH_ALLOWED_DOMAINS);
  if (allowedEmails.length > 0 && allowedEmails.includes(normalized)) {
    return true;
  }
  const domain = normalized.split("@")[1] ?? "";
  if (allowedDomains.length > 0 && domain.length > 0) {
    if (allowedDomains.includes(domain)) return true;
  }
  if (allowedEmails.length === 0 && allowedDomains.length === 0) {
    console.warn(
      "[auth] Neither AUTH_ALLOWED_EMAILS nor AUTH_ALLOWED_DOMAINS is configured; allowing all emails (dev default).",
    );
    return true;
  }
  return false;
}
