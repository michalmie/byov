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
import { evaluateGates, scanDlp } from "@/lib/gates";
import { handlePush } from "@/lib/pipeline";
import { standardNewAppChecks } from "@/lib/apps";
import type { App } from "@/lib/control-plane";

const appsTable = new Map<string, string>();
const events: Array<{ actor: string; text: string }> = [];

async function fakeQuery(text: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> {
  if (text.includes("INTO workspace_events")) {
    events.push({ actor: String(params[1]), text: String(params[2]) });
    return [];
  }
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
  if (text.includes("FROM workspace_apps")) {
    const v = appsTable.get(String(params[0]));
    return v ? { data: JSON.parse(v) } : null;
  }
  throw new Error(`unexpected SQL one: ${text}`);
}

beforeEach(() => {
  appsTable.clear();
  events.length = 0;
  vi.mocked(query).mockImplementation(async (t, p) => fakeQuery(t, p ?? []) as never);
  vi.mocked(queryOne).mockImplementation(async (t, p) => fakeQueryOne(t, p ?? []) as never);
  const app: App = {
    slug: "rota-planner",
    name: "Rota Planner",
    stack: "byov-stack",
    description: "",
    checks: standardNewAppChecks(),
    envs: [{ name: "sandbox", node: "coolify-frankfurt", status: "pending" }],
    deployments: [],
  };
  appsTable.set(app.slug, JSON.stringify(app));
});

const ALL_PASS = {
  "Unit tests": "pass",
  Lint: "pass",
  "Production build": "pass",
  "Dependency audit": "pass",
} as const;

describe("DLP scan", () => {
  it("flags secrets and env files without echoing values", () => {
    const findings = scanDlp([
      { path: "src/app.ts", content: "const k = 'AKIA1234567890ABCDEF';" },
      { path: ".env", content: "TOKEN=x" },
      { path: ".env.example", content: "TOKEN=" },
      { path: "README.md", content: "hello" },
    ]);
    expect(findings.map((f) => f.rule)).toContain("AWS access key");
    expect(findings.map((f) => f.rule)).toContain("env file committed");
    expect(JSON.stringify(findings)).not.toContain("AKIA1234567890ABCDEF");
    expect(findings.some((f) => f.path === ".env.example")).toBe(false);
  });
});

describe("evaluateGates", () => {
  it("fails closed when attestations are missing", () => {
    const out = evaluateGates(standardNewAppChecks(), { files: [] });
    expect(out.blocked).toBe(true);
  });
  it("passes only when every gate passes", () => {
    const out = evaluateGates(standardNewAppChecks(), { files: [], reported: { ...ALL_PASS } });
    expect(out.blocked).toBe(false);
    expect(out.checks.every((c) => c.status === "pass")).toBe(true);
  });
});

describe("handlePush", () => {
  it("blocks on DLP, persists checks and records the block", async () => {
    const deploy = vi.fn(async () => ({ ok: true as const, app: JSON.parse(appsTable.get("rota-planner")!) as App, deployment: { id: "d1", env: "sandbox", status: "running" as const, when: "now", by: "x" }, providerId: "u1" }));
    const result = await handlePush("rota-planner", {
      files: [{ path: "a.ts", content: "AKIA1234567890ABCDEF" }],
      reported: { ...ALL_PASS },
    }, "dev@example.com", deploy);
    expect(result.ok && result.deployed).toBe(false);
    expect(deploy).not.toHaveBeenCalled();
    expect(events.some((e) => e.text.includes("blocked"))).toBe(true);
    const stored = JSON.parse(appsTable.get("rota-planner")!) as App;
    expect(stored.checks.find((c) => c.name === "DLP scan")?.status).toBe("fail");
  });

  it("deploys when every gate passes", async () => {
    const deploy = vi.fn(async () => ({ ok: true as const, app: JSON.parse(appsTable.get("rota-planner")!) as App, deployment: { id: "d1", env: "sandbox", status: "running" as const, when: "now", by: "x" }, providerId: "u1" }));
    const result = await handlePush("rota-planner", {
      files: [{ path: "a.ts", content: "clean" }],
      reported: { ...ALL_PASS },
    }, "dev@example.com", deploy);
    expect(result.ok && result.deployed).toBe(true);
    expect(deploy).toHaveBeenCalledOnce();
    expect(events.some((e) => e.text.includes("passed all gates"))).toBe(true);
  });
});
