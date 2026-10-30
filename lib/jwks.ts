/**
 * JWKS signature verification for OIDC `id_token`s (RS256).
 *
 * Fetches the provider key set, picks the key by `kid`, and verifies
 * the RSASSA-PKCS1-v1_5/SHA-256 signature with WebCrypto. Key sets
 * cache for an hour; fetch is injectable for offline tests. Claims
 * (iss/aud/exp/nonce) stay in `lib/auth-oauth.ts` — this module only
 * answers "did the issuer sign these exact bytes?".
 */

// Local base64url helpers (mirrors lib/auth-oauth) to avoid an
// import cycle: auth-oauth imports the verifier below.
function base64UrlDecodeBytes(input: string): Uint8Array {
  const standard = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (standard.length % 4)) % 4;
  const binary = atob(standard + "=".repeat(padding));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlDecodeJson<T>(input: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlDecodeBytes(input))) as T;
}

export type JwksFetch = (url: string) => Promise<unknown>;

const liveFetch: JwksFetch = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS fetch failed (HTTP ${res.status}).`);
  return res.json() as Promise<unknown>;
};

const CACHE_MS = 60 * 60 * 1000;
const cache = new Map<string, { keys: JsonWebKey[]; at: number }>();

interface JwkSet {
  keys?: unknown;
}

function issuerJwksUrl(iss: string): string | null {
  if (iss === "https://accounts.google.com" || iss === "accounts.google.com") {
    return "https://www.googleapis.com/oauth2/v3/certs";
  }
  if (iss === "https://appleid.apple.com") {
    return "https://appleid.apple.com/auth/keys";
  }
  const entra = /^https:\/\/login\.microsoftonline\.com\/([^/]+)\/v2\.0$/.exec(iss);
  if (entra) {
    return `https://login.microsoftonline.com/${entra[1]}/discovery/v2.0/keys`;
  }
  return null;
}

async function loadKeys(url: string, fetchJwks: JwksFetch): Promise<JsonWebKey[]> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return hit.keys;
  }
  const body = (await fetchJwks(url)) as JwkSet | null;
  const keys = Array.isArray(body?.keys) ? (body.keys as JsonWebKey[]) : [];
  cache.set(url, { keys, at: Date.now() });
  return keys;
}

/** Clear cached key sets (tests / key-rotation drills). */
export function _clearJwksCache(): void {
  cache.clear();
}

/**
 * True only when the token's RS256 signature verifies against the
 * issuer's published keys. Any anomaly (shape, alg, kid, fetch,
 * crypto) fails closed.
 */
export async function verifyIdTokenSignature(
  idToken: string,
  fetchJwks: JwksFetch = liveFetch,
): Promise<boolean> {
  try {
    const parts = idToken.split(".");
    if (parts.length !== 3) return false;
    const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
    const header = base64UrlDecodeJson<{ alg?: unknown; kid?: unknown }>(headerPart);
    if (header.alg !== "RS256" || typeof header.kid !== "string") return false;
    const claims = base64UrlDecodeJson<{ iss?: unknown }>(payloadPart);
    if (typeof claims.iss !== "string") return false;
    const url = issuerJwksUrl(claims.iss);
    if (!url) return false;
    const keys = await loadKeys(url, fetchJwks);
    const jwk = keys.find((k) => (k as { kid?: unknown }).kid === header.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const data = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
    // Copy into a fresh ArrayBuffer-backed view for WebCrypto typing.
    const signature = new Uint8Array(base64UrlDecodeBytes(signaturePart));
    return await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      signature as BufferSource,
      data as BufferSource,
    );
  } catch {
    return false;
  }
}
