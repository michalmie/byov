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
  createPreview,
  maskEnvVars,
  previewEnvName,
  rollbackEnv,
  setEnvVars,
  validateEnvVars,
} from "@/lib/cell";
import type { App } from "@/lib/control-plane";

const appsTable = new Map<string, string>();

async function fakeQuery(text: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> {
  if (text.includes("INTO workspace_events")) return [];
  if (text.includes("FROM workspace_apps")) {
    return [...appsTable.values()].map((v) => ({ data: JSON.parse(v) }));
  }
  if (text.startsWith("UPDATE workspace_apps")) {
    appsTable.set(String(params[1]), String(params[0]));
    return [];
  }
  throw new Error(`unexpected SQL: ${text}`);
}
async function fakeQueryOne(text: string, params: unknown[] = []): Promise<Record<string, unknown> | null> {
  const v = appsTable.get(String(params[0]));
  return v ? { data: JSON.parse(v) } : null;
}

beforeEach(() => {
  appsTable.clear();
  vi.mocked(query).mockImplementation(async (t, p) => fakeQuery(t, p ?? []) as never);
  vi.mocked(queryOne).mockImplementation(async (t, p) => fakeQueryOne(t, p ?? []) as never);
  const app: App = {
    slug: "rota-planner",
    name: "Rota Planner",
    stack: "byov-stack",
    description: "",
    checks: [],
    envs: [
      { name: "sandbox", node: "coolify-frankfurt", status: "healthy", providerId: "uuid-1" },
    ],
    deployments: [{ id: "dep-old", env: "sandbox", status: "live", when: "2026-01-01", by: "ada" }],
  };
  appsTable.set(app.slug, JSON.stringify(app));
});

describe("env vars", () => {
  it("validates keys and masks values", () => {
    expect(validateEnvVars({ API_URL: "https://x", _OK: "1" }).ok).toBe(true);
    expect(validateEnvVars({ "BAD-KEY": "x" }).ok).toBe(false);
    const masked = maskEnvVars({ name: "sandbox", node: "n", status: "healthy", envVars: { SECRET: "supersecretvalue" } });
    expect(masked).toEqual([{ key: "SECRET", masked: "••••••••" }]);
    expect(JSON.stringify(masked)).not.toContain("supersecretvalue");
  });

  it("persists vars on the env", async () => {
    expect(await setEnvVars("rota-planner", "sandbox", { FOO: "bar" })).toEqual({ ok: true, keys: ["FOO"] });
    const stored = JSON.parse(appsTable.get("rota-planner")!) as App;
    expect(stored.envs[0]?.envVars).toEqual({ FOO: "bar" });
  });
});

describe("previews and rollback", () => {
  it("names preview envs safely and creates them on the Sandbox node", async () => {
    expect(previewEnvName("feat/My Thing!")).toBe("preview-feat-my-thing");
    const deploy = vi.fn(async (s: string, e: string) => ({
      ok: true as const,
      app: JSON.parse(appsTable.get(s)!) as App,
      deployment: { id: "d-new", env: e, status: "running" as const, when: "now", by: "x" },
      providerId: "uuid-1",
    }));
    const out = await createPreview("rota-planner", "feat/x", "ada", deploy);
    expect(out.ok && out.env.name).toBe("preview-feat-x");
    expect(deploy).toHaveBeenCalledOnce();
  });

  it("rolls back via redeploy and refuses unprovisioned envs", async () => {
    const deploy = vi.fn(async (s: string, e: string) => ({
      ok: true as const,
      app: JSON.parse(appsTable.get(s)!) as App,
      deployment: { id: "d-rb", env: e, status: "running" as const, when: "now", by: "rollback:ada" },
      providerId: "uuid-1",
    }));
    expect(await rollbackEnv("rota-planner", "sandbox", "dep-old", "ada", deploy)).toEqual({ ok: true, deploymentId: "d-rb" });
    expect((await rollbackEnv("rota-planner", "sandbox", "missing", "ada", deploy)).ok).toBe(false);
  });
});
