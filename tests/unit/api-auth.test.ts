import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { isMachineApiPath } from "@/middleware";
import {
  authenticateApiRequest,
  requireApiAuth,
  requireTokenManager,
} from "@/lib/api-auth";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { issueToken } from "@/lib/api-tokens";

const savedEnv = { ...process.env };

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-for-unit-tests";
  process.env.BYOV_DATA_DIR = mkdtempSync(join(tmpdir(), "byov-apiauth-test-"));
  delete process.env.AUTH_DATA_DIR;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  const dataDir = process.env.BYOV_DATA_DIR;
  if (dataDir && dataDir.startsWith(tmpdir())) {
    rmSync(dataDir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
  process.env = { ...savedEnv };
});

async function sessionCookie(role: "admin" | "member"): Promise<string> {
  const value = await createSession({
    email: `${role}@example.com`,
    provider: "passwordless",
    role,
  });
  return `${SESSION_COOKIE_NAME}=${value}`;
}

function request(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/v1/apps", { headers });
}

describe("authenticateApiRequest", () => {
  it("accepts a valid Bearer token", async () => {
    const { info, token } = await issueToken("cli");
    const auth = await authenticateApiRequest(
      request({ authorization: `Bearer ${token}` }),
    );
    expect(auth?.kind).toBe("token");
    expect(auth?.kind === "token" && auth.token.id).toBe(info.id);
  });

  it("rejects invalid Bearer tokens without falling back to sessions", async () => {
    const auth = await authenticateApiRequest(
      request({
        authorization: "Bearer byov_zzzzzzzzzzzz_s3cr3t",
        cookie: await sessionCookie("admin"),
      }),
    );
    expect(auth).toBeNull();
  });

  it("falls back to the session cookie without a Bearer token", async () => {
    const auth = await authenticateApiRequest(
      request({ cookie: await sessionCookie("member") }),
    );
    expect(auth).toEqual({
      kind: "session",
      email: "member@example.com",
      role: "member",
    });
  });

  it("returns null when signed out", async () => {
    expect(await authenticateApiRequest(request())).toBeNull();
    expect(
      await authenticateApiRequest(request({ authorization: "Basic abc" })),
    ).toBeNull();
  });
});

describe("requireApiAuth / requireTokenManager", () => {
  it("401s signed-out requests", async () => {
    const auth = await requireApiAuth(request());
    expect(auth instanceof Response && auth.status).toBe(401);
    const manager = await requireTokenManager(request());
    expect(manager instanceof Response && manager.status).toBe(401);
  });

  it("lets tokens and admins manage tokens, 403s members", async () => {
    const { token } = await issueToken("cli");
    const viaToken = await requireTokenManager(
      request({ authorization: `Bearer ${token}` }),
    );
    expect(viaToken instanceof Response ? viaToken.status : "ok").toBe("ok");

    const viaAdmin = await requireTokenManager(
      request({ cookie: await sessionCookie("admin") }),
    );
    expect(viaAdmin instanceof Response ? viaAdmin.status : "ok").toBe("ok");

    const viaMember = await requireTokenManager(
      request({ cookie: await sessionCookie("member") }),
    );
    expect(viaMember instanceof Response && viaMember.status).toBe(403);
  });
});

describe("isMachineApiPath", () => {
  it("matches /api/v1 paths only", () => {
    expect(isMachineApiPath("/api/v1")).toBe(true);
    expect(isMachineApiPath("/api/v1/apps")).toBe(true);
    expect(isMachineApiPath("/api/v1/apps/rota/envs")).toBe(true);
    expect(isMachineApiPath("/api/auth/session")).toBe(false);
    expect(isMachineApiPath("/api/dns-test")).toBe(false);
    expect(isMachineApiPath("/api/v10/apps")).toBe(false);
    expect(isMachineApiPath("/apps")).toBe(false);
  });
});
