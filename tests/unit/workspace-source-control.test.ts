import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db");

import { query, queryOne } from "@/lib/db";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import {
  defaultSourceControlSettings,
  type SourceControlSettings,
} from "@/lib/source-control";
import type { UserRole } from "@/lib/users";
import {
  getWorkspaceSourceControlSettings,
  saveWorkspaceSourceControlSettings,
} from "@/lib/workspace-store";
import {
  GET as sourceControlGet,
  PUT as sourceControlPut,
} from "@/app/api/workspace/source-control/route";

// In-memory Postgres double: the store JSON-serializes each document and
// the fake parses on read, exactly like node-pg does for JSONB columns.
const tables: Record<string, Map<string, string>> = {
  workspace_nodes: new Map(),
  workspace_apps: new Map(),
  workspace_stacks: new Map(),
  workspace_users: new Map(),
  workspace_kv: new Map(),
};

function tableOf(sql: string): Map<string, string> {
  for (const name of Object.keys(tables)) {
    if (sql.includes(name)) {
      return tables[name];
    }
  }
  throw new Error(`unexpected SQL: ${sql}`);
}

async function fakeQuery(
  text: string,
  params: unknown[] = [],
): Promise<Array<Record<string, unknown>>> {
  const table = tableOf(text);
  const sql = text.trimStart().toUpperCase();
  if (sql.startsWith("SELECT")) {
    return [...table.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, value]) => ({ data: JSON.parse(value) }));
  }
  if (sql.startsWith("INSERT")) {
    table.set(String(params[0]), String(params[1]));
    return [];
  }
  if (sql.startsWith("UPDATE")) {
    table.set(String(params[1]), String(params[0]));
    return [];
  }
  if (sql.startsWith("DELETE")) {
    table.delete(String(params[0]));
    return [];
  }
  throw new Error(`unexpected SQL: ${text}`);
}

async function fakeQueryOne(
  text: string,
  params: unknown[] = [],
): Promise<Record<string, unknown> | null> {
  const table = tableOf(text);
  const value = table.get(String(params[0]));
  if (value === undefined) {
    return null;
  }
  const key = String(params[0]);
  return { slug: key, id: key, data: JSON.parse(value) };
}

const savedSecret = process.env.AUTH_SECRET;

beforeEach(() => {
  for (const table of Object.values(tables)) {
    table.clear();
  }
  vi.mocked(query).mockImplementation(async (text, params) => {
    return (await fakeQuery(text, params ?? [])) as never[];
  });
  vi.mocked(queryOne).mockImplementation(async (text, params) => {
    return (await fakeQueryOne(text, params ?? [])) as never;
  });
  process.env.AUTH_SECRET = "test-secret-for-unit-tests";
});

afterEach(() => {
  vi.restoreAllMocks();
  if (savedSecret === undefined) {
    delete process.env.AUTH_SECRET;
  } else {
    process.env.AUTH_SECRET = savedSecret;
  }
});

function draft(
  overrides: Partial<SourceControlSettings> = {},
): SourceControlSettings {
  return { ...defaultSourceControlSettings(), ...overrides };
}

describe("workspace source-control store", () => {
  it("returns defaults when nothing is saved yet", async () => {
    await expect(getWorkspaceSourceControlSettings()).resolves.toEqual(
      defaultSourceControlSettings(),
    );
  });

  it("saves and normalizes the taxonomy", async () => {
    const result = await saveWorkspaceSourceControlSettings(
      draft({
        connected: true,
        accountLogin: "  acme-labs ",
        repoPrefix: " BYOV- ",
        topics: " BYOV,, Internal-Tools ",
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settings.accountLogin).toBe("acme-labs");
    expect(result.settings.repoPrefix).toBe("byov-");
    expect(result.settings.topics).toBe("byov, internal-tools");
    expect(result.settings.defaultVisibility).toBe("private");
    await expect(getWorkspaceSourceControlSettings()).resolves.toEqual(
      result.settings,
    );
  });

  it("rejects public-by-default while public is disabled", async () => {
    const result = await saveWorkspaceSourceControlSettings(
      draft({ defaultVisibility: "public", allowPublicRepos: false }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.defaultVisibility).toMatch(/Public repos are disabled/);
    }
    await expect(getWorkspaceSourceControlSettings()).resolves.toEqual(
      defaultSourceControlSettings(),
    );
  });

  it("rejects a malformed login once connected", async () => {
    const result = await saveWorkspaceSourceControlSettings(
      draft({ connected: true, accountLogin: "-bad--login" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.accountLogin).toMatch(/single hyphens/);
    }
  });
});

async function sessionRequest(
  url: string,
  init: { method?: string; body?: unknown; role?: UserRole } = {},
): Promise<NextRequest> {
  const session = await createSession({
    email: "admin@example.com",
    provider: "passwordless",
    role: init.role ?? "member",
  });
  return new NextRequest(url, {
    method: init.method ?? "GET",
    headers: new Headers({ cookie: `${SESSION_COOKIE_NAME}=${session}` }),
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

describe("workspace source-control API", () => {
  it("is admin-only: 401 anonymous, 403 member", async () => {
    const anon = await sourceControlGet(
      new NextRequest("http://localhost/api/workspace/source-control"),
    );
    expect(anon.status).toBe(401);

    const member = await sourceControlGet(
      await sessionRequest("http://localhost/api/workspace/source-control"),
    );
    expect(member.status).toBe(403);
  });

  it("reads and writes as admin, with field errors on 400", async () => {
    const before = await sourceControlGet(
      await sessionRequest("http://localhost/api/workspace/source-control", {
        role: "admin",
      }),
    );
    expect(before.status).toBe(200);
    expect(await before.json()).toEqual({
      ok: true,
      data: defaultSourceControlSettings(),
    });

    const saved = await sourceControlPut(
      await sessionRequest("http://localhost/api/workspace/source-control", {
        method: "PUT",
        body: draft({
          connected: true,
          accountType: "organization",
          accountLogin: "acme-labs",
          repoPrefix: "byov-",
        }),
        role: "admin",
      }),
    );
    expect(saved.status).toBe(200);
    const body = (await saved.json()) as {
      ok: boolean;
      data: SourceControlSettings;
    };
    expect(body.data.accountLogin).toBe("acme-labs");
    expect(body.data.defaultVisibility).toBe("private");

    const invalid = await sourceControlPut(
      await sessionRequest("http://localhost/api/workspace/source-control", {
        method: "PUT",
        body: draft({ connected: true, accountLogin: "-bad" }),
        role: "admin",
      }),
    );
    expect(invalid.status).toBe(400);
    const invalidBody = (await invalid.json()) as {
      ok: boolean;
      errors: Record<string, string>;
    };
    expect(invalidBody.ok).toBe(false);
    expect(invalidBody.errors.accountLogin).toMatch(/single hyphens/);
  });
});
