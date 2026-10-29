import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db");

import { query, queryOne } from "@/lib/db";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import {
  defaultAuthSettings,
  type AuthSettings,
} from "@/lib/auth-settings";
import type { UserRole } from "@/lib/users";
import {
  getWorkspaceAuthSettings,
  saveWorkspaceAuthSettings,
} from "@/lib/workspace-store";
import {
  GET as authSettingsGet,
  PUT as authSettingsPut,
} from "@/app/api/workspace/auth-settings/route";

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

function draft(overrides: Partial<AuthSettings> = {}): AuthSettings {
  return { ...defaultAuthSettings(), ...overrides };
}

describe("workspace auth settings store", () => {
  it("returns defaults when nothing is saved yet", async () => {
    await expect(getWorkspaceAuthSettings()).resolves.toEqual(
      defaultAuthSettings(),
    );
  });

  it("saves and normalizes the comma lists", async () => {
    const result = await saveWorkspaceAuthSettings(
      draft({
        allowedEmails: "  ada@example.com,,  bob@example.com ",
        allowedDomains: "Example.COM",
        providers: { entra: true, github: false, google: false, apple: false },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.settings.allowedEmails).toBe(
      "ada@example.com, bob@example.com",
    );
    expect(result.settings.allowedDomains).toBe("example.com");
    expect(result.settings.providers.entra).toBe(true);
    await expect(getWorkspaceAuthSettings()).resolves.toEqual(result.settings);
  });

  it("rejects bad emails and out-of-range lifetimes", async () => {
    const badEmail = await saveWorkspaceAuthSettings(
      draft({ allowedEmails: "not-an-email" }),
    );
    expect(badEmail.ok).toBe(false);
    if (!badEmail.ok) {
      expect(badEmail.errors.allowedEmails).toBe(
        '"not-an-email" is not a valid email address.',
      );
    }
    const badLifetime = await saveWorkspaceAuthSettings(
      draft({ sessionLifetimeHours: 1000 }),
    );
    expect(badLifetime.ok).toBe(false);
    if (!badLifetime.ok) {
      expect(badLifetime.errors.sessionLifetimeHours).toBe(
        "Enter a whole number of hours from 1 to 720.",
      );
    }
    await expect(getWorkspaceAuthSettings()).resolves.toEqual(
      defaultAuthSettings(),
    );
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

describe("workspace auth settings API", () => {
  it("is admin-only: 401 anonymous, 403 member", async () => {
    const anon = await authSettingsGet(
      new NextRequest("http://localhost/api/workspace/auth-settings"),
    );
    expect(anon.status).toBe(401);

    const member = await authSettingsGet(
      await sessionRequest("http://localhost/api/workspace/auth-settings"),
    );
    expect(member.status).toBe(403);
  });

  it("reads and writes as admin, with field errors on 400", async () => {
    const before = await authSettingsGet(
      await sessionRequest("http://localhost/api/workspace/auth-settings", {
        role: "admin",
      }),
    );
    expect(before.status).toBe(200);
    expect(await before.json()).toEqual({
      ok: true,
      data: defaultAuthSettings(),
    });

    const saved = await authSettingsPut(
      await sessionRequest("http://localhost/api/workspace/auth-settings", {
        method: "PUT",
        body: draft({ sessionLifetimeHours: 48 }),
        role: "admin",
      }),
    );
    expect(saved.status).toBe(200);
    const body = (await saved.json()) as { ok: boolean; data: AuthSettings };
    expect(body.data.sessionLifetimeHours).toBe(48);

    const invalid = await authSettingsPut(
      await sessionRequest("http://localhost/api/workspace/auth-settings", {
        method: "PUT",
        body: draft({ allowedEmails: "not-an-email" }),
        role: "admin",
      }),
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({
      ok: false,
      error: "The auth settings could not be saved.",
      errors: { allowedEmails: '"not-an-email" is not a valid email address.' },
    });
  });
});
