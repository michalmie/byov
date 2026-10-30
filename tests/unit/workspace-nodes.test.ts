import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db");

import { query, queryOne } from "@/lib/db";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { buildApp } from "@/lib/apps";
import type { NodeDraft } from "@/lib/settings";
import {
  createWorkspaceNode,
  deleteWorkspaceNode,
  listWorkspaceNodes,
  updateWorkspaceNode,
} from "@/lib/workspace-store";
import {
  GET as nodesGet,
  POST as nodesPost,
} from "@/app/api/workspace/nodes/route";
import {
  DELETE as nodeDelete,
  PUT as nodePut,
} from "@/app/api/workspace/nodes/[slug]/route";

// In-memory Postgres double: the store JSON-serializes each document and
// the fake parses on read, exactly like node-pg does for JSONB columns.
const tables: Record<string, Map<string, string>> = {
  workspace_nodes: new Map(),
  workspace_apps: new Map(),
  workspace_stacks: new Map(),
  workspace_users: new Map(),
  workspace_kv: new Map(),
  workspace_node_credentials: new Map(),
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
    if (text.includes("workspace_node_credentials")) {
      return [...table.keys()].map((slug) => ({ slug }));
    }
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
  if (text.includes("workspace_node_credentials")) {
    return { ciphertext: value };
  }
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

const DRAFT: NodeDraft = {
  name: "Lab 01",
  kind: "Coolify",
  location: "Berlin",
  endpoint: "https://coolify.example.com",
  domainZone: "",
  tailnetHost: "",
};

describe("workspace nodes store", () => {
  it("lists no nodes on an empty workspace", async () => {
    await expect(listWorkspaceNodes()).resolves.toEqual([]);
  });

  it("creates a node with a derived slug and pending status", async () => {
    const result = await createWorkspaceNode(DRAFT);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.node.slug).toBe("lab-01");
    expect(result.node.status).toBe("pending");
    await expect(listWorkspaceNodes()).resolves.toEqual([result.node]);
  });

  it("saves the API token server-side and only exposes hasApiToken", async () => {
    const result = await createWorkspaceNode({
      ...DRAFT,
      apiToken: "super-secret-token-value",
    });
    expect(result.ok).toBe(true);
    const listed = await listWorkspaceNodes();
    expect(listed[0]?.hasApiToken).toBe(true);
    expect(JSON.stringify(listed)).not.toContain("super-secret-token-value");
    const stored = tables.workspace_node_credentials.get("lab-01") ?? "";
    expect(stored).not.toContain("super-secret-token-value");
    // Blank update keeps the token; explicit clear removes it.
    const kept = await updateWorkspaceNode("lab-01", { ...DRAFT, apiToken: "" });
    expect(kept.ok && kept.node.hasApiToken).toBe(true);
    const cleared = await updateWorkspaceNode("lab-01", {
      ...DRAFT,
      apiToken: "",
      clearApiToken: true,
    });
    expect(cleared.ok && cleared.node.hasApiToken).toBeFalsy();
  });

  it("marks the node healthy when the create-time token test passes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 200, text: async () => "[]" })),
    );
    try {
      const result = await createWorkspaceNode({
        ...DRAFT,
        apiToken: "working-token",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.node.status).toBe("healthy");
      }
      expect((await listWorkspaceNodes())[0]?.status).toBe("healthy");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("writes use $1-style parameters, never interpolation", async () => {
    await createWorkspaceNode(DRAFT);
    const write = vi
      .mocked(query)
      .mock.calls.find(([text]) => text.includes("INSERT"));
    expect(write).toBeDefined();
    expect(write?.[0]).toContain("$1");
    expect(write?.[1]).toEqual([
      "lab-01",
      expect.stringContaining("lab-01"),
    ]);
  });

  it("rejects an invalid draft with field errors and no insert", async () => {
    const result = await createWorkspaceNode({ ...DRAFT, name: "  " });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors.name).toBe("Give the node a name.");
    await expect(listWorkspaceNodes()).resolves.toEqual([]);
  });

  it("rejects a duplicate node name", async () => {
    await createWorkspaceNode(DRAFT);
    const result = await createWorkspaceNode({ ...DRAFT, location: "Paris" });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors.name).toBe("A node with this name already exists.");
  });

  it("creates a Vercel node with a derived slug and pending status", async () => {
    const result = await createWorkspaceNode({ ...DRAFT, kind: "Vercel" });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.node.slug).toBe("lab-01");
    expect(result.node.kind).toBe("Vercel");
    expect(result.node.status).toBe("pending");
    await expect(listWorkspaceNodes()).resolves.toEqual([result.node]);
  });

  it("rejects an unknown kind with field errors and no insert", async () => {
    const result = await createWorkspaceNode({
      ...DRAFT,
      kind: "Kubernetes",
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors.kind).toMatch(/supported/i);
    await expect(listWorkspaceNodes()).resolves.toEqual([]);
  });

  it("updates a node to the Vercel kind and keeps the status", async () => {
    const created = await createWorkspaceNode(DRAFT);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const result = await updateWorkspaceNode("lab-01", {
      ...DRAFT,
      kind: "Vercel",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.node.slug).toBe("lab-01");
    expect(result.node.kind).toBe("Vercel");
    expect(result.node.status).toBe("pending");
  });

  it("rejects updating a node to an unknown kind", async () => {
    const created = await createWorkspaceNode(DRAFT);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const result = await updateWorkspaceNode("lab-01", {
      ...DRAFT,
      kind: "Kubernetes",
    });
    expect(result).toEqual({
      ok: false,
      errors: expect.objectContaining({ kind: expect.stringMatching(/supported/i) }),
    });
  });

  it("updates by slug without changing the slug and keeps the status", async () => {
    const created = await createWorkspaceNode(DRAFT);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const result = await updateWorkspaceNode("lab-01", {
      ...DRAFT,
      name: "Lab 02",
      endpoint: "",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.node.slug).toBe("lab-01");
    expect(result.node.name).toBe("Lab 02");
    expect(result.node.status).toBe("pending");
    expect(result.node.endpoint).toBeUndefined();
  });

  it("reports notFound when updating an unknown slug", async () => {
    const result = await updateWorkspaceNode("missing", DRAFT);
    expect(result).toEqual({ ok: false, notFound: true });
  });

  it("deletes an unpinned node and reports unknown slugs", async () => {
    await createWorkspaceNode(DRAFT);
    await expect(deleteWorkspaceNode("lab-01")).resolves.toEqual({
      ok: true,
    });
    await expect(listWorkspaceNodes()).resolves.toEqual([]);
    await expect(deleteWorkspaceNode("lab-01")).resolves.toEqual({
      ok: false,
      notFound: true,
    });
  });

  it("refuses to delete a node with pinned environments", async () => {
    const created = await createWorkspaceNode(DRAFT);
    expect(created.ok).toBe(true);
    const app = buildApp(
      {
        name: "Pinned",
        slug: "pinned",
        description: "",
        stack: "",
        node: "lab-01",
      },
      [],
    );
    tables.workspace_apps.set("pinned", JSON.stringify(app));
    const result = await deleteWorkspaceNode("lab-01");
    expect(result.ok).toBe(false);
    if (result.ok || "notFound" in result) {
      return;
    }
    expect(result.error).toContain("still pinned to it");
    expect(result.usage).toEqual([
      { appSlug: "pinned", appName: "Pinned", env: "sandbox" },
    ]);
    expect((await listWorkspaceNodes()).length).toBe(1);
  });
});

async function sessionRequest(
  url: string,
  init: { method?: string; body?: unknown; role?: "admin" | "member" } = {},
): Promise<NextRequest> {
  const session = await createSession({
    email: "ada@example.com",
    provider: "passwordless",
    role: init.role ?? "admin",
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

describe("workspace nodes API", () => {
  it("requires a session", async () => {
    const response = await nodesGet(
      new NextRequest("http://localhost/api/workspace/nodes"),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Sign in to manage the workspace.",
    });
  });

  it("lists workspace nodes for any session", async () => {
    await createWorkspaceNode(DRAFT);
    const response = await nodesGet(
      await sessionRequest("http://localhost/api/workspace/nodes"),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; data: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it("creates a node for admins and reports field errors", async () => {
    const created = await nodesPost(
      await sessionRequest("http://localhost/api/workspace/nodes", {
        method: "POST",
        body: DRAFT,
      }),
    );
    expect(created.status).toBe(201);

    const invalid = await nodesPost(
      await sessionRequest("http://localhost/api/workspace/nodes", {
        method: "POST",
        body: { ...DRAFT, name: "" },
      }),
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({
      ok: false,
      error: "The node could not be created.",
      errors: { name: "Give the node a name." },
    });
  });

  it("creates a Vercel node and rejects an unknown kind", async () => {
    const created = await nodesPost(
      await sessionRequest("http://localhost/api/workspace/nodes", {
        method: "POST",
        body: { ...DRAFT, kind: "Vercel" },
      }),
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      ok: boolean;
      data: { kind: string; status: string };
    };
    expect(createdBody.data.kind).toBe("Vercel");
    expect(createdBody.data.status).toBe("pending");

    const invalid = await nodesPost(
      await sessionRequest("http://localhost/api/workspace/nodes", {
        method: "POST",
        body: { ...DRAFT, name: "Lab 02", kind: "Kubernetes" },
      }),
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({
      ok: false,
      error: "The node could not be created.",
      errors: { kind: expect.stringMatching(/supported/i) },
    });
  });

  it("updates, guards deletes, and 404s unknown slugs", async () => {
    await createWorkspaceNode(DRAFT);

    const updated = await nodePut(
      await sessionRequest("http://localhost/api/workspace/nodes/lab-01", {
        method: "PUT",
        body: { ...DRAFT, location: "Paris" },
      }),
      params({ slug: "lab-01" }),
    );
    expect(updated.status).toBe(200);

    const missing = await nodePut(
      await sessionRequest("http://localhost/api/workspace/nodes/missing", {
        method: "PUT",
        body: DRAFT,
      }),
      params({ slug: "missing" }),
    );
    expect(missing.status).toBe(404);

    const app = buildApp(
      { name: "Pinned", slug: "pinned", description: "", stack: "", node: "lab-01" },
      [],
    );
    tables.workspace_apps.set("pinned", JSON.stringify(app));
    const blocked = await nodeDelete(
      await sessionRequest("http://localhost/api/workspace/nodes/lab-01", {
        method: "DELETE",
      }),
      params({ slug: "lab-01" }),
    );
    expect(blocked.status).toBe(400);
    const blockedBody = (await blocked.json()) as {
      ok: boolean;
      usage: unknown[];
    };
    expect(blockedBody.usage).toHaveLength(1);

    tables.workspace_apps.delete("pinned");
    const deleted = await nodeDelete(
      await sessionRequest("http://localhost/api/workspace/nodes/lab-01", {
        method: "DELETE",
      }),
      params({ slug: "lab-01" }),
    );
    expect(deleted.status).toBe(200);
  });
});
