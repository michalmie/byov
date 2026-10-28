import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAppleCredentials,
  getEntraCredentials,
  getGitHubCredentials,
  getGoogleCredentials,
  getProvider,
  getProviderCredentials,
  getProviderEndpoints,
  isKnownProvider,
  isProviderConfigured,
  isProviderEnabled,
  PROVIDERS,
} from "@/lib/auth-providers";
import {
  base64UrlDecodeJson,
  base64UrlEncodeJson,
  buildAppleClientSecret,
  buildAuthorizeUrl,
  createSessionValue,
  exchangeCodeForTokens,
  getOAuthRedirectUri,
  isEmailAllowed,
  isSafeNext,
  pkceCodeChallenge,
  randomCodeVerifier,
  randomNonce,
  randomState,
  resolveNext,
  resolveOAuthIdentity,
  timingSafeEqual,
  verifyGitHubIdentity,
  verifyIdToken,
} from "@/lib/auth-oauth";
import { GET as authorizeGET } from "@/app/api/auth/oauth/[provider]/authorize/route";
import {
  GET as callbackGET,
  POST as callbackPOST,
} from "@/app/api/auth/oauth/[provider]/callback/route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type FetchHandler = (
  url: string,
  init?: RequestInit,
) => Response | Promise<Response>;

function stubFetch(handler: FetchHandler) {
  const mock = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) =>
      handler(String(input), init),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

/** Unsigned test id_token — the code checks claims, not the signature. */
function makeIdToken(payload: Record<string, unknown>): string {
  const header = base64UrlEncodeJson({ alg: "RS256", kid: "test-key" });
  return `${header}.${base64UrlEncodeJson(payload)}.test-signature`;
}

function futureExp(): number {
  return Math.floor(Date.now() / 1000) + 3600;
}

function toStandardBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function generateAppleKeyPem(): Promise<{
  pem: string;
  publicKey: CryptoKey;
}> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", keyPair.privateKey),
  );
  const body = toStandardBase64(pkcs8).replace(/.{64}/g, "$&\n");
  return {
    pem: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`,
    publicKey: keyPair.publicKey,
  };
}

function googleIdToken(nonce: string, overrides = {}) {
  return makeIdToken({
    iss: "https://accounts.google.com",
    aud: "google-client-id",
    exp: futureExp(),
    nonce,
    sub: "google-sub-123",
    email: "ada@example.com",
    email_verified: true,
    name: "Ada Lovelace",
    ...overrides,
  });
}

function stubGoogleEnv() {
  vi.stubEnv("GOOGLE_CLIENT_ID", "google-client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-secret");
  vi.stubEnv("AUTH_GOOGLE_ENABLED", "true");
  vi.stubEnv("AUTH_SECRET", "test-secret");
}

/** Route-handler `context` for a given provider id. */
function routeContext(provider: string) {
  return { params: Promise.resolve({ provider }) };
}

function cookiesFrom(response: Response): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const header of response.headers.getSetCookie()) {
    const pair = header.split(";")[0] ?? "";
    const separator = pair.indexOf("=");
    if (separator !== -1) {
      cookies.set(
        pair.slice(0, separator).trim(),
        pair.slice(separator + 1).trim(),
      );
    }
  }
  return cookies;
}

function cookieHeader(cookies: Map<string, string>): string {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

describe("PROVIDERS registry", () => {
  it("lists the four providers with contract labels and scopes", () => {
    expect(PROVIDERS.map((p) => [p.id, p.label, p.scope])).toEqual([
      ["entra", "Microsoft Entra ID", "openid profile email"],
      ["github", "GitHub", "read:user user:email"],
      ["google", "Google", "openid profile email"],
      ["apple", "Apple", "name email"],
    ]);
  });

  it("recognizes only the four provider ids", () => {
    for (const id of ["entra", "github", "google", "apple"]) {
      expect(isKnownProvider(id)).toBe(true);
      expect(getProvider(id)?.id).toBe(id);
    }
    for (const id of ["", "okta", "passwordless", "magic-link", "ENTRA"]) {
      expect(isKnownProvider(id)).toBe(false);
      expect(getProvider(id)).toBeNull();
    }
  });
});

describe("provider endpoints", () => {
  it("uses fixed hosts for github, google and apple", () => {
    expect(getProviderEndpoints("github")).toEqual({
      authorizationUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
    });
    expect(getProviderEndpoints("google")).toEqual({
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
    });
    expect(getProviderEndpoints("apple")).toEqual({
      authorizationUrl: "https://appleid.apple.com/auth/authorize",
      tokenUrl: "https://appleid.apple.com/auth/token",
    });
  });

  it("scopes entra endpoints to the tenant, defaulting to common", () => {
    expect(getProviderEndpoints("entra")).toEqual({
      authorizationUrl: "https://login.microsoftonline.com/common/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/v2.0/token",
    });
    vi.stubEnv("AZURE_AD_TENANT_ID", "contoso.onmicrosoft.com");
    expect(getProviderEndpoints("entra").tokenUrl).toBe(
      "https://login.microsoftonline.com/contoso.onmicrosoft.com/v2.0/token",
    );
  });
});

describe("credentials + isProviderConfigured", () => {
  it("reports every provider unconfigured when no env is set", () => {
    for (const id of ["entra", "github", "google", "apple"] as const) {
      expect(isProviderConfigured(id)).toBe(false);
      expect(getProviderCredentials(id)).toBeNull();
    }
    expect(getEntraCredentials()).toBeNull();
    expect(getGitHubCredentials()).toBeNull();
    expect(getGoogleCredentials()).toBeNull();
    expect(getAppleCredentials()).toBeNull();
  });

  it("reads entra credentials with the common tenant default", () => {
    vi.stubEnv("AZURE_AD_CLIENT_ID", "entra-id");
    expect(isProviderConfigured("entra")).toBe(false);
    vi.stubEnv("AZURE_AD_CLIENT_SECRET", "entra-secret");
    expect(isProviderConfigured("entra")).toBe(true);
    expect(getEntraCredentials()).toEqual({
      clientId: "entra-id",
      tenantId: "common",
      clientSecret: "entra-secret",
    });
    vi.stubEnv("AZURE_AD_TENANT_ID", "tenant-guid");
    expect(getEntraCredentials()?.tenantId).toBe("tenant-guid");
  });

  it("reads github and google credentials", () => {
    vi.stubEnv("GITHUB_CLIENT_ID", "gh-id");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "gh-secret");
    expect(getProviderCredentials("github")).toEqual({
      provider: "github",
      credentials: { clientId: "gh-id", clientSecret: "gh-secret" },
    });
    vi.stubEnv("GOOGLE_CLIENT_ID", "go-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "go-secret");
    expect(isProviderConfigured("google")).toBe(true);
    expect(getGoogleCredentials()).toEqual({
      clientId: "go-id",
      clientSecret: "go-secret",
    });
  });

  it("reads apple credentials and unescapes the PEM", () => {
    vi.stubEnv("APPLE_CLIENT_ID", "com.example.signin");
    vi.stubEnv("APPLE_TEAM_ID", "TEAM123");
    vi.stubEnv("APPLE_KEY_ID", "KEY123");
    expect(isProviderConfigured("apple")).toBe(false);
    vi.stubEnv("APPLE_PRIVATE_KEY", "-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----");
    expect(isProviderConfigured("apple")).toBe(true);
    expect(getAppleCredentials()?.privateKeyPem).toContain(
      "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----",
    );
  });

  it("gates providers behind their AUTH_*_ENABLED flag", () => {
    expect(isProviderEnabled("google")).toBe(false);
    vi.stubEnv("AUTH_ENTRA_ENABLED", "true");
    vi.stubEnv("AUTH_GITHUB_ENABLED", "1");
    vi.stubEnv("AUTH_GOOGLE_ENABLED", "true");
    vi.stubEnv("AUTH_APPLE_ENABLED", "false");
    expect(isProviderEnabled("entra")).toBe(true);
    expect(isProviderEnabled("github")).toBe(false);
    expect(isProviderEnabled("google")).toBe(true);
    expect(isProviderEnabled("apple")).toBe(false);
  });
});

describe("random state/nonce/verifier", () => {
  it("emits unique url-safe 43-char strings", () => {
    const values = [randomState(), randomNonce(), randomCodeVerifier()];
    for (const value of values) {
      expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
    expect(new Set(values).size).toBe(3);
    expect(randomState()).not.toBe(randomState());
  });
});

describe("timingSafeEqual", () => {
  it("compares states without leaking position", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
    expect(timingSafeEqual("", "")).toBe(true);
    expect(timingSafeEqual("abc123", "abc124")).toBe(false);
    expect(timingSafeEqual("abc123", "abc12")).toBe(false);
    expect(timingSafeEqual("short", "much-longer-state")).toBe(false);
  });
});

describe("pkceCodeChallenge", () => {
  it("matches the RFC 7636 Appendix B vector", async () => {
    await expect(
      pkceCodeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    ).resolves.toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("is deterministic and verifier-sensitive", async () => {
    const challenge = await pkceCodeChallenge("verifier-a");
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(pkceCodeChallenge("verifier-a")).resolves.toBe(challenge);
    await expect(pkceCodeChallenge("verifier-b")).resolves.not.toBe(challenge);
  });
});

describe("buildAuthorizeUrl", () => {
  const params = {
    state: "state-value",
    nonce: "state-value",
    codeChallenge: "challenge-value",
    redirectUri: "https://byov.example/api/auth/oauth/google/callback",
  };

  it("builds the google authorize URL with nonce + PKCE", () => {
    const url = new URL(buildAuthorizeUrl("google", "go-id", params));
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url.searchParams.get("client_id")).toBe("go-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid profile email");
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("nonce")).toBe("state-value");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-value");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe(params.redirectUri);
  });

  it("adds response_mode=query for entra and apple", () => {
    vi.stubEnv("AZURE_AD_TENANT_ID", "tenant-guid");
    const entra = new URL(buildAuthorizeUrl("entra", "en-id", params));
    expect(entra.origin + entra.pathname).toBe(
      "https://login.microsoftonline.com/tenant-guid/v2.0/authorize",
    );
    expect(entra.searchParams.get("response_mode")).toBe("query");
    expect(entra.searchParams.get("nonce")).toBe("state-value");
    const apple = new URL(buildAuthorizeUrl("apple", "com.example", params));
    expect(apple.searchParams.get("response_mode")).toBe("query");
    expect(apple.searchParams.get("scope")).toBe("name email");
    expect(apple.searchParams.get("nonce")).toBe("state-value");
  });

  it("omits OIDC parameters for github", () => {
    const url = new URL(buildAuthorizeUrl("github", "gh-id", params));
    expect(url.origin + url.pathname).toBe(
      "https://github.com/login/oauth/authorize",
    );
    expect(url.searchParams.get("scope")).toBe("read:user user:email");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.has("response_type")).toBe(false);
    expect(url.searchParams.has("nonce")).toBe(false);
  });

  it("throws for unknown providers", () => {
    expect(() =>
      buildAuthorizeUrl("okta" as "google", "id", params),
    ).toThrow("Unknown OAuth provider");
  });
});

describe("buildAppleClientSecret", () => {
  it("mints an ES256 JWT with a 5-minute expiry", async () => {
    const { pem, publicKey } = await generateAppleKeyPem();
    const nowMs = 1_700_000_000_000;
    const jwt = await buildAppleClientSecret({
      teamId: "TEAM123",
      clientId: "com.example.signin",
      keyId: "KEY123",
      privateKeyPem: pem,
      nowMs,
    });
    const [headerSegment, payloadSegment, signatureSegment] = jwt.split(".");
    expect(headerSegment).toBeDefined();
    expect(signatureSegment).toBeDefined();
    expect(
      base64UrlDecodeJson<Record<string, unknown>>(headerSegment!),
    ).toEqual({ alg: "ES256", kid: "KEY123" });
    const payload =
      base64UrlDecodeJson<Record<string, unknown>>(payloadSegment!);
    expect(payload).toMatchObject({
      iss: "TEAM123",
      aud: "https://appleid.apple.com",
      sub: "com.example.signin",
      iat: 1_700_000_000,
      exp: 1_700_000_300,
    });
    // The raw R||S signature verifies against the generated public key.
    const signingInput = new TextEncoder().encode(
      `${headerSegment}.${payloadSegment}`,
    );
    const rawSignature = Uint8Array.from(
      atob(
        signatureSegment!.replace(/-/g, "+").replace(/_/g, "/"),
      ),
      (char) => char.charCodeAt(0),
    );
    await expect(
      crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        publicKey,
        rawSignature.buffer as ArrayBuffer,
        signingInput,
      ),
    ).resolves.toBe(true);
  });

  it("rejects a malformed private key", async () => {
    await expect(
      buildAppleClientSecret({
        teamId: "TEAM123",
        clientId: "com.example.signin",
        keyId: "KEY123",
        privateKeyPem: "not-a-pem-key",
      }),
    ).rejects.toThrow();
  });
});

describe("exchangeCodeForTokens", () => {
  const googleCreds = {
    provider: "google" as const,
    credentials: { clientId: "go-id", clientSecret: "go-secret" },
  };

  it("posts the PKCE-bound code exchange and returns tokens", async () => {
    let seenBody = "";
    let seenAccept = "";
    stubFetch(async (url, init) => {
      expect(url).toBe("https://oauth2.googleapis.com/token");
      seenBody = String(init?.body ?? "");
      seenAccept = new Headers(init?.headers).get("Accept") ?? "";
      return jsonResponse({ id_token: "id-token-value" });
    });
    const tokens = await exchangeCodeForTokens({
      code: "auth-code",
      redirectUri: "https://byov.example/callback",
      codeVerifier: "verifier-value",
      credentials: googleCreds,
    });
    expect(tokens).toEqual({ idToken: "id-token-value", accessToken: undefined });
    const body = new URLSearchParams(seenBody);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("auth-code");
    expect(body.get("redirect_uri")).toBe("https://byov.example/callback");
    expect(body.get("code_verifier")).toBe("verifier-value");
    expect(body.get("client_id")).toBe("go-id");
    expect(body.get("client_secret")).toBe("go-secret");
    expect(seenAccept).toBe("application/json");
  });

  it("sends an Apple client_secret JWT instead of a static secret", async () => {
    const { pem } = await generateAppleKeyPem();
    let seenSecret = "";
    stubFetch(async (url, init) => {
      expect(url).toBe("https://appleid.apple.com/auth/token");
      seenSecret =
        new URLSearchParams(String(init?.body ?? "")).get("client_secret") ??
        "";
      return jsonResponse({ id_token: "apple-id-token" });
    });
    const tokens = await exchangeCodeForTokens({
      code: "auth-code",
      redirectUri: "https://byov.example/callback",
      codeVerifier: "verifier-value",
      credentials: {
        provider: "apple",
        credentials: {
          clientId: "com.example.signin",
          teamId: "TEAM123",
          keyId: "KEY123",
          privateKeyPem: pem,
        },
      },
    });
    expect(tokens?.idToken).toBe("apple-id-token");
    expect(seenSecret.split(".")).toHaveLength(3);
    expect(
      base64UrlDecodeJson<Record<string, unknown>>(seenSecret.split(".")[0]!),
    ).toMatchObject({ alg: "ES256", kid: "KEY123" });
  });

  it("returns null on transport, status, protocol and secret failures", async () => {
    stubFetch(async () => {
      throw new Error("network down");
    });
    await expect(
      exchangeCodeForTokens({
        code: "c",
        redirectUri: "https://byov.example/callback",
        codeVerifier: "v",
        credentials: googleCreds,
      }),
    ).resolves.toBeNull();

    stubFetch(async () => jsonResponse({ error: "invalid_grant" }, 400));
    await expect(
      exchangeCodeForTokens({
        code: "c",
        redirectUri: "https://byov.example/callback",
        codeVerifier: "v",
        credentials: googleCreds,
      }),
    ).resolves.toBeNull();

    stubFetch(async () => jsonResponse({ error: "invalid_grant" }));
    await expect(
      exchangeCodeForTokens({
        code: "c",
        redirectUri: "https://byov.example/callback",
        codeVerifier: "v",
        credentials: googleCreds,
      }),
    ).resolves.toBeNull();

    stubFetch(async () => jsonResponse({ unexpected: true }));
    await expect(
      exchangeCodeForTokens({
        code: "c",
        redirectUri: "https://byov.example/callback",
        codeVerifier: "v",
        credentials: googleCreds,
      }),
    ).resolves.toBeNull();
  });
});

describe("verifyIdToken", () => {
  const googleOpts = { clientId: "google-client-id", nonce: "nonce-value" };

  it("accepts a valid google id_token", () => {
    expect(
      verifyIdToken("google", googleIdToken("nonce-value"), googleOpts),
    ).toEqual({
      sub: "google-sub-123",
      email: "ada@example.com",
      name: "Ada Lovelace",
    });
  });

  it("rejects bad audience, issuer, expiry, subject and nonce", () => {
    expect(
      verifyIdToken(
        "google",
        googleIdToken("nonce-value", { aud: "someone-else" }),
        googleOpts,
      ),
    ).toBeNull();
    expect(
      verifyIdToken(
        "google",
        googleIdToken("nonce-value", { iss: "https://evil.example" }),
        googleOpts,
      ),
    ).toBeNull();
    expect(
      verifyIdToken(
        "google",
        googleIdToken("nonce-value", {
          exp: Math.floor(Date.now() / 1000) - 60,
        }),
        googleOpts,
      ),
    ).toBeNull();
    expect(
      verifyIdToken(
        "google",
        googleIdToken("nonce-value", { sub: undefined }),
        googleOpts,
      ),
    ).toBeNull();
    expect(
      verifyIdToken("google", googleIdToken("other-nonce"), googleOpts),
    ).toBeNull();
    expect(
      verifyIdToken(
        "google",
        googleIdToken("nonce-value", { nonce: undefined }),
        googleOpts,
      ),
    ).toBeNull();
  });

  it("rejects malformed tokens and unverified google emails", () => {
    expect(verifyIdToken("google", "only.two", googleOpts)).toBeNull();
    expect(verifyIdToken("google", "a.!!!not-base64!!!.c", googleOpts)).toBeNull();
    expect(
      verifyIdToken(
        "google",
        googleIdToken("nonce-value", { email_verified: false }),
        googleOpts,
      ),
    ).toBeNull();
    expect(
      verifyIdToken(
        "google",
        googleIdToken("nonce-value", { email: "not-an-email" }),
        googleOpts,
      ),
    ).toBeNull();
  });

  it("pins entra issuers per tenant with preferred_username fallback", () => {
    const entraToken = (overrides: Record<string, unknown>) =>
      makeIdToken({
        iss: "https://login.microsoftonline.com/tenant-guid/v2.0",
        aud: "entra-id",
        exp: futureExp(),
        nonce: "nonce-value",
        sub: "entra-sub",
        email: "ada@example.com",
        name: "Ada",
        ...overrides,
      });
    const opts = { clientId: "entra-id", nonce: "nonce-value" };
    expect(verifyIdToken("entra", entraToken({}), opts)?.email).toBe(
      "ada@example.com",
    );
    expect(
      verifyIdToken(
        "entra",
        entraToken({
          iss: "https://login.microsoftonline.com.evil.example/x/v2.0",
        }),
        opts,
      ),
    ).toBeNull();
    expect(
      verifyIdToken(
        "entra",
        entraToken({ email: undefined, preferred_username: "ada@example.com" }),
        opts,
      )?.email,
    ).toBe("ada@example.com");
    expect(
      verifyIdToken(
        "entra",
        entraToken({ email: undefined, preferred_username: "not-an-email" }),
        opts,
      ),
    ).toBeNull();
    // A pinned tenant requires its exact issuer.
    expect(
      verifyIdToken("entra", entraToken({}), { ...opts, tenantId: "other" }),
    ).toBeNull();
    expect(
      verifyIdToken("entra", entraToken({}), {
        ...opts,
        tenantId: "tenant-guid",
      })?.email,
    ).toBe("ada@example.com");
  });

  it("accepts apple tokens and enforces email_verified when present", () => {
    const appleToken = (overrides: Record<string, unknown>) =>
      makeIdToken({
        iss: "https://appleid.apple.com",
        aud: "com.example.signin",
        exp: futureExp(),
        nonce: "nonce-value",
        sub: "apple-sub",
        email: "ada@example.com",
        ...overrides,
      });
    const opts = { clientId: "com.example.signin", nonce: "nonce-value" };
    expect(verifyIdToken("apple", appleToken({}), opts)?.email).toBe(
      "ada@example.com",
    );
    expect(
      verifyIdToken("apple", appleToken({ email_verified: "true" }), opts)
        ?.email,
    ).toBe("ada@example.com");
    expect(
      verifyIdToken("apple", appleToken({ email_verified: "false" }), opts),
    ).toBeNull();
    expect(
      verifyIdToken(
        "apple",
        appleToken({ iss: "https://accounts.google.com" }),
        opts,
      ),
    ).toBeNull();
  });
});

describe("verifyGitHubIdentity", () => {
  const user = { id: 4242, name: "Ada Lovelace" };
  const emails = [
    { email: "other@example.com", primary: false, verified: true },
    { email: "ada@example.com", primary: true, verified: true },
  ];

  function stubGitHub(userBody: unknown, emailsBody: unknown) {
    return stubFetch(async (url, init) => {
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer gh-token",
      );
      if (url === "https://api.github.com/user") return jsonResponse(userBody);
      if (url === "https://api.github.com/user/emails") {
        return jsonResponse(emailsBody);
      }
      return jsonResponse({ message: "not found" }, 404);
    });
  }

  it("resolves the primary verified email", async () => {
    stubGitHub(user, emails);
    await expect(verifyGitHubIdentity("gh-token")).resolves.toEqual({
      sub: "4242",
      email: "ada@example.com",
      name: "Ada Lovelace",
    });
  });

  it("fails closed without a primary verified email", async () => {
    stubGitHub(user, [
      { email: "ada@example.com", primary: true, verified: false },
    ]);
    await expect(verifyGitHubIdentity("gh-token")).resolves.toBeNull();
    stubGitHub(user, "not-an-array");
    await expect(verifyGitHubIdentity("gh-token")).resolves.toBeNull();
    stubGitHub({ login: "ada" }, emails);
    await expect(verifyGitHubIdentity("gh-token")).resolves.toBeNull();
  });

  it("returns null on API failures", async () => {
    stubFetch(async () => jsonResponse({ message: "bad credentials" }, 401));
    await expect(verifyGitHubIdentity("gh-token")).resolves.toBeNull();
  });
});

describe("resolveOAuthIdentity", () => {
  it("requires the right token kind per provider", async () => {
    await expect(
      resolveOAuthIdentity("github", { idToken: "x" }, { clientId: "gh" }),
    ).resolves.toBeNull();
    await expect(
      resolveOAuthIdentity("google", { accessToken: "x" }, { clientId: "go" }),
    ).resolves.toBeNull();
  });
});

describe("redirect targets", () => {
  it("honors only relative next targets", () => {
    for (const next of ["/", "/apps", "/apps/shopfloor?tab=checks"]) {
      expect(isSafeNext(next)).toBe(true);
      expect(resolveNext(next)).toBe(next);
    }
    for (const next of [
      "https://evil.example/",
      "http://evil.example/phish",
      "//evil.example/",
      "/\\evil.example/",
      "",
      "apps",
      "javascript:alert(1)",
    ]) {
      expect(isSafeNext(next)).toBe(false);
      expect(resolveNext(next)).toBe("/");
    }
    expect(isSafeNext(null)).toBe(false);
    expect(isSafeNext(undefined)).toBe(false);
    expect(resolveNext(null)).toBe("/");
  });

  it("prefers NEXT_PUBLIC_SITE_URL over the request origin", () => {
    const request = new Request("https://fallback.example/api/x");
    expect(getOAuthRedirectUri(request, "github")).toBe(
      "https://fallback.example/api/auth/oauth/github/callback",
    );
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://byov.example///");
    expect(getOAuthRedirectUri(request, "github")).toBe(
      "https://byov.example/api/auth/oauth/github/callback",
    );
  });
});

describe("createSessionValue", () => {
  it("signs the contract payload with AUTH_SECRET", async () => {
    vi.stubEnv("AUTH_SECRET", "test-secret");
    const before = Math.floor(Date.now() / 1000);
    const value = await createSessionValue({
      sub: "sub-1",
      email: "ada@example.com",
      name: "Ada",
      provider: "google",
    });
    const [payloadSegment, signatureSegment] = value.split(".");
    expect(value.split(".")).toHaveLength(2);
    const payload =
      base64UrlDecodeJson<Record<string, unknown>>(payloadSegment!);
    expect(payload.sub).toBe("sub-1");
    expect(payload.email).toBe("ada@example.com");
    expect(payload.name).toBe("Ada");
    expect(payload.provider).toBe("google");
    expect(payload.iat).toBeGreaterThanOrEqual(before);
    expect(payload.exp).toBe((payload.iat as number) + 43200);
    // The signature is HMAC-SHA256 over the payload segment.
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("test-secret"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signature = Uint8Array.from(
      atob(signatureSegment!.replace(/-/g, "+").replace(/_/g, "/")),
      (char) => char.charCodeAt(0),
    );
    await expect(
      crypto.subtle.verify(
        "HMAC",
        key,
        signature.buffer as ArrayBuffer,
        new TextEncoder().encode(payloadSegment!),
      ),
    ).resolves.toBe(true);
  });

  it("omits an absent name and falls back with a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const value = await createSessionValue({
      sub: "sub-1",
      email: "ada@example.com",
      provider: "entra",
    });
    expect(value.split(".")).toHaveLength(2);
    expect(
      base64UrlDecodeJson<Record<string, unknown>>(value.split(".")[0]!),
    ).not.toHaveProperty("name");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("AUTH_SECRET"));
  });
});

describe("isEmailAllowed", () => {
  it("matches exact emails case-insensitively", () => {
    vi.stubEnv("AUTH_ALLOWED_EMAILS", "Ada@Example.com, grace@example.com");
    expect(isEmailAllowed("ada@example.com")).toBe(true);
    expect(isEmailAllowed("GRACE@EXAMPLE.COM")).toBe(true);
    expect(isEmailAllowed("other@example.com")).toBe(false);
  });

  it("matches domains and allows everything only when both lists are empty", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(isEmailAllowed("anyone@example.com")).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("AUTH_ALLOWED_EMAILS"),
    );
    vi.stubEnv("AUTH_ALLOWED_DOMAINS", "example.com");
    expect(isEmailAllowed("ada@example.com")).toBe(true);
    expect(isEmailAllowed("ada@other.example")).toBe(false);
    expect(isEmailAllowed("not-an-email")).toBe(false);
  });

  it("combines both lists with email match winning", () => {
    vi.stubEnv("AUTH_ALLOWED_EMAILS", "root@other.example");
    vi.stubEnv("AUTH_ALLOWED_DOMAINS", "example.com");
    expect(isEmailAllowed("root@other.example")).toBe(true);
    expect(isEmailAllowed("ada@example.com")).toBe(true);
    expect(isEmailAllowed("mallory@evil.example")).toBe(false);
  });
});

describe("GET /api/auth/oauth/[provider]/authorize", () => {
  const authorizeUrl = (provider: string, next?: string) =>
    `http://localhost:3014/api/auth/oauth/${provider}/authorize${
      next === undefined ? "" : `?next=${encodeURIComponent(next)}`
    }`;

  it("404s on unknown providers", async () => {
    const response = await authorizeGET(
      new Request(authorizeUrl("okta")),
      routeContext("okta"),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ ok: false });
  });

  it("400s when the provider is unconfigured", async () => {
    const response = await authorizeGET(
      new Request(authorizeUrl("google")),
      routeContext("google"),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false });
  });

  it("400s when the provider is configured but disabled", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "go-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "go-secret");
    const response = await authorizeGET(
      new Request(authorizeUrl("google")),
      routeContext("google"),
    );
    expect(response.status).toBe(400);
  });

  it("302s to the provider and stores state/verifier/next cookies", async () => {
    stubGoogleEnv();
    const response = await authorizeGET(
      new Request(authorizeUrl("google", "/apps")),
      routeContext("google"),
    );
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("Location")!);
    expect(location.origin + location.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    const state = location.searchParams.get("state");
    expect(state).toBeTruthy();
    // The state doubles as the OIDC nonce.
    expect(location.searchParams.get("nonce")).toBe(state);
    expect(location.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3014/api/auth/oauth/google/callback",
    );

    const setCookies = response.headers.getSetCookie();
    const names = ["oauth_state", "oauth_verifier", "oauth_next"];
    for (const name of names) {
      const header = setCookies.find((h) => h.startsWith(`${name}=`));
      expect(header).toBeDefined();
      expect(header).toContain("HttpOnly");
      expect(header).toContain("Path=/");
    }
    expect(cookiesFrom(response).get("oauth_state")).toBe(state);
    // The wire value is percent-encoded exactly once by Next's serializer.
    expect(decodeURIComponent(cookiesFrom(response).get("oauth_next")!)).toBe(
      "/apps",
    );
  });

  it("drops absolute next targets instead of storing them", async () => {
    stubGoogleEnv();
    for (const next of ["https://evil.example/", "//evil.example/"]) {
      const response = await authorizeGET(
        new Request(authorizeUrl("google", next)),
        routeContext("google"),
      );
      expect(response.status).toBe(302);
      expect(cookiesFrom(response).has("oauth_next")).toBe(false);
    }
    const missing = await authorizeGET(
      new Request(authorizeUrl("google")),
      routeContext("google"),
    );
    expect(cookiesFrom(missing).has("oauth_next")).toBe(false);
  });
});

describe("GET|POST /api/auth/oauth/[provider]/callback", () => {
  const callbackUrl = (provider: string, query = "") =>
    `http://localhost:3014/api/auth/oauth/${provider}/callback${query}`;

  async function startGoogleLogin(next = "/apps") {
    stubGoogleEnv();
    const started = await authorizeGET(
      new Request(
        `http://localhost:3014/api/auth/oauth/google/authorize?next=${encodeURIComponent(next)}`,
      ),
      routeContext("google"),
    );
    const cookies = cookiesFrom(started);
    return { state: cookies.get("oauth_state")!, cookies };
  }

  function finishGoogleLogin(
    state: string,
    cookies: Map<string, string>,
    query: string,
  ) {
    return callbackGET(
      new Request(callbackUrl("google", query), {
        headers: { cookie: cookieHeader(cookies) },
      }),
      routeContext("google"),
    );
  }

  it("404s on unknown providers", async () => {
    const response = await callbackGET(
      new Request(callbackUrl("okta", "?code=x&state=y")),
      routeContext("okta"),
    );
    expect(response.status).toBe(404);
  });

  it("fails closed on missing state, mismatched state and provider errors", async () => {
    stubGoogleEnv();
    const { state, cookies } = await startGoogleLogin();
    const cases: Array<[string, Map<string, string> | null]> = [
      [`?code=c&state=${state}`, null],
      [`?code=c`, cookies],
      [`?code=c&state=wrong-state`, cookies],
      [`?code=c&state=${state}&error=access_denied`, cookies],
    ];
    for (const [query, jar] of cases) {
      const headers: Record<string, string> = jar
        ? { cookie: cookieHeader(jar) }
        : {};
      const response = await callbackGET(
        new Request(callbackUrl("google", query), { headers }),
        routeContext("google"),
      );
      expect(response.headers.get("Location")).toBe(
        "http://localhost:3014/login?error=oauth-failed",
      );
      expect(
        response.headers
          .getSetCookie()
          .some((h) => h.startsWith("oauth_state=;")),
      ).toBe(true);
    }
  });

  it("redirects to oauth-failed when the code exchange fails", async () => {
    const { state, cookies } = await startGoogleLogin();
    stubFetch(async () => jsonResponse({ error: "invalid_grant" }, 400));
    const response = await finishGoogleLogin(
      state,
      cookies,
      `?code=bad&state=${state}`,
    );
    expect(response.headers.get("Location")).toBe(
      "http://localhost:3014/login?error=oauth-failed",
    );
  });

  it("sets the session cookie and redirects to next on success", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { state, cookies } = await startGoogleLogin(
      "/apps/shopfloor?tab=checks",
    );
    stubFetch(async (url) => {
      expect(url).toBe("https://oauth2.googleapis.com/token");
      return jsonResponse({ id_token: googleIdToken(state) });
    });
    const response = await finishGoogleLogin(
      state,
      cookies,
      `?code=auth-code&state=${state}`,
    );
    expect(response.headers.get("Location")).toBe(
      "http://localhost:3014/apps/shopfloor?tab=checks",
    );
    const setCookies = response.headers.getSetCookie();
    const session = setCookies.find((h) => h.startsWith("byov_session="));
    expect(session).toBeDefined();
    expect(session).toContain("HttpOnly");
    expect(session!.split(";")[0]!.length).toBeGreaterThan(40);
    for (const name of ["oauth_state", "oauth_verifier", "oauth_next"]) {
      expect(setCookies.some((h) => h.startsWith(`${name}=;`))).toBe(true);
    }
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining("AUTH_SECRET"),
    );
  });

  it("falls back to / without a next cookie", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stubGoogleEnv();
    const started = await authorizeGET(
      new Request("http://localhost:3014/api/auth/oauth/google/authorize"),
      routeContext("google"),
    );
    const cookies = cookiesFrom(started);
    const state = cookies.get("oauth_state")!;
    stubFetch(async () => jsonResponse({ id_token: googleIdToken(state) }));
    const response = await finishGoogleLogin(
      state,
      cookies,
      `?code=auth-code&state=${state}`,
    );
    expect(response.headers.get("Location")).toBe("http://localhost:3014/");
  });

  it("redirects to not-allowed for emails outside the allowlist", async () => {
    const { state, cookies } = await startGoogleLogin();
    vi.stubEnv("AUTH_ALLOWED_EMAILS", "someone-else@example.com");
    stubFetch(async () => jsonResponse({ id_token: googleIdToken(state) }));
    const response = await finishGoogleLogin(
      state,
      cookies,
      `?code=auth-code&state=${state}`,
    );
    expect(response.headers.get("Location")).toBe(
      "http://localhost:3014/login?error=not-allowed",
    );
    expect(
      response.headers.getSetCookie().some((h) => h.startsWith("byov_session=")),
    ).toBe(false);
  });

  it("accepts POST form callbacks (Apple form_post style)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    void warn;
    stubGoogleEnv();
    const started = await authorizeGET(
      new Request("http://localhost:3014/api/auth/oauth/google/authorize"),
      routeContext("google"),
    );
    const cookies = cookiesFrom(started);
    const state = cookies.get("oauth_state")!;
    stubFetch(async () => jsonResponse({ id_token: googleIdToken(state) }));
    const response = await callbackPOST(
      new Request(callbackUrl("google"), {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: cookieHeader(cookies),
        },
        body: new URLSearchParams({ code: "auth-code", state }).toString(),
      }),
      routeContext("google"),
    );
    expect(response.headers.get("Location")).toBe("http://localhost:3014/");
    expect(
      response.headers
        .getSetCookie()
        .some((h) => h.startsWith("byov_session=")),
    ).toBe(true);
  });

  it("completes a github login via /user + /user/emails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("GITHUB_CLIENT_ID", "gh-id");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "gh-secret");
    vi.stubEnv("AUTH_GITHUB_ENABLED", "true");
    vi.stubEnv("AUTH_SECRET", "test-secret");
    const started = await authorizeGET(
      new Request(
        "http://localhost:3014/api/auth/oauth/github/authorize?next=%2Fnodes",
      ),
      routeContext("github"),
    );
    expect(started.status).toBe(302);
    const cookies = cookiesFrom(started);
    const state = cookies.get("oauth_state")!;
    stubFetch(async (url) => {
      if (url === "https://github.com/login/oauth/access_token") {
        return jsonResponse({ access_token: "gh-access-token" });
      }
      if (url === "https://api.github.com/user") {
        return jsonResponse({ id: 99, name: "Ada" });
      }
      if (url === "https://api.github.com/user/emails") {
        return jsonResponse([
          { email: "ada@example.com", primary: true, verified: true },
        ]);
      }
      return jsonResponse({}, 404);
    });
    const response = await callbackGET(
      new Request(callbackUrl("github", `?code=c&state=${state}`), {
        headers: { cookie: cookieHeader(cookies) },
      }),
      routeContext("github"),
    );
    expect(response.headers.get("Location")).toBe(
      "http://localhost:3014/nodes",
    );
    expect(
      response.headers.getSetCookie().some((h) =>
        h.startsWith("byov_session="),
      ),
    ).toBe(true);
  });

  it("completes an apple login with a minted client_secret", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { pem } = await generateAppleKeyPem();
    vi.stubEnv("APPLE_CLIENT_ID", "com.example.signin");
    vi.stubEnv("APPLE_TEAM_ID", "TEAM123");
    vi.stubEnv("APPLE_KEY_ID", "KEY123");
    vi.stubEnv("APPLE_PRIVATE_KEY", pem);
    vi.stubEnv("AUTH_APPLE_ENABLED", "true");
    vi.stubEnv("AUTH_SECRET", "test-secret");
    const started = await authorizeGET(
      new Request("http://localhost:3014/api/auth/oauth/apple/authorize"),
      routeContext("apple"),
    );
    expect(started.status).toBe(302);
    const cookies = cookiesFrom(started);
    const state = cookies.get("oauth_state")!;
    let seenSecret = "";
    stubFetch(async (url, init) => {
      expect(url).toBe("https://appleid.apple.com/auth/token");
      seenSecret =
        new URLSearchParams(String(init?.body ?? "")).get("client_secret") ??
        "";
      return jsonResponse({
        id_token: makeIdToken({
          iss: "https://appleid.apple.com",
          aud: "com.example.signin",
          exp: futureExp(),
          nonce: state,
          sub: "apple-sub-7",
          email: "ada@example.com",
        }),
      });
    });
    const response = await callbackGET(
      new Request(callbackUrl("apple", `?code=c&state=${state}`), {
        headers: { cookie: cookieHeader(cookies) },
      }),
      routeContext("apple"),
    );
    expect(response.headers.get("Location")).toBe("http://localhost:3014/");
    expect(seenSecret.split(".")).toHaveLength(3);
  });
});
