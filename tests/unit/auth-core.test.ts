import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  createSession,
  getAdminEmails,
  getAuthProviders,
  isAdminEmail,
  isEmailAllowed,
  issueMagicLinkToken,
  resolveRequestOrigin,
  resolveRole,
  sanitizeNextPath,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  shouldUseSecureCookies,
  verifyMagicLinkToken,
  verifySession,
} from "@/lib/auth";
import { checkRateLimit, issueOtp, verifyOtp } from "@/lib/auth-store";
import {
  getBootstrapEmail,
  resolveLoginRole,
} from "@/lib/auth-bootstrap";
import { isPublicPath } from "@/middleware";
import { sendMail } from "@/lib/auth-mail";
import { POST as otpRequest } from "@/app/api/auth/otp/request/route";
import { POST as otpVerify } from "@/app/api/auth/otp/verify/route";
import { POST as magicLinkRequest } from "@/app/api/auth/magic-link/request/route";
import { GET as magicLinkVerify } from "@/app/api/auth/magic-link/verify/route";
import {
  DELETE as sessionDelete,
  GET as sessionGet,
} from "@/app/api/auth/session/route";
import { GET as providersGet } from "@/app/api/auth/providers/route";

vi.mock("@/lib/auth-mail", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/auth-mail")>();
  return { ...original, sendMail: vi.fn() };
});

const sendMailMock = vi.mocked(sendMail);

// In-memory fake for the `auth_otps`, `auth_rate_limits` and
// `auth_bootstrap` tables: the real store modules run unmodified against
// it, so these tests exercise their SQL and semantics without a live DB.
vi.mock("@/lib/db", () => {
  interface OtpRow {
    code: string;
    expires_at: string;
    attempts: number;
  }
  const otps = new Map<string, OtpRow>();
  const hits = new Map<string, number[]>();
  let bootstrapEmail: unknown = null;
  let failDb = false;

  function norm(text: string): string {
    return text.replace(/\s+/g, " ").trim().toUpperCase();
  }

  async function query(
    text: string,
    params: unknown[] = [],
  ): Promise<Record<string, unknown>[]> {
    if (failDb) {
      throw new Error("fake db failure");
    }
    const sql = norm(text);
    const [p0, p1, p2] = params as [string, string, string];
    if (sql.startsWith("INSERT INTO AUTH_OTPS")) {
      otps.set(p0, { code: p1, expires_at: p2, attempts: 0 });
      return [];
    }
    if (sql.startsWith("UPDATE AUTH_OTPS SET ATTEMPTS")) {
      const entry = otps.get(p0);
      if (!entry) {
        return [];
      }
      entry.attempts += 1;
      return [{ attempts: entry.attempts }];
    }
    if (sql.startsWith("DELETE FROM AUTH_OTPS")) {
      otps.delete(p0);
      return [];
    }
    if (sql.startsWith("SELECT CODE, EXPIRES_AT, ATTEMPTS")) {
      const entry = otps.get(p0);
      return entry ? [{ ...entry }] : [];
    }
    if (sql.startsWith("DELETE FROM AUTH_RATE_LIMITS")) {
      const cutoff = new Date(p1).getTime();
      hits.set(p0, (hits.get(p0) ?? []).filter((at) => at > cutoff));
      return [];
    }
    if (sql.startsWith("SELECT COUNT(*)")) {
      const cutoff = new Date(p1).getTime();
      const count = (hits.get(p0) ?? []).filter((at) => at > cutoff).length;
      return [{ count }];
    }
    if (sql.startsWith("INSERT INTO AUTH_RATE_LIMITS")) {
      const list = hits.get(p0) ?? [];
      list.push(new Date(p1).getTime());
      hits.set(p0, list);
      return [];
    }
    if (sql.startsWith("SELECT ADMIN_EMAIL")) {
      return bootstrapEmail === null ? [] : [{ admin_email: bootstrapEmail }];
    }
    if (sql.startsWith("INSERT INTO AUTH_BOOTSTRAP")) {
      if (bootstrapEmail !== null) {
        return [];
      }
      bootstrapEmail = p0;
      return [{ admin_email: p0 }];
    }
    throw new Error(`fake db: unexpected SQL: ${text}`);
  }

  async function queryOne(
    text: string,
    params: unknown[] = [],
  ): Promise<Record<string, unknown> | null> {
    const rows = await query(text, params);
    return rows[0] ?? null;
  }

  return {
    query,
    queryOne,
    registerMigration: () => {},
    __resetFakeDb: () => {
      otps.clear();
      hits.clear();
      bootstrapEmail = null;
      failDb = false;
    },
    __seedBootstrapEmail: (value: unknown) => {
      bootstrapEmail = value;
    },
    __setFakeDbFailure: (value: boolean) => {
      failDb = value;
    },
  };
});

interface FakeDbControls {
  __resetFakeDb: () => void;
  __seedBootstrapEmail: (value: unknown) => void;
  __setFakeDbFailure: (value: boolean) => void;
}

async function fakeDb(): Promise<FakeDbControls> {
  return (await import("@/lib/db")) as unknown as FakeDbControls;
}

const savedEnv = { ...process.env };

function setEnv(vars: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearAuthEnv() {
  setEnv({
    AUTH_SECRET: "test-secret-for-unit-tests",
    AUTH_ALLOWED_EMAILS: undefined,
    AUTH_ALLOWED_DOMAINS: undefined,
    AUTH_ADMIN_EMAILS: undefined,
    AUTH_PASSWORDLESS_ENABLED: undefined,
    AUTH_MAGIC_LINK_ENABLED: undefined,
    AUTH_ENTRA_ENABLED: undefined,
    AUTH_GITHUB_ENABLED: undefined,
    AUTH_GOOGLE_ENABLED: undefined,
    AUTH_APPLE_ENABLED: undefined,
    NEXT_PUBLIC_SITE_URL: undefined,
  });
}

/** Session cookie value out of a login response's set-cookie header. */
function sessionCookieFrom(response: Response): string {
  const header = response.headers.get("set-cookie") ?? "";
  const match = header.match(/byov_session=([^;]+)/);
  if (!match?.[1]) {
    throw new Error("expected a byov_session cookie");
  }
  return decodeURIComponent(match[1]);
}

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  clearAuthEnv();
  (await fakeDb()).__resetFakeDb();
  sendMailMock.mockReset();
  sendMailMock.mockResolvedValue(undefined);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...savedEnv };
  vi.useRealTimers();
});

describe("sessions", () => {
  it("round-trips a signed session", async () => {
    const token = await createSession({
      email: "Ada@Example.com",
      provider: "passwordless",
    });
    expect(token).toMatch(/^[^.]+\.[^.\s]+$/);
    const payload = await verifySession(token);
    expect(payload).toMatchObject({
      sub: "ada@example.com",
      email: "ada@example.com",
      provider: "passwordless",
    });
    expect(payload?.exp).toBeGreaterThan(payload?.iat ?? 0);
  });

  it("rejects tampered payloads and signatures", async () => {
    const token = await createSession({
      email: "ada@example.com",
      provider: "github",
      name: "Ada",
    });
    const [encoded, signature] = token.split(".");
    const tamperedPayload = `${encoded.slice(0, -2)}xx.${signature}`;
    expect(await verifySession(tamperedPayload)).toBeNull();
    const tamperedSig = `${encoded}.${signature.slice(0, -2)}xx`;
    expect(await verifySession(tamperedSig)).toBeNull();
    expect(await verifySession("not-a-token")).toBeNull();
    expect(await verifySession("")).toBeNull();
  });

  it("rejects expired sessions", async () => {
    const token = await createSession({
      email: "ada@example.com",
      provider: "entra",
      ttlSec: -1,
    });
    expect(await verifySession(token)).toBeNull();
  });

  it("rejects tokens signed with a different secret", async () => {
    const token = await createSession({
      email: "ada@example.com",
      provider: "google",
    });
    setEnv({ AUTH_SECRET: "another-secret" });
    expect(await verifySession(token)).toBeNull();
  });

  it("uses the 12h HttpOnly Lax cookie attributes, Secure only in prod", () => {
    expect(sessionCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 43200,
      secure: false,
    });
  });

  it("drops Secure on plain-HTTP requests even in production", () => {
    setEnv({ NODE_ENV: "production", AUTH_COOKIE_SECURE: undefined });
    const request = new Request("http://100.124.103.80:34821/api/auth/otp/verify");
    expect(shouldUseSecureCookies(request)).toBe(false);
    expect(sessionCookieOptions(request)).toMatchObject({ secure: false });
  });

  it("keeps Secure on HTTPS requests", () => {
    setEnv({ NODE_ENV: "production", AUTH_COOKIE_SECURE: undefined });
    const request = new Request("https://byov.example.com/api/auth/otp/verify");
    expect(shouldUseSecureCookies(request)).toBe(true);
    expect(sessionCookieOptions(request)).toMatchObject({ secure: true });
  });

  it("trusts the forwarded proto behind a proxy", () => {
    setEnv({ NODE_ENV: "production", AUTH_COOKIE_SECURE: undefined });
    const httpsBehindProxy = new Request("http://10.0.0.5/api/auth/otp/verify", {
      headers: { "x-forwarded-proto": "https" },
    });
    expect(shouldUseSecureCookies(httpsBehindProxy)).toBe(true);
    const httpBehindProxy = new Request("https://proxy.internal/api/auth/otp/verify", {
      headers: { "x-forwarded-proto": "http" },
    });
    expect(shouldUseSecureCookies(httpBehindProxy)).toBe(false);
  });

  it("lets AUTH_COOKIE_SECURE pin the flag either way", () => {
    setEnv({ NODE_ENV: "production" });
    const http = new Request("http://100.124.103.80:34821/");
    const https = new Request("https://byov.example.com/");
    setEnv({ AUTH_COOKIE_SECURE: "true" });
    expect(shouldUseSecureCookies(http)).toBe(true);
    setEnv({ AUTH_COOKIE_SECURE: "false" });
    expect(shouldUseSecureCookies(https)).toBe(false);
  });

  it("falls back to NODE_ENV without a request", () => {
    setEnv({ AUTH_COOKIE_SECURE: undefined, NODE_ENV: "production" });
    expect(shouldUseSecureCookies()).toBe(true);
    expect(sessionCookieOptions()).toMatchObject({ secure: true });
    setEnv({ NODE_ENV: "test" });
    expect(shouldUseSecureCookies()).toBe(false);
  });

  it("round-trips the role and defaults to member", async () => {
    const admin = await createSession({
      email: "ada@example.com",
      provider: "passwordless",
      role: "admin",
    });
    expect((await verifySession(admin))?.role).toBe("admin");
    const member = await createSession({
      email: "ada@example.com",
      provider: "passwordless",
    });
    expect((await verifySession(member))?.role).toBe("member");
  });

  it("treats role-less legacy sessions as member", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const encoded = Buffer.from(
      JSON.stringify({
        sub: "ada@example.com",
        email: "ada@example.com",
        provider: "passwordless",
        iat: nowSec,
        exp: nowSec + 43200,
      }),
    ).toString("base64url");
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("test-secret-for-unit-tests"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(encoded),
    );
    const token = `${encoded}.${Buffer.from(signature).toString("base64url")}`;
    expect((await verifySession(token))?.role).toBe("member");
  });
});

describe("admin roles", () => {
  it("reads AUTH_ADMIN_EMAILS case-insensitively", () => {
    expect(getAdminEmails()).toEqual([]);
    setEnv({ AUTH_ADMIN_EMAILS: "Ada@Example.com, root@example.org" });
    expect(getAdminEmails()).toEqual(["ada@example.com", "root@example.org"]);
    expect(isAdminEmail("ADA@example.com")).toBe(true);
    expect(isAdminEmail("mallory@evil.com")).toBe(false);
  });

  it("resolveRole prefers configured admins, then the bootstrap holder", () => {
    expect(
      resolveRole("ada@example.com", {
        adminEmails: ["ada@example.com"],
        bootstrapEmail: null,
      }),
    ).toBe("admin");
    expect(
      resolveRole("Ada@Example.com", {
        adminEmails: [],
        bootstrapEmail: "ada@example.com",
      }),
    ).toBe("admin");
    expect(
      resolveRole("bob@example.com", {
        adminEmails: [],
        bootstrapEmail: "ada@example.com",
      }),
    ).toBe("member");
    expect(
      resolveRole("bob@example.com", { adminEmails: [], bootstrapEmail: null }),
    ).toBe("member");
  });
});

describe("bootstrap claim", () => {
  it("first login claims admin and persists the record", async () => {
    expect(await getBootstrapEmail()).toBeNull();
    expect(await resolveLoginRole("Ada@Example.com")).toBe("admin");
    expect(await getBootstrapEmail()).toBe("ada@example.com");
    // A later login for someone else sees the persisted claim.
    expect(await resolveLoginRole("bob@example.com")).toBe("member");
  });

  it("later logins are members while the holder stays admin", async () => {
    expect(await resolveLoginRole("ada@example.com")).toBe("admin");
    expect(await resolveLoginRole("bob@example.com")).toBe("member");
    expect(await resolveLoginRole("ADA@example.com")).toBe("admin");
    expect(await getBootstrapEmail()).toBe("ada@example.com");
  });

  it("uses AUTH_ADMIN_EMAILS without claiming the bootstrap", async () => {
    setEnv({ AUTH_ADMIN_EMAILS: "root@example.org" });
    expect(await resolveLoginRole("root@example.org")).toBe("admin");
    expect(await resolveLoginRole("ada@example.com")).toBe("member");
    expect(await getBootstrapEmail()).toBeNull();
  });

  it("ignores a malformed bootstrap record", async () => {
    (await fakeDb()).__seedBootstrapEmail("not-an-email");
    expect(await getBootstrapEmail()).toBeNull();
    (await fakeDb()).__seedBootstrapEmail(42);
    expect(await getBootstrapEmail()).toBeNull();
  });

  it("fails closed to member when the database is unreachable", async () => {
    (await fakeDb()).__setFakeDbFailure(true);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await resolveLoginRole("ada@example.com")).toBe("member");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("bootstrap admin record"),
    );
  });
});

describe("isEmailAllowed", () => {
  it("allows exact emails from AUTH_ALLOWED_EMAILS (case-insensitive)", () => {
    setEnv({ AUTH_ALLOWED_EMAILS: "Ada@Example.com, bob@example.org" });
    expect(isEmailAllowed("ada@example.com")).toBe(true);
    expect(isEmailAllowed("BOB@EXAMPLE.ORG")).toBe(true);
    expect(isEmailAllowed("mallory@example.com")).toBe(false);
  });

  it("allows domains from AUTH_ALLOWED_DOMAINS", () => {
    setEnv({ AUTH_ALLOWED_DOMAINS: "example.com" });
    expect(isEmailAllowed("ada@example.com")).toBe(true);
    expect(isEmailAllowed("ada@other.com")).toBe(false);
  });

  it("prefers the email list but still honors domains", () => {
    setEnv({
      AUTH_ALLOWED_EMAILS: "vip@other.com",
      AUTH_ALLOWED_DOMAINS: "example.com",
    });
    expect(isEmailAllowed("vip@other.com")).toBe(true);
    expect(isEmailAllowed("ada@example.com")).toBe(true);
    expect(isEmailAllowed("mallory@evil.com")).toBe(false);
  });

  it("allows everything with a warning when both lists are empty", () => {
    expect(isEmailAllowed("anyone@anywhere.test")).toBe(true);
  });

  it("denies everything else when a list is configured", () => {
    setEnv({ AUTH_ALLOWED_EMAILS: "ada@example.com" });
    expect(isEmailAllowed("ada@example.com")).toBe(true);
    expect(isEmailAllowed("ada@example.com.evil.com")).toBe(false);
    expect(isEmailAllowed("not-an-email")).toBe(false);
  });
});

describe("OTP codes", () => {
  it("issues a 6-digit code that verifies once", async () => {
    const { code } = await issueOtp("ada@example.com");
    expect(code).toMatch(/^\d{6}$/);
    expect(await verifyOtp("ADA@example.com", code)).toEqual({ ok: true });
    expect(await verifyOtp("ada@example.com", code)).toEqual({
      ok: false,
      reason: "missing",
    });
  });

  it("rejects wrong codes without consuming the real one", async () => {
    const { code } = await issueOtp("ada@example.com");
    expect(await verifyOtp("ada@example.com", "000000")).toEqual({
      ok: false,
      reason: "mismatch",
    });
    expect(await verifyOtp("ada@example.com", code)).toEqual({ ok: true });
  });

  it("rejects expired codes", async () => {
    const { code } = await issueOtp("ada@example.com", { ttlMs: -1 });
    expect(await verifyOtp("ada@example.com", code)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("locks the code after 5 wrong attempts", async () => {
    const { code } = await issueOtp("ada@example.com");
    for (let i = 0; i < 4; i += 1) {
      expect(await verifyOtp("ada@example.com", "000000")).toEqual({
        ok: false,
        reason: "mismatch",
      });
    }
    expect(await verifyOtp("ada@example.com", "000000")).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(await verifyOtp("ada@example.com", code)).toEqual({
      ok: false,
      reason: "missing",
    });
  });

  it("replaces the previous code when re-issued", async () => {
    const first = await issueOtp("ada@example.com");
    const second = await issueOtp("ada@example.com");
    expect(await verifyOtp("ada@example.com", first.code)).toEqual({
      ok: false,
      reason: "mismatch",
    });
    expect(await verifyOtp("ada@example.com", second.code)).toEqual({
      ok: true,
    });
  });
});

describe("magic-link tokens", () => {
  it("round-trips a stateless token", async () => {
    const token = await issueMagicLinkToken("Ada@Example.com");
    expect(token).toMatch(/^[^.]+\.[^.\s]+$/);
    expect(await verifyMagicLinkToken(token)).toEqual({
      email: "ada@example.com",
    });
  });

  it("rejects tampered tokens", async () => {
    const token = await issueMagicLinkToken("ada@example.com");
    const [encoded, signature] = token.split(".");
    expect(
      await verifyMagicLinkToken(`${encoded.slice(0, -2)}xx.${signature}`),
    ).toBeNull();
    expect(
      await verifyMagicLinkToken(`${encoded}.${signature.slice(0, -2)}xx`),
    ).toBeNull();
    expect(await verifyMagicLinkToken("bogus")).toBeNull();
  });

  it("rejects expired tokens", async () => {
    const token = await issueMagicLinkToken("ada@example.com", { ttlSec: -1 });
    expect(await verifyMagicLinkToken(token)).toBeNull();
  });
});

describe("rate limiter", () => {
  it("allows 5 hits per key per minute, then caps", async () => {
    for (let i = 0; i < 5; i += 1) {
      expect(await checkRateLimit("key-a")).toBe(true);
    }
    expect(await checkRateLimit("key-a")).toBe(false);
    expect(await checkRateLimit("key-b")).toBe(true);
  });

  it("resets after the window passes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    for (let i = 0; i < 5; i += 1) {
      expect(await checkRateLimit("window-key")).toBe(true);
    }
    expect(await checkRateLimit("window-key")).toBe(false);
    vi.setSystemTime(new Date("2026-01-01T00:01:01Z"));
    expect(await checkRateLimit("window-key")).toBe(true);
  });
});

describe("getAuthProviders", () => {
  it("defaults to passwordless + magic-link on, OAuth off", () => {
    expect(getAuthProviders()).toEqual([
      { id: "passwordless", label: "Passwordless code", enabled: true },
      { id: "magic-link", label: "Email sign-in link", enabled: true },
      { id: "entra", label: "Microsoft Entra ID", enabled: false },
      { id: "github", label: "GitHub", enabled: false },
      { id: "google", label: "Google", enabled: false },
      { id: "apple", label: "Apple", enabled: false },
    ]);
  });

  it("honors the AUTH_*_ENABLED flags", () => {
    setEnv({
      AUTH_PASSWORDLESS_ENABLED: "false",
      AUTH_MAGIC_LINK_ENABLED: "false",
      AUTH_ENTRA_ENABLED: "true",
      AUTH_GITHUB_ENABLED: "true",
      AUTH_GOOGLE_ENABLED: "1",
      AUTH_APPLE_ENABLED: "yes",
    });
    expect(getAuthProviders()).toEqual([
      { id: "passwordless", label: "Passwordless code", enabled: false },
      { id: "magic-link", label: "Email sign-in link", enabled: false },
      { id: "entra", label: "Microsoft Entra ID", enabled: true },
      { id: "github", label: "GitHub", enabled: true },
      { id: "google", label: "Google", enabled: true },
      { id: "apple", label: "Apple", enabled: true },
    ]);
  });
});

describe("sanitizeNextPath", () => {
  it("honors relative in-app paths", () => {
    expect(sanitizeNextPath("/apps/shopfloor-tickets")).toBe(
      "/apps/shopfloor-tickets",
    );
    expect(sanitizeNextPath("/settings?tab=nodes")).toBe("/settings?tab=nodes");
    expect(sanitizeNextPath("/")).toBe("/");
  });

  it("rejects open redirects and non-strings", () => {
    for (const next of [
      "https://evil.example.com",
      "//evil.example.com/phish",
      "javascript:alert(1)",
      "",
      "apps",
      "/\\evil.example.com",
      "/login\nSet-Cookie: x=1",
      null,
      undefined,
      42,
      {},
    ]) {
      expect(sanitizeNextPath(next)).toBe("/");
    }
  });
});

describe("isPublicPath", () => {
  it("leaves login, auth and API auth routes public", () => {
    for (const path of [
      "/login",
      "/auth/callback",
      "/api/auth/session",
      "/api/auth/otp/request",
      "/api/auth/oauth/github/authorize",
    ]) {
      expect(isPublicPath(path)).toBe(true);
    }
  });

  it("leaves framework and static-asset paths public", () => {
    for (const path of [
      "/_next/static/chunk.js",
      "/favicon.ico",
      "/icon.jpg",
      "/fonts/inter.woff2",
      "/sitemap.xml",
    ]) {
      expect(isPublicPath(path)).toBe(true);
    }
  });

  it("protects app pages and non-auth APIs", () => {
    for (const path of [
      "/",
      "/apps",
      "/apps/shopfloor-tickets",
      "/settings",
      "/api/dns-test",
      "/api/apps",
      "/login-page",
    ]) {
      expect(isPublicPath(path)).toBe(false);
    }
  });
});

describe("POST /api/auth/otp/request", () => {
  it("sends one email with both code and link, and answers ok", async () => {
    const response = await otpRequest(
      jsonRequest("http://localhost/api/auth/otp/request", {
        email: "ada@example.com",
        next: "/apps",
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const sent = sendMailMock.mock.calls[0]?.[0];
    expect(sent).toMatchObject({ to: "ada@example.com" });
    expect(sent?.text).toMatch(/sign-in code is \d{6}/);
    const code = String(sent?.text ?? "").match(/sign-in code is (\d{6})/)?.[1];
    expect(sent?.subject).toBe(`${code} is your BYOV sign-in code`);
    const link = String(sent?.text ?? "").match(/https?:\/\/\S+/)?.[0];
    expect(link).toContain("/api/auth/magic-link/verify?token=");
    expect(link).toContain(`next=${encodeURIComponent("/apps")}`);
  });

  it("sends a code-only email when the link method is off", async () => {
    setEnv({ AUTH_MAGIC_LINK_ENABLED: "false" });
    const response = await otpRequest(
      jsonRequest("http://localhost/api/auth/otp/request", {
        email: "ada@example.com",
      }),
    );
    expect(response.status).toBe(200);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const sent = sendMailMock.mock.calls[0]?.[0];
    expect(sent?.subject).toMatch(/^\d{6} is your BYOV sign-in code$/);
    expect(sent?.text).not.toContain("http");
  });

  it("answers ok without sending when the code method is off", async () => {
    setEnv({ AUTH_PASSWORDLESS_ENABLED: "false" });
    const response = await otpRequest(
      jsonRequest("http://localhost/api/auth/otp/request", {
        email: "ada@example.com",
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("answers ok without sending when the email is denied", async () => {
    setEnv({ AUTH_ALLOWED_EMAILS: "vip@example.com" });
    const response = await otpRequest(
      jsonRequest("http://localhost/api/auth/otp/request", {
        email: "mallory@evil.com",
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("rejects invalid emails and rate-limits repeats", async () => {
    const bad = await otpRequest(
      jsonRequest("http://localhost/api/auth/otp/request", { email: "nope" }),
    );
    expect(bad.status).toBe(400);

    for (let i = 0; i < 5; i += 1) {
      const response = await otpRequest(
        jsonRequest("http://localhost/api/auth/otp/request", {
          email: "ada@example.com",
        }),
      );
      expect(response.status).toBe(200);
    }
    const capped = await otpRequest(
      jsonRequest("http://localhost/api/auth/otp/request", {
        email: "ada@example.com",
      }),
    );
    expect(capped.status).toBe(429);
  });
});

describe("POST /api/auth/otp/verify", () => {
  it("sets the session cookie on a valid code", async () => {
    const { code } = await issueOtp("ada@example.com");
    const response = await otpVerify(
      jsonRequest("http://localhost/api/auth/otp/verify", {
        email: "ada@example.com",
        code,
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      user: { email: "ada@example.com" },
    });
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
    expect(setCookie).toContain("Max-Age=43200");
  });

  it("grants the configured admin role on verify", async () => {
    setEnv({ AUTH_ADMIN_EMAILS: "ada@example.com" });
    const { code } = await issueOtp("ada@example.com");
    const response = await otpVerify(
      jsonRequest("http://localhost/api/auth/otp/verify", {
        email: "ada@example.com",
        code,
      }),
    );
    expect(response.status).toBe(200);
    const payload = await verifySession(sessionCookieFrom(response));
    expect(payload?.role).toBe("admin");
  });

  it("first verified login claims bootstrap admin, later ones are members", async () => {
    const first = await issueOtp("ada@example.com");
    const firstResponse = await otpVerify(
      jsonRequest("http://localhost/api/auth/otp/verify", {
        email: "ada@example.com",
        code: first.code,
      }),
    );
    expect(
      (await verifySession(sessionCookieFrom(firstResponse)))?.role,
    ).toBe("admin");

    const second = await issueOtp("bob@example.com");
    const secondResponse = await otpVerify(
      jsonRequest("http://localhost/api/auth/otp/verify", {
        email: "bob@example.com",
        code: second.code,
      }),
    );
    expect(
      (await verifySession(sessionCookieFrom(secondResponse)))?.role,
    ).toBe("member");
    expect(await getBootstrapEmail()).toBe("ada@example.com");
  });

  it("rejects wrong codes with a generic 401", async () => {
    await issueOtp("ada@example.com");
    const response = await otpVerify(
      jsonRequest("http://localhost/api/auth/otp/verify", {
        email: "ada@example.com",
        code: "000000",
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Invalid or expired code.",
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("validates the request shape", async () => {
    const badEmail = await otpVerify(
      jsonRequest("http://localhost/api/auth/otp/verify", {
        email: "nope",
        code: "123456",
      }),
    );
    expect(badEmail.status).toBe(400);
    const badCode = await otpVerify(
      jsonRequest("http://localhost/api/auth/otp/verify", {
        email: "ada@example.com",
        code: "12",
      }),
    );
    expect(badCode.status).toBe(400);
  });
});

describe("magic-link routes", () => {
  it("emails one message with link and code, and consumes the link", async () => {
    const requestResponse = await magicLinkRequest(
      jsonRequest("http://localhost/api/auth/magic-link/request", {
        email: "ada@example.com",
        next: "/apps",
      }),
    );
    expect(requestResponse.status).toBe(200);
    expect(await requestResponse.json()).toEqual({ ok: true });
    expect(sendMailMock).toHaveBeenCalledTimes(1);

    const sent = sendMailMock.mock.calls[0]?.[0];
    const text = String(sent?.text ?? "");
    expect(text).toMatch(/sign-in code is \d{6}/);
    const code = text.match(/sign-in code is (\d{6})/)?.[1];
    expect(sent?.subject).toBe(`${code} is your BYOV sign-in code`);
    const link = text.match(/https?:\/\/\S+/)?.[0];
    expect(link).toBeDefined();
    const token = new URL(link ?? "").searchParams.get("token") ?? "";
    expect(token.length).toBeGreaterThan(0);

    const verifyResponse = await magicLinkVerify(
      new Request(
        `http://localhost/api/auth/magic-link/verify?token=${encodeURIComponent(token)}&next=${encodeURIComponent("/apps")}`,
      ),
    );
    expect(verifyResponse.status).toBe(307);
    expect(verifyResponse.headers.get("location")).toBe(
      "http://localhost/apps",
    );
    expect(verifyResponse.headers.get("set-cookie")).toContain(
      `${SESSION_COOKIE_NAME}=`,
    );
  });

  it("answers ok without sending when the email is denied", async () => {
    setEnv({ AUTH_ALLOWED_EMAILS: "vip@example.com" });
    const response = await magicLinkRequest(
      jsonRequest("http://localhost/api/auth/magic-link/request", {
        email: "mallory@evil.com",
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("redirects bad tokens to /login with an error", async () => {
    const response = await magicLinkVerify(
      new Request(
        "http://localhost/api/auth/magic-link/verify?token=bogus&next=https://evil.example.com",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?error=not-allowed",
    );
  });

  it("redirects to the public origin behind a proxy, never 0.0.0.0", async () => {
    const token = await issueMagicLinkToken("ada@example.com");
    const headers = {
      "x-forwarded-host": "byov.example.com",
      "x-forwarded-proto": "https",
    };

    const ok = await magicLinkVerify(
      new Request(
        `http://0.0.0.0:3014/api/auth/magic-link/verify?token=${encodeURIComponent(token)}&next=${encodeURIComponent("/apps")}`,
        { headers },
      ),
    );
    expect(ok.status).toBe(307);
    expect(ok.headers.get("location")).toBe("https://byov.example.com/apps");

    const bad = await magicLinkVerify(
      new Request(
        "http://0.0.0.0:3014/api/auth/magic-link/verify?token=bogus",
        { headers },
      ),
    );
    expect(bad.headers.get("location")).toBe(
      "https://byov.example.com/login?error=not-allowed",
    );
  });

  it("sends a link-only email when the code method is off", async () => {
    setEnv({ AUTH_PASSWORDLESS_ENABLED: "false" });
    const response = await magicLinkRequest(
      jsonRequest("http://localhost/api/auth/magic-link/request", {
        email: "ada@example.com",
      }),
    );
    expect(response.status).toBe(200);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const sent = sendMailMock.mock.calls[0]?.[0];
    expect(sent?.subject).toBe("Your BYOV sign-in link");
    expect(sent?.text).not.toMatch(/sign-in code is \d{6}/);
  });

  it("answers ok without sending when the link method is off", async () => {
    setEnv({ AUTH_MAGIC_LINK_ENABLED: "false" });
    const response = await magicLinkRequest(
      jsonRequest("http://localhost/api/auth/magic-link/request", {
        email: "ada@example.com",
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

describe("GET + DELETE /api/auth/session", () => {
  it("returns the current user, or null when signed out", async () => {
    const anonymous = await sessionGet(
      new NextRequest("http://localhost/api/auth/session"),
    );
    expect(await anonymous.json()).toEqual({ user: null });

    const token = await createSession({
      email: "ada@example.com",
      provider: "magic-link",
      role: "admin",
    });
    const signedIn = await sessionGet(
      new NextRequest("http://localhost/api/auth/session", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      }),
    );
    expect(await signedIn.json()).toEqual({
      user: {
        email: "ada@example.com",
        name: null,
        provider: "magic-link",
        role: "admin",
      },
    });
  });

  it("clears the cookie on logout", async () => {
    const response = await sessionDelete();
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("set-cookie")).toContain(
      `${SESSION_COOKIE_NAME}=`,
    );
  });
});

describe("resolveRequestOrigin", () => {
  function getRequest(url: string, headers?: Record<string, string>) {
    return new Request(url, { headers });
  }

  it("prefers NEXT_PUBLIC_SITE_URL and strips trailing slashes", () => {
    setEnv({ NEXT_PUBLIC_SITE_URL: "https://byov.example.com///" });
    expect(
      resolveRequestOrigin(
        getRequest("http://localhost/api/auth/otp/request"),
      ),
    ).toBe("https://byov.example.com");
  });

  it("rewrites a 0.0.0.0 request host to localhost", () => {
    expect(
      resolveRequestOrigin(
        getRequest("http://0.0.0.0:3014/api/auth/otp/request"),
      ),
    ).toBe("http://localhost:3014");
  });

  it("uses the forwarded host and proto behind a proxy", () => {
    expect(
      resolveRequestOrigin(
        getRequest("http://0.0.0.0:3014/api/auth/otp/request", {
          "x-forwarded-host": "byov.example.com",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toBe("https://byov.example.com");
  });

  it("falls back to the request origin when configured and forwarded values are junk", () => {
    setEnv({ NEXT_PUBLIC_SITE_URL: "not a url" });
    expect(
      resolveRequestOrigin(
        getRequest("http://localhost:3014/api/auth/otp/request", {
          "x-forwarded-host": "exa mple.com",
        }),
      ),
    ).toBe("http://localhost:3014");
  });

  it("never emails a magic link with a 0.0.0.0 host", async () => {
    const response = await magicLinkRequest(
      jsonRequest("http://0.0.0.0:3014/api/auth/magic-link/request", {
        email: "ada@example.com",
      }),
    );
    expect(response.status).toBe(200);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const sent = sendMailMock.mock.calls[0]?.[0];
    const link = String(sent?.text ?? "").match(/https?:\/\/\S+/)?.[0] ?? "";
    expect(link).toContain("http://localhost:3014/api/auth/magic-link/verify");
    expect(link).not.toContain("0.0.0.0");
    expect(String(sent?.html ?? "")).not.toContain("0.0.0.0");
  });
});

describe("GET /api/auth/providers", () => {
  it("returns the six methods with flags", async () => {
    setEnv({ AUTH_GITHUB_ENABLED: "true" });
    const response = await providersGet();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(6);
    expect(body).toContainEqual({
      id: "github",
      label: "GitHub",
      enabled: true,
    });
    expect(body).toContainEqual({
      id: "google",
      label: "Google",
      enabled: false,
    });
  });
});
