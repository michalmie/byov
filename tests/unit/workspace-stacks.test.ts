import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db");

import { query, queryOne } from "@/lib/db";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import {
  defaultStackDraft,
  listStacks,
  type StackDraft,
} from "@/lib/stacks";
import {
  createWorkspaceStack,
  deleteWorkspaceStack,
  listWorkspaceStacks,
  updateWorkspaceStack,
} from "@/lib/workspace-store";
import {
  GET as stacksGet,
  POST as stacksPost,
} from "@/app/api/workspace/stacks/route";
import {
  DELETE as stackDelete,
  PUT as stackPut,
} from "@/app/api/workspace/stacks/[slug]/route";

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

const SHIPPED_SLUG = listStacks()[0].slug;

function draft(overrides: Partial<StackDraft> = {}): StackDraft {
  return {
    ...defaultStackDraft(),
    name: "Htmx Service",
    tagline: "Server-rendered HTML with htmx.",
    stack: [{ category: "frontend", label: "Framework", value: "htmx" }],
    ...overrides,
  };
}

describe("workspace stacks store", () => {
  it("creates a stack with the five governed gates", async () => {
    const result = await createWorkspaceStack(draft());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.stack.slug).toBe("htmx-service");
    expect(result.stack.checks.map((check) => check.name)).toEqual([
      "Unit tests",
      "Lint",
      "Production build",
      "DLP scan",
      "Dependency audit",
    ]);
    expect(result.stack.starter.ref).toBe("custom:htmx-service");
    await expect(listWorkspaceStacks()).resolves.toEqual([result.stack]);
  });

  it("rejects a draft without layers", async () => {
    const result = await createWorkspaceStack(draft({ stack: [] }));
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors.stack).toBe(
      "Add at least one stack layer with a label and a value.",
    );
    await expect(listWorkspaceStacks()).resolves.toEqual([]);
  });

  it("updates a custom stack without changing the slug", async () => {
    const created = await createWorkspaceStack(draft());
    expect(created.ok).toBe(true);
    const result = await updateWorkspaceStack("htmx-service", {
      ...draft(),
      name: "Htmx Service v2",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.stack.slug).toBe("htmx-service");
    expect(result.stack.name).toBe("Htmx Service v2");
    expect(result.stack.starter.ref).toBe("custom:htmx-service");
  });

  it("creates a stack targeting vercel nodes", async () => {
    const result = await createWorkspaceStack(draft({ nodes: ["vercel"] }));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.stack.nodes).toEqual(["vercel"]);
  });

  it("rejects unknown node kinds and lists the supported ones", async () => {
    const result = await createWorkspaceStack(
      draft({ nodes: ["kubernetes"] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors.nodes).toBe("Supported node kinds: coolify, vercel.");
  });

  it("never updates or deletes shipped stacks", async () => {
    await expect(
      updateWorkspaceStack(SHIPPED_SLUG, draft()),
    ).resolves.toEqual({ ok: false, notFound: true });
    await expect(deleteWorkspaceStack(SHIPPED_SLUG)).resolves.toEqual({
      ok: false,
      notFound: true,
    });
  });

  it("deletes custom stacks and reports unknown slugs", async () => {
    await createWorkspaceStack(draft());
    await expect(deleteWorkspaceStack("htmx-service")).resolves.toEqual({
      ok: true,
    });
    await expect(listWorkspaceStacks()).resolves.toEqual([]);
    await expect(deleteWorkspaceStack("htmx-service")).resolves.toEqual({
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
    role: "admin",
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

describe("workspace stacks API", () => {
  it("requires a session", async () => {
    const response = await stacksGet(
      new NextRequest("http://localhost/api/workspace/stacks"),
    );
    expect(response.status).toBe(401);
  });

  it("creates, updates and deletes customs for admins", async () => {
    const created = await stacksPost(
      await sessionRequest("http://localhost/api/workspace/stacks", {
        method: "POST",
        body: draft(),
      }),
    );
    expect(created.status).toBe(201);

    const invalid = await stacksPost(
      await sessionRequest("http://localhost/api/workspace/stacks", {
        method: "POST",
        body: draft({ name: "" }),
      }),
    );
    expect(invalid.status).toBe(400);
    const invalidBody = (await invalid.json()) as {
      ok: boolean;
      errors: Record<string, string>;
    };
    expect(invalidBody.errors.name).toBe("Give the stack a name.");

    const updated = await stackPut(
      await sessionRequest(
        "http://localhost/api/workspace/stacks/htmx-service",
        { method: "PUT", body: draft({ tagline: "New tagline." }) },
      ),
      params({ slug: "htmx-service" }),
    );
    expect(updated.status).toBe(200);

    const shipped = await stackPut(
      await sessionRequest(
        `http://localhost/api/workspace/stacks/${SHIPPED_SLUG}`,
        { method: "PUT", body: draft() },
      ),
      params({ slug: SHIPPED_SLUG }),
    );
    expect(shipped.status).toBe(404);

    const deleted = await stackDelete(
      await sessionRequest(
        "http://localhost/api/workspace/stacks/htmx-service",
        { method: "DELETE" },
      ),
      params({ slug: "htmx-service" }),
    );
    expect(deleted.status).toBe(200);
  });
});
