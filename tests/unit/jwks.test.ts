import { beforeEach, describe, expect, it } from "vitest";
import { _clearJwksCache, verifyIdTokenSignature } from "@/lib/jwks";
import { base64UrlEncodeBytes, base64UrlEncodeJson } from "@/lib/auth-oauth";

async function makeToken() {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const kid = "test-key-1";
  const header = { alg: "RS256", kid, typ: "JWT" };
  const claims = { iss: "https://accounts.google.com", sub: "123", aud: "client", exp: 9999999999 };
  const signingInput = `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(claims)}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    pair.privateKey,
    new TextEncoder().encode(signingInput) as BufferSource,
  );
  const token = `${signingInput}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
  const jwks = { keys: [{ ...jwk, kid, alg: "RS256", use: "sig" }] };
  return { token, jwks, claims };
}

beforeEach(() => _clearJwksCache());

describe("verifyIdTokenSignature", () => {
  it("accepts a token signed by the issuer key", async () => {
    const { token, jwks } = await makeToken();
    expect(await verifyIdTokenSignature(token, async () => jwks)).toBe(true);
  });

  it("rejects tampered payloads, unknown kids and non-RS256 algs", async () => {
    const { token, jwks } = await makeToken();
    const [h, , s] = token.split(".") as [string, string, string];
    const forged = `${h}.${base64UrlEncodeJson({ iss: "https://accounts.google.com", sub: "attacker" })}.${s}`;
    expect(await verifyIdTokenSignature(forged, async () => jwks)).toBe(false);
    _clearJwksCache();
    expect(await verifyIdTokenSignature(token, async () => ({ keys: [] }))).toBe(false);
    const noneAlg = `${base64UrlEncodeJson({ alg: "none", kid: "test-key-1" })}.${base64UrlEncodeJson({ iss: "https://accounts.google.com" })}.`;
    expect(await verifyIdTokenSignature(noneAlg, async () => jwks)).toBe(false);
  });

  it("fails closed when the JWKS fetch fails", async () => {
    const { token } = await makeToken();
    expect(
      await verifyIdTokenSignature(token, async () => {
        throw new Error("down");
      }),
    ).toBe(false);
  });
});
