import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db");

import { query, queryOne } from "@/lib/db";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { listNodes } from "@/lib/control-plane";
import { type AppDraft } from "@/lib/apps";
import { listStacks } from "@/lib/stacks";
import {
  createWorkspaceApp,
  deleteWorkspaceApp,
  listWorkspaceApps,
} from "@/lib/workspace-store";
import {
  GET as appsGet,
  POST as appsPost,
} from "@/app/api/workspace/apps/route";
import { DELETE as appDelete } from "@/app/api/workspace/apps/[slug]/route";

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
const SHIPPED_STACK = listStacks()[0].slug;

function draft(overrides: Partial<AppDraft> = {}): AppDraft {
  return {
    name: "Rota Planner",
    slug: "",
    description: "",
    stack: SHIPPED_STACK,
    node: SAMPLE_NODE,
    ...overrides,
  };
}

describe("workspace apps store", () => {
  it("creates an app with a derived slug, Sandbox env and governed checks", async () => {
    const result = await createWorkspaceApp(draft());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.app.slug).toBe("rota-planner");
    expect(result.app.envs).toEqual([
      { name: "sandbox", node: SAMPLE_NODE, status: "pending" },
    ]);
    expect(result.app.checks.map((check) => check.name)).toEqual([
      "Unit tests",
      "Lint",
      "Production build",
      "DLP scan",
      "Dependency audit",
    ]);
    await expect(listWorkspaceApps()).resolves.toEqual([result.app]);
  });

  it("persists the assigned owner and GitHub login", async () => {
    const result = await createWorkspaceApp(
      draft({ owner: "Ada@Example.com", ownerGithub: "ada-dev" }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.app.owner).toBe("ada@example.com");
    expect(result.app.ownerGithub).toBe("ada-dev");
    await expect(listWorkspaceApps()).resolves.toEqual([result.app]);
  });

  it("rejects a malformed owner assignment", async () => {
    const badEmail = await createWorkspaceApp(draft({ owner: "nope" }));
    expect(badEmail.ok).toBe(false);
    if (!badEmail.ok) {
      expect(badEmail.errors.owner).toMatch(/owner's email/);
    }
    const badLogin = await createWorkspaceApp(draft({ ownerGithub: "ada_dev" }));
    expect(badLogin.ok).toBe(false);
    if (!badLogin.ok) {
      expect(badLogin.errors.ownerGithub).toMatch(/single hyphens/);
    }
    await expect(listWorkspaceApps()).resolves.toEqual([]);
  });

  it("rejects a duplicate slug", async () => {
    await createWorkspaceApp(draft());
    const result = await createWorkspaceApp(
      draft({ name: "Rota Planner 2", slug: "rota-planner" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors.slug).toBe("An app with this slug already exists.");
  });

  it("rejects an unknown node and an unknown stack", async () => {
    const badNode = await createWorkspaceApp(draft({ node: "no-node" }));
    expect(badNode.ok).toBe(false);
    if (!badNode.ok) {
      expect(badNode.errors.node).toBe("Choose one of the known nodes.");
    }
    const badStack = await createWorkspaceApp(draft({ stack: "no-stack" }));
    expect(badStack.ok).toBe(false);
    if (!badStack.ok) {
      expect(badStack.errors.stack).toBe(
        "Choose one of the known tech stacks.",
      );
    }
    await expect(listWorkspaceApps()).resolves.toEqual([]);
  });

  it("deletes workspace apps but never sample slugs", async () => {
    await createWorkspaceApp(draft());
    await expect(deleteWorkspaceApp("rota-planner")).resolves.toEqual({
      ok: true,
    });
    await expect(listWorkspaceApps()).resolves.toEqual([]);
    await expect(deleteWorkspaceApp("rota-planner")).resolves.toEqual({
      ok: false,
      notFound: true,
    });
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

function params(value: { slug: string }) {
  return { params: Promise.resolve(value) };
}

describe("workspace apps API", () => {
  it("requires a session", async () => {
    const response = await appsGet(
      new NextRequest("http://localhost/api/workspace/apps"),
    );
    expect(response.status).toBe(401);
  });

  it("creates, lists and deletes for any session", async () => {
    const created = await appsPost(
      await sessionRequest("http://localhost/api/workspace/apps", {
        method: "POST",
        body: draft(),
      }),
    );
    expect(created.status).toBe(201);

    const listed = await appsGet(
      await sessionRequest("http://localhost/api/workspace/apps"),
    );
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as { ok: boolean; data: unknown[] };
    expect(body.data).toHaveLength(1);

    const invalid = await appsPost(
      await sessionRequest("http://localhost/api/workspace/apps", {
        method: "POST",
        body: draft({ name: "Other App", node: "no-node" }),
      }),
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({
      ok: false,
      error: "The app could not be created.",
      errors: { node: "Choose one of the known nodes." },
    });

    const deleted = await appDelete(
      await sessionRequest(
        "http://localhost/api/workspace/apps/rota-planner",
        { method: "DELETE" },
      ),
      params({ slug: "rota-planner" }),
    );
    expect(deleted.status).toBe(200);

    const missing = await appDelete(
      await sessionRequest(
        "http://localhost/api/workspace/apps/rota-planner",
        { method: "DELETE" },
      ),
      params({ slug: "rota-planner" }),
    );
    expect(missing.status).toBe(404);
  });
});
