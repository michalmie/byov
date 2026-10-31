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
import { deployEnv, envLogs, envStatus } from "@/lib/deploy";
import type { CoolifyDeps } from "@/lib/coolify-adapter";
import type { App, Node } from "@/lib/control-plane";

const appsTable = new Map<string, string>();
const nodesTable = new Map<string, string>();
const kvTable = new Map<string, string>();

async function fakeQuery(text: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> {
  if (text.includes("FROM workspace_apps")) {
    return [...appsTable.values()].map((v) => ({ data: JSON.parse(v) }));
  }
  if (text.includes("FROM workspace_nodes")) {
    if (text.trimStart().toUpperCase().startsWith("UPDATE")) {
      nodesTable.set(String(params[1]), String(params[0]));
      return [];
    }
    return [...nodesTable.values()].map((v) => ({ data: JSON.parse(v) }));
  }
  if (text.includes("FROM workspace_stacks")) return [];
  if (text.includes("FROM workspace_kv")) {
    const v = kvTable.get(String(params[0]));
    return v ? [{ data: JSON.parse(v) }] : [];
  }
  if (text.startsWith("UPDATE workspace_apps")) {
    appsTable.set(String(params[1]), String(params[0]));
    return [];
  }
  if (text.startsWith("UPDATE workspace_nodes")) {
    nodesTable.set(String(params[1]), String(params[0]));
    return [];
  }
  throw new Error(`unexpected SQL: ${text}`);
}
async function fakeQueryOne(text: string, params: unknown[] = []): Promise<Record<string, unknown> | null> {
  if (text.includes("FROM workspace_apps")) {
    const v = appsTable.get(String(params[0]));
    return v ? { data: JSON.parse(v) } : null;
  }
  if (text.includes("FROM workspace_kv")) {
    const v = kvTable.get(String(params[0]));
    return v ? { data: JSON.parse(v) } : null;
  }
  throw new Error(`unexpected SQL one: ${text}`);
}

function seed() {
  const node: Node = {
    slug: "coolify-frankfurt",
    name: "frankfurt-01",
    kind: "Coolify",
    location: "Frankfurt",
    status: "pending",
    endpoint: "https://coolify.example.com",
    domainZone: "frankfurt.example.com",
  };
  nodesTable.set(node.slug, JSON.stringify(node));
  const app: App = {
    slug: "rota-planner",
    name: "Rota Planner",
    stack: "byov-stack",
    description: "",
    checks: [],
    envs: [{ name: "sandbox", node: node.slug, status: "pending" }],
    deployments: [],
    repoUrl: "https://github.com/example/rota-planner.git",
    branch: "main",
  };
  appsTable.set(app.slug, JSON.stringify(app));
  kvTable.set("settings", JSON.stringify({
    workspaceName: "WS", defaultNode: "", devZone: "", tailnetDomain: "",
    defaultScenario: "public", appScenarios: {},
  }));
}

function okDeps(): CoolifyDeps {
  return {
    fetchJson: vi.fn(async (url: string, init: { method: string }) => {
      if (url.endsWith("/api/v1/servers")) {
        return { status: 200, body: [{ uuid: "srv-1", is_usable: true, is_reachable: true }] };
      }
      if (url.endsWith("/api/v1/projects")) {
        return { status: 200, body: [{ uuid: "prj-1", name: "BYOV" }] };
      }
      if (url.endsWith("/environments")) {
        return { status: 200, body: [{ uuid: "env-1", name: "sandbox" }] };
      }
      if (url.endsWith("/api/v1/github-apps")) return { status: 200, body: [] };
      if (url.endsWith("/applications/public")) return { status: 201, body: { uuid: "uuid-1" } };
      if (url.includes("/api/v1/deploy?")) {
        return { status: 200, body: { deployments: [{ deployment_uuid: "dep-1" }] } };
      }
      if (url.endsWith("/logs")) return { status: 200, body: "log line" };
      if (init.method === "PATCH") return { status: 200, body: {} };
      return { status: 200, body: { uuid: "uuid-1", status: "running" } };
    }),
  };
}

beforeEach(() => {
  appsTable.clear(); nodesTable.clear(); kvTable.clear();
  vi.mocked(query).mockImplementation(async (t, p) => fakeQuery(t, p ?? []) as never);
  vi.mocked(queryOne).mockImplementation(async (t, p) => fakeQueryOne(t, p ?? []) as never);
  process.env.COOLIFY_API_TOKEN = "test-token";
  seed();
});

describe("deployEnv", () => {
  it("provisions, deploys, records the deployment and wakes the node", async () => {
    const result = await deployEnv("rota-planner", "sandbox", "ada@example.com", okDeps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.providerId).toBe("uuid-1");
    expect(result.deployment.id).toBe("dep-1");
    const stored = JSON.parse(appsTable.get("rota-planner")!) as App;
    expect(stored.envs[0]?.providerId).toBe("uuid-1");
    expect(stored.envs[0]?.status).toBe("deploying");
    expect(stored.deployments[0]?.by).toBe("ada@example.com");
    const node = JSON.parse(nodesTable.get("coolify-frankfurt")!) as Node;
    expect(node.status).toBe("healthy");
  });

  it("reuses the provider app on the second deploy", async () => {
    await deployEnv("rota-planner", "sandbox", "ada@example.com", okDeps());
    const deps = okDeps();
    const second = await deployEnv("rota-planner", "sandbox", "ada@example.com", deps);
    expect(second.ok).toBe(true);
    const urls = vi.mocked(deps.fetchJson).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/applications/public"))).toBe(false);
  });

  it("asks for a linked repo before touching the provider", async () => {
    const stored = JSON.parse(appsTable.get("rota-planner")!) as App;
    delete stored.repoUrl;
    appsTable.set(stored.slug, JSON.stringify(stored));
    const deps = okDeps();
    const result = await deployEnv("rota-planner", "sandbox", "ada@example.com", deps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("repository");
    expect(vi.mocked(deps.fetchJson)).not.toHaveBeenCalled();
  });

  it("rejects Vercel nodes and missing tokens clearly", async () => {
    const node = JSON.parse(nodesTable.get("coolify-frankfurt")!) as Node;
    nodesTable.set(node.slug, JSON.stringify({ ...node, kind: "Vercel" }));
    expect((await deployEnv("rota-planner", "sandbox", "a@b.c", okDeps())).ok).toBe(false);

    nodesTable.set(node.slug, JSON.stringify(node));
    delete process.env.COOLIFY_API_TOKEN;
    const noToken = await deployEnv("rota-planner", "sandbox", "a@b.c", okDeps());
    expect(noToken.ok).toBe(false);
    if (!noToken.ok) expect(noToken.error).toContain("Settings");
  });
});

describe("envStatus / envLogs", () => {
  it("maps live status and returns logs", async () => {
    await deployEnv("rota-planner", "sandbox", "ada@example.com", okDeps());
    expect(await envStatus("rota-planner", "sandbox", okDeps())).toMatchObject({ ok: true, health: "healthy" });
    expect(await envLogs("rota-planner", "sandbox", okDeps())).toEqual({ ok: true, logs: "log line" });
  });
});
