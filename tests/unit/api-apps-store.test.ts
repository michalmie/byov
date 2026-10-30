import { beforeEach, describe, expect, vi } from "vitest";

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

import { query, queryOne } from "@/lib/db";
import {
  addApiEnv,
  createApiApp,
  findApp,
  findAppEnv,
  listApiApps,
  readApiApps,
} from "@/lib/api-apps";
import type { App } from "@/lib/control-plane";

const mockQuery = vi.mocked(query);
const mockQueryOne = vi.mocked(queryOne);

/** In-memory unified `workspace_apps` table backing the mocked DB. */
const apps = new Map<string, { app: App; seq: number }>();
let nextSeq = 0;

function uniqueViolation(): Error {
  return Object.assign(
    new Error(
      'duplicate key value violates unique constraint "workspace_apps_pkey"',
    ),
    { code: "23505" },
  );
}

async function fakeQuery(
  text: string,
  params: unknown[],
): Promise<unknown[]> {
  // Workspace node/stack catalogues are empty in these tests (sample
  // nodes/stacks still validate via the pure catalogues).
  if (
    text.includes("FROM workspace_nodes") ||
    text.includes("FROM workspace_stacks")
  ) {
    return [];
  }
  if (text.includes("FROM workspace_apps") && text.startsWith("SELECT")) {
    if (text.includes("WHERE slug = $1")) {
      const entry = apps.get(String(params[0]));
      // Mirror `pg`: the JSONB document arrives parsed.
      return entry
        ? [{ slug: entry.app.slug, data: JSON.parse(JSON.stringify(entry.app)) }]
        : [];
    }
    return [...apps.values()]
      .sort((a, b) => a.app.slug.localeCompare(b.app.slug))
      .map((entry) => ({
        slug: entry.app.slug,
        data: JSON.parse(JSON.stringify(entry.app)),
      }));
  }
  if (text.startsWith("INSERT INTO workspace_apps")) {
    const [slug, json] = params as [string, string];
    if (apps.has(slug)) {
      throw uniqueViolation();
    }
    nextSeq += 1;
    apps.set(slug, { app: JSON.parse(json) as App, seq: nextSeq });
    return [];
  }
  if (text.startsWith("UPDATE workspace_apps SET data")) {
    const [json, slug] = params as [string, string];
    const entry = apps.get(slug);
    if (entry) {
      entry.app = JSON.parse(json) as App;
    }
    return [];
  }
  throw new Error(`unexpected SQL in fake: ${text}`);
}

beforeEach(() => {
  apps.clear();
  nextSeq = 0;
  mockQuery.mockReset();
  mockQueryOne.mockReset();
  mockQuery.mockImplementation(async (text: string, params?: unknown[]) => {
    return fakeQuery(text, params ?? []);
  });
  mockQueryOne.mockImplementation(async (text: string, params?: unknown[]) => {
    const rows = await fakeQuery(text, params ?? []);
    return rows.length > 0 ? rows[0] : null;
  });
});

const NODE = "coolify-frankfurt";

describe("createApiApp", () => {
  it("creates an app with a derived slug and a Sandbox env", async () => {
    const result = await createApiApp({
      name: "Rota Planner",
      slug: "",
      description: "Shift planning without the spreadsheet.",
      stack: "byov-stack",
      node: NODE,
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.app.slug).toBe("rota-planner");
    expect(result.ok && result.app.envs).toEqual([
      { name: "sandbox", node: NODE, status: "pending" },
    ]);
    expect(result.ok && result.app.checks).toHaveLength(5);
  });

  it("persists across reads and finds by slug", async () => {
    expect(await listApiApps()).toEqual([]);
    const created = await createApiApp({
      name: "Rota Planner",
      slug: "rota",
      description: "",
      stack: "",
      node: NODE,
    });
    expect(created.ok).toBe(true);
    expect((await listApiApps()).map((app) => app.slug)).toEqual(["rota"]);
    expect((await findApp("rota"))?.name).toBe("Rota Planner");
    expect(await findApp("missing")).toBeUndefined();
  });

  it("rejects duplicates, bad slugs, unknown stacks and nodes", async () => {
    const first = await createApiApp({
      name: "Rota Planner",
      slug: "",
      description: "",
      stack: "",
      node: NODE,
    });
    expect(first.ok).toBe(true);

    const duplicate = await createApiApp({
      name: "Rota Planner",
      slug: "",
      description: "",
      stack: "",
      node: NODE,
    });
    expect(duplicate.ok).toBe(false);

    const badSlug = await createApiApp({
      name: "Other",
      slug: "Bad Slug!",
      description: "",
      stack: "",
      node: NODE,
    });
    expect(badSlug.ok).toBe(false);
    expect(!badSlug.ok && badSlug.errors.slug).toContain("lowercase");

    const badStack = await createApiApp({
      name: "Other",
      slug: "",
      description: "",
      stack: "cobol-mainframe",
      node: NODE,
    });
    expect(badStack.ok).toBe(false);
    expect(!badStack.ok && badStack.errors.stack).toContain(
      "known tech stacks",
    );

    const badNode = await createApiApp({
      name: "Other",
      slug: "",
      description: "",
      stack: "",
      node: "mars-1",
    });
    expect(badNode.ok).toBe(false);
    expect(!badNode.ok && badNode.errors.node).toContain("known nodes");
  });

  it("reports a slug conflict when a concurrent create wins the race", async () => {
    const base = mockQuery.getMockImplementation();
    mockQuery.mockImplementation(async (text: string, params?: unknown[]) => {
      if (text.startsWith("INSERT INTO workspace_apps")) {
        throw uniqueViolation();
      }
      return base?.(text, params) as Promise<unknown[]>;
    });
    const result = await createApiApp({
      name: "Rota Planner",
      slug: "rota",
      description: "",
      stack: "",
      node: NODE,
    });
    expect(result.ok).toBe(false);
  });
});

describe("addApiEnv", () => {
  it("adds a pending env with an optional URL override", async () => {
    const created = await createApiApp({
      name: "Rota Planner",
      slug: "",
      description: "",
      stack: "",
      node: NODE,
    });
    expect(created.ok).toBe(true);

    const added = await addApiEnv("rota-planner", {
      name: "staging",
      node: NODE,
      url: "https://rota-staging.example.com",
    });
    expect(added.ok).toBe(true);
    expect(added.ok && added.env).toEqual({
      name: "staging",
      node: NODE,
      status: "pending",
      url: "https://rota-staging.example.com",
    });
    expect(
      (await findApp("rota-planner"))?.envs.map((env) => env.name),
    ).toEqual(["sandbox", "staging"]);
  });

  it("rejects duplicates, bad names, unknown nodes and bad URLs", async () => {
    await createApiApp({
      name: "Rota Planner",
      slug: "",
      description: "",
      stack: "",
      node: NODE,
    });
    const duplicate = await addApiEnv("rota-planner", {
      name: "sandbox",
      node: NODE,
      url: "",
    });
    expect(duplicate.ok).toBe(false);

    const badName = await addApiEnv("rota-planner", {
      name: "Staging!",
      node: NODE,
      url: "",
    });
    expect(!badName.ok && badName.errors.name).toContain("lowercase");

    const badNode = await addApiEnv("rota-planner", {
      name: "staging",
      node: "mars-1",
      url: "",
    });
    expect(!badNode.ok && badNode.errors.node).toContain("known nodes");

    const badUrl = await addApiEnv("rota-planner", {
      name: "staging",
      node: NODE,
      url: "gopher://example.com",
    });
    expect(!badUrl.ok && badUrl.errors.url).toContain("http(s)");

    const missingApp = await addApiEnv("nope", {
      name: "staging",
      node: NODE,
      url: "",
    });
    expect(missingApp.ok).toBe(false);
  });
});

describe("findAppEnv", () => {
  it("finds envs and misses cleanly", async () => {
    await createApiApp({
      name: "Rota Planner",
      slug: "",
      description: "",
      stack: "",
      node: NODE,
    });
    expect((await findAppEnv("rota-planner", "sandbox"))?.env.node).toBe(
      NODE,
    );
    expect(await findAppEnv("rota-planner", "staging")).toBeNull();
    expect(await findAppEnv("missing", "sandbox")).toBeNull();
  });
});

describe("app store robustness", () => {
  it("reads an empty store as empty", async () => {
    expect(await readApiApps()).toEqual([]);
  });

  it("skips corrupt rows and keeps the valid apps", async () => {
    const created = await createApiApp({
      name: "Rota Planner",
      slug: "rota",
      description: "",
      stack: "",
      node: NODE,
    });
    expect(created.ok).toBe(true);
    const valid = created.ok ? created.app : null;
    mockQuery.mockImplementationOnce(async () => [
      { slug: "rota", data: valid },
      { slug: "bogus", data: { bogus: true } },
      { slug: "junk", data: "nope" },
    ]);
    expect(await readApiApps()).toEqual([valid]);
  });

  it("findApp misses when the stored row is corrupt", async () => {
    mockQueryOne.mockImplementationOnce(async () => ({
      slug: "rota",
      data: { bogus: true },
    }));
    expect(await findApp("rota")).toBeUndefined();
  });

  it("propagates database failures to the caller", async () => {
    mockQuery.mockRejectedValueOnce(new Error("db is down"));
    await expect(
      createApiApp({
        name: "Rota Planner",
        slug: "",
        description: "",
        stack: "",
        node: NODE,
      }),
    ).rejects.toThrow("db is down");
  });
});
