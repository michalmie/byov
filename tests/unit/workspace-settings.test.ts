import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db");

import { query, queryOne } from "@/lib/db";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { listNodes } from "@/lib/control-plane";
import {
  defaultWorkspaceSettings,
  type WorkspaceSettings,
} from "@/lib/settings";
import {
  getWorkspaceSettings,
  saveWorkspaceSettings,
} from "@/lib/workspace-store";
import {
  GET as settingsGet,
  PUT as settingsPut,
} from "@/app/api/workspace/settings/route";

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

const SAMPLE_NODE = listNodes()[0].slug;

function draft(overrides: Partial<WorkspaceSettings> = {}): WorkspaceSettings {
  return {
    ...defaultWorkspaceSettings(),
    workspaceName: "Acme workspace",
    defaultNode: SAMPLE_NODE,
    ...overrides,
  };
}

describe("workspace settings store", () => {
  it("returns defaults when nothing is saved yet", async () => {
    await expect(getWorkspaceSettings()).resolves.toEqual(
      defaultWorkspaceSettings(),
    );
  });

  it("saves and normalizes valid settings", async () => {
    const result = await saveWorkspaceSettings(
      draft({ devZone: "  Dev.Example.COM ", tailnetDomain: "YAK.ts.net" }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.settings.workspaceName).toBe("Acme workspace");
    expect(result.settings.devZone).toBe("dev.example.com");
    expect(result.settings.tailnetDomain).toBe("yak.ts.net");
    await expect(getWorkspaceSettings()).resolves.toEqual(result.settings);
  });

  it("rejects an unknown default node with field errors", async () => {
    const result = await saveWorkspaceSettings(
      draft({ defaultNode: "no-such-node" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors.defaultNode).toBe("Choose one of the known nodes.");
    await expect(getWorkspaceSettings()).resolves.toEqual(
      defaultWorkspaceSettings(),
    );
  });

  it("rejects a blank workspace name", async () => {
    const result = await saveWorkspaceSettings(draft({ workspaceName: " " }));
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors.workspaceName).toBe("Give the workspace a name.");
  });
});

async function sessionRequest(
  url: string,
  init: { method?: string; body?: unknown } = {},
): Promise<NextRequest> {
  const session = await createSession({
    email: "ada@example.com",
    provider: "passwordless",
    role: "member",
  });
  return new NextRequest(url, {
    method: init.method ?? "GET",
    headers: new Headers({ cookie: `${SESSION_COOKIE_NAME}=${session}` }),
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

describe("workspace settings API", () => {
  it("requires a session", async () => {
    const response = await settingsGet(
      new NextRequest("http://localhost/api/workspace/settings"),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Sign in to manage the workspace.",
    });
  });

  it("reads and writes settings for any session", async () => {
    const before = await settingsGet(
      await sessionRequest("http://localhost/api/workspace/settings"),
    );
    expect(before.status).toBe(200);
    expect(await before.json()).toEqual({
      ok: true,
      data: defaultWorkspaceSettings(),
    });

    const saved = await settingsPut(
      await sessionRequest("http://localhost/api/workspace/settings", {
        method: "PUT",
        body: draft(),
      }),
    );
    expect(saved.status).toBe(200);
    const body = (await saved.json()) as {
      ok: boolean;
      data: WorkspaceSettings;
    };
    expect(body.data.workspaceName).toBe("Acme workspace");

    const invalid = await settingsPut(
      await sessionRequest("http://localhost/api/workspace/settings", {
        method: "PUT",
        body: draft({ defaultNode: "no-such-node" }),
      }),
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({
      ok: false,
      error: "The settings could not be saved.",
      errors: { defaultNode: "Choose one of the known nodes." },
    });
  });
});
