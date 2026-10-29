import { afterEach, beforeEach, describe, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  migrate: vi.fn(),
  registerMigration: vi.fn(),
  getMigrations: vi.fn(() => []),
  getDatabaseUrl: vi.fn(() => "postgres://localhost/test"),
  getPool: vi.fn(),
  closePool: vi.fn(),
}));

import { NextRequest } from "next/server";
import { query, queryOne } from "@/lib/db";
import { isMachineApiPath } from "@/middleware";
import {
  authenticateApiRequest,
  requireApiAuth,
  requireTokenManager,
} from "@/lib/api-auth";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { issueToken } from "@/lib/api-tokens";

const mockQuery = vi.mocked(query);
const mockQueryOne = vi.mocked(queryOne);

interface FakeTokenRow {
  id: string;
  name: string;
  tokenHash: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/** In-memory `api_tokens` table backing the mocked `query`/`queryOne`. */
const tokens = new Map<string, FakeTokenRow>();

/** Mirror `pg`: TIMESTAMPTZ columns arrive as Dates. */
function toPgRow(row: FakeTokenRow) {
  return {
    id: row.id,
    name: row.name,
    tokenHash: row.tokenHash,
    createdAt: new Date(row.createdAt),
    lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt) : null,
    revokedAt: row.revokedAt ? new Date(row.revokedAt) : null,
  };
}

async function fakeQuery(
  text: string,
  params: unknown[],
): Promise<unknown[]> {
  if (text.includes("FROM api_tokens")) {
    if (text.startsWith("SELECT 1")) {
      return tokens.size > 0 ? [{ one: 1 }] : [];
    }
    if (text.includes("WHERE id = $1")) {
      const row = tokens.get(String(params[0]));
      return row ? [toPgRow(row)] : [];
    }
    return [...tokens.values()]
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) ||
          a.id.localeCompare(b.id),
      )
      .map(toPgRow);
  }
  if (text.startsWith("INSERT INTO api_tokens")) {
    const [id, name, tokenHash, createdAt] = params as [
      string,
      string,
      string,
      string,
    ];
    tokens.set(id, {
      id,
      name,
      tokenHash,
      createdAt,
      lastUsedAt: null,
      revokedAt: null,
    });
    return [];
  }
  if (text.startsWith("UPDATE api_tokens SET last_used_at")) {
    const [lastUsedAt, id] = params as [string, string];
    const row = tokens.get(id);
    if (row) {
      row.lastUsedAt = lastUsedAt;
    }
    return [];
  }
  if (text.startsWith("UPDATE api_tokens SET revoked_at")) {
    const [revokedAt, id] = params as [string, string];
    const row = tokens.get(id);
    if (row) {
      row.revokedAt = revokedAt;
    }
    return [];
  }
  throw new Error(`unexpected SQL in fake: ${text}`);
}

const savedEnv = { ...process.env };

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-for-unit-tests";
  tokens.clear();
  mockQuery.mockReset();
  mockQueryOne.mockReset();
  mockQuery.mockImplementation(async (text: string, params?: unknown[]) => {
    return fakeQuery(text, params ?? []);
  });
  mockQueryOne.mockImplementation(async (text: string, params?: unknown[]) => {
    const rows = await fakeQuery(text, params ?? []);
    return rows.length > 0 ? rows[0] : null;
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
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
  it("accepts a valid Bearer [REDACTED]", async () => {
    const { info, token } = await issueToken("cli");
    const auth = await authenticateApiRequest(
      request({ authorization: `Bearer ${token}` }),
    );
    expect(auth?.kind).toBe("token");
    expect(auth?.kind === "token" && auth.token.id).toBe(info.id);
  });

  it("rejects invalid Bearer [REDACTED] without falling back to sessions", async () => {
    const auth = await authenticateApiRequest(
      request({
        authorization: "Bearer [REDACTED]",
        cookie: await sessionCookie("admin"),
      }),
    );
    expect(auth).toBeNull();
  });

  it("falls back to the session cookie without a Bearer [REDACTED]", async () => {
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

  it("500s when the token lookup fails, without leaking internals", async () => {
    mockQueryOne.mockImplementation(async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
    });
    const bearer = request({
      authorization: "Bearer byov_abcdefghijkl_s3cr3t",
    });
    const auth = await requireApiAuth(bearer);
    expect(auth instanceof Response && auth.status).toBe(500);
    const manager = await requireTokenManager(bearer);
    expect(manager instanceof Response && manager.status).toBe(500);
    const body = (await (manager as Response).json()) as {
      ok: boolean;
      error: string;
    };
    expect(body.ok).toBe(false);
    expect(body.error).not.toContain("ECONNREFUSED");
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
