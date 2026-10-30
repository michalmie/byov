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
import { createApiApp, findApp, listApiApps } from "@/lib/api-apps";
import {
  createWorkspaceApp,
  findWorkspaceApp,
  listWorkspaceApps,
} from "@/lib/workspace-store";
import type { App, Node } from "@/lib/control-plane";
import { parseStoredNodes } from "@/lib/settings";

// One shared in-memory DB: both stores must hit the same rows.
const appsTable = new Map<string, string>();
const nodesTable = new Map<string, string>();
const stacksTable = new Map<string, string>();

async function fakeQuery(
  text: string,
  params: unknown[] = [],
): Promise<Array<Record<string, unknown>>> {
  if (text.includes("FROM workspace_nodes")) {
    return [...nodesTable.values()].map((v) => ({ data: JSON.parse(v) }));
  }
  if (text.includes("FROM workspace_stacks")) {
    return [...stacksTable.values()].map((v) => ({ data: JSON.parse(v) }));
  }
  if (text.includes("FROM workspace_apps")) {
    return [...appsTable.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([, v]) => ({ data: JSON.parse(v) }));
  }
  if (text.startsWith("INSERT INTO workspace_apps")) {
    const [slug, json] = params as [string, string];
    if (appsTable.has(slug)) {
      throw Object.assign(new Error("dup"), { code: "23505" });
    }
    appsTable.set(slug, json);
    return [];
  }
  if (text.startsWith("UPDATE workspace_apps")) {
    const [json, slug] = params as [string, string];
    appsTable.set(slug, json);
    return [];
  }
  if (text.startsWith("DELETE FROM workspace_apps")) {
    appsTable.delete(String(params[0]));
    return [];
  }
  throw new Error(`unexpected SQL: ${text}`);
}

async function fakeQueryOne(
  text: string,
  params: unknown[] = [],
): Promise<Record<string, unknown> | null> {
  if (text.includes("FROM workspace_apps")) {
    const v = appsTable.get(String(params[0]));
    return v ? { data: JSON.parse(v) } : null;
  }
  if (text.includes("FROM workspace_nodes")) {
    const v = nodesTable.get(String(params[0]));
    return v ? { data: JSON.parse(v) } : null;
  }
  throw new Error(`unexpected SQL one: ${text}`);
}

beforeEach(() => {
  appsTable.clear();
  nodesTable.clear();
  stacksTable.clear();
  vi.mocked(query).mockImplementation(async (t, p) => fakeQuery(t, p ?? []) as never);
  vi.mocked(queryOne).mockImplementation(async (t, p) => fakeQueryOne(t, p ?? []) as never);
});

const SAMPLE_NODE = "coolify-frankfurt";

describe("unified app store", () => {
  it("API-created apps are visible to the workspace store and vice versa", async () => {
    const viaApi = await createApiApp({
      name: "Api App",
      slug: "",
      description: "",
      stack: "byov-stack",
      node: SAMPLE_NODE,
    });
    expect(viaApi.ok).toBe(true);
    expect((await listWorkspaceApps()).map((a) => a.slug)).toContain("api-app");
    expect((await findWorkspaceApp("api-app"))?.name).toBe("Api App");

    const viaUi = await createWorkspaceApp({
      name: "Ui App",
      slug: "",
      description: "",
      stack: "byov-stack",
      node: SAMPLE_NODE,
    });
    expect(viaUi.ok).toBe(true);
    expect((await listApiApps()).map((a) => a.slug)).toEqual(
      expect.arrayContaining(["api-app", "ui-app"]),
    );
    expect((await findApp("ui-app"))?.name).toBe("Ui App");
  });

  it("rejects a slug that collides with a sample app from either surface", async () => {
    // shopfloor-tickets is a shipped sample slug.
    const viaApi = await createApiApp({
      name: "Clone",
      slug: "shopfloor-tickets",
      description: "",
      stack: "",
      node: SAMPLE_NODE,
    });
    expect(viaApi.ok).toBe(false);

    const viaUi = await createWorkspaceApp({
      name: "Clone",
      slug: "shopfloor-tickets",
      description: "",
      stack: "",
      node: SAMPLE_NODE,
    });
    expect(viaUi.ok).toBe(false);
  });

  it("API accepts a workspace-defined node", async () => {
    const customNode: Node = {
      slug: "coolify-berlin",
      name: "berlin-01",
      kind: "Coolify",
      location: "Berlin",
      status: "pending",
      domainZone: "berlin.example.com",
    };
    nodesTable.set(customNode.slug, JSON.stringify(customNode));
    // Sanity: the node is parseable through the settings catalogue.
    expect(parseStoredNodes([customNode])?.[0]?.slug).toBe("coolify-berlin");

    const result = await createApiApp({
      name: "Berlin App",
      slug: "",
      description: "",
      stack: "",
      node: "coolify-berlin",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.app.envs[0]?.node).toBe("coolify-berlin");
    }
  });

  it("keeps slug ordering stable across surfaces", async () => {
    await createApiApp({ name: "Zeta", slug: "", description: "", stack: "", node: SAMPLE_NODE });
    await createWorkspaceApp({ name: "Alpha", slug: "", description: "", stack: "", node: SAMPLE_NODE });
    const slugs = (await listApiApps()).map((a: App) => a.slug);
    expect(slugs).toEqual([...slugs].sort());
  });
});
