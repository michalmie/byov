import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  _resetAuthStoresForTests,
  checkRateLimit,
  createSession,
  getAdminEmails,
  getAuthProviders,
  isAdminEmail,
  isEmailAllowed,
  issueMagicLinkToken,
  issueOtp,
  resolveRole,
  sanitizeNextPath,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  verifyMagicLinkToken,
  verifyOtp,
  verifySession,
} from "@/lib/auth";
import {
  getBootstrapEmail,
  getBootstrapFilePath,
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
    // Fresh temp data dir per test: login routes resolve roles through the
    // bootstrap record, which must never touch the real ./data in tests.
    AUTH_DATA_DIR: mkdtempSync(join(tmpdir(), "byov-auth-test-")),
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

beforeEach(() => {
  clearAuthEnv();
  _resetAuthStoresForTests();
  sendMailMock.mockReset();
  sendMailMock.mockResolvedValue(undefined);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  const dataDir = process.env.AUTH_DATA_DIR;
  if (dataDir && dataDir.startsWith(tmpdir())) {
    rmSync(dataDir, { recursive: true, force: true });
  }
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
  it("first login claims admin and persists the record", () => {
    expect(getBootstrapEmail()).toBeNull();
    expect(resolveLoginRole("Ada@Example.com")).toBe("admin");
    expect(getBootstrapEmail()).toBe("ada@example.com");
    expect(readFileSync(getBootstrapFilePath(), "utf8")).toContain(
      "ada@example.com",
    );
  });

  it("later logins are members while the holder stays admin", () => {
    expect(resolveLoginRole("ada@example.com")).toBe("admin");
    expect(resolveLoginRole("bob@example.com")).toBe("member");
    expect(resolveLoginRole("ADA@example.com")).toBe("admin");
    expect(getBootstrapEmail()).toBe("ada@example.com");
  });

  it("uses AUTH_ADMIN_EMAILS without claiming the bootstrap", () => {
    setEnv({ AUTH_ADMIN_EMAILS: "root@example.org" });
    expect(resolveLoginRole("root@example.org")).toBe("admin");
    expect(resolveLoginRole("ada@example.com")).toBe("member");
    expect(getBootstrapEmail()).toBeNull();
  });

  it("ignores a corrupt bootstrap record", () => {
    writeFileSync(getBootstrapFilePath(), "not json{{{");
    expect(getBootstrapEmail()).toBeNull();
  });

  it("fails closed to member when the record is unwritable", () => {
    const blockFile = join(
      process.env.AUTH_DATA_DIR ?? tmpdir(),
      "block",
    );
    writeFileSync(blockFile, "in the way");
    setEnv({ AUTH_DATA_DIR: join(blockFile, "nested") });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(resolveLoginRole("ada@example.com")).toBe("member");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("bootstrap admin record"),
    );
    rmSync(blockFile, { force: true });
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
  it("issues a 6-digit code that verifies once", () => {
    const { code } = issueOtp("ada@example.com");
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyOtp("ADA@example.com", code)).toEqual({ ok: true });
    expect(verifyOtp("ada@example.com", code)).toEqual({
      ok: false,
      reason: "missing",
    });
  });

  it("rejects wrong codes without consuming the real one", () => {
    const { code } = issueOtp("ada@example.com");
    expect(verifyOtp("ada@example.com", "000000")).toEqual({
      ok: false,
      reason: "mismatch",
    });
    expect(verifyOtp("ada@example.com", code)).toEqual({ ok: true });
  });

  it("rejects expired codes", () => {
    const { code } = issueOtp("ada@example.com", { ttlMs: -1 });
    expect(verifyOtp("ada@example.com", code)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("locks the code after 5 wrong attempts", () => {
    const { code } = issueOtp("ada@example.com");
    for (let i = 0; i < 4; i += 1) {
      expect(verifyOtp("ada@example.com", "000000")).toEqual({
        ok: false,
        reason: "mismatch",
      });
    }
    expect(verifyOtp("ada@example.com", "000000")).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(verifyOtp("ada@example.com", code)).toEqual({
      ok: false,
      reason: "missing",
    });
  });

  it("replaces the previous code when re-issued", () => {
    const first = issueOtp("ada@example.com");
    const second = issueOtp("ada@example.com");
    expect(verifyOtp("ada@example.com", first.code)).toEqual({
      ok: false,
      reason: "mismatch",
    });
    expect(verifyOtp("ada@example.com", second.code)).toEqual({ ok: true });
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
  it("allows 5 hits per key per minute, then caps", () => {
    for (let i = 0; i < 5; i += 1) {
      expect(checkRateLimit("key-a")).toBe(true);
    }
    expect(checkRateLimit("key-a")).toBe(false);
    expect(checkRateLimit("key-b")).toBe(true);
  });

  it("resets after the window passes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    for (let i = 0; i < 5; i += 1) {
      expect(checkRateLimit("window-key")).toBe(true);
    }
    expect(checkRateLimit("window-key")).toBe(false);
    vi.setSystemTime(new Date("2026-01-01T00:01:01Z"));
    expect(checkRateLimit("window-key")).toBe(true);
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
    expect(sent?.subject).toContain("code and link");
    expect(sent?.text).toMatch(/sign-in code is \d{6}/);
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
    expect(sent?.subject).toBe("Your BYOV sign-in code");
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
    const { code } = issueOtp("ada@example.com");
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
    const { code } = issueOtp("ada@example.com");
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
    const first = issueOtp("ada@example.com");
    const firstResponse = await otpVerify(
      jsonRequest("http://localhost/api/auth/otp/verify", {
        email: "ada@example.com",
        code: first.code,
      }),
    );
    expect(
      (await verifySession(sessionCookieFrom(firstResponse)))?.role,
    ).toBe("admin");

    const second = issueOtp("bob@example.com");
    const secondResponse = await otpVerify(
      jsonRequest("http://localhost/api/auth/otp/verify", {
        email: "bob@example.com",
        code: second.code,
      }),
    );
    expect(
      (await verifySession(sessionCookieFrom(secondResponse)))?.role,
    ).toBe("member");
    expect(getBootstrapEmail()).toBe("ada@example.com");
  });

  it("rejects wrong codes with a generic 401", async () => {
    issueOtp("ada@example.com");
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
    expect(sent?.subject).toContain("code and link");
    const text = String(sent?.text ?? "");
    expect(text).toMatch(/sign-in code is \d{6}/);
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
