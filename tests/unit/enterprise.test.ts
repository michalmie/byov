import { beforeEach, describe, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db");

import { query, queryOne } from "@/lib/db";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { _setSiemFetch, recordEvent } from "@/lib/events";
import { POST as nodePost } from "@/app/api/workspace/nodes/route";
import { PUT as settingsPut } from "@/app/api/workspace/settings/route";

const tables: Record<string, Map<string, string>> = {
  workspace_nodes: new Map(),
  workspace_apps: new Map(),
  workspace_stacks: new Map(),
  workspace_users: new Map(),
  workspace_kv: new Map(),
  workspace_events: new Map(),
};

function tableOf(sql: string): Map<string, string> {
  for (const name of Object.keys(tables)) {
    if (sql.includes(name)) return tables[name];
  }
  throw new Error(`unexpected SQL: ${sql}`);
}

async function fakeQuery(text: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> {
  const table = tableOf(text);
  const sql = text.trimStart().toUpperCase();
  if (sql.startsWith("SELECT")) {
    return [...table.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => ({ data: JSON.parse(v) }));
  }
  if (sql.startsWith("INSERT")) { table.set(String(params[0]), String(params[1])); return []; }
  if (sql.startsWith("UPDATE")) { table.set(String(params[1]), String(params[0])); return []; }
  if (sql.startsWith("DELETE")) { table.delete(String(params[0])); return []; }
  throw new Error(`unexpected SQL: ${text}`);
}
async function fakeQueryOne(text: string, params: unknown[] = []): Promise<Record<string, unknown> | null> {
  const table = tableOf(text);
  const v = table.get(String(params[0]));
  return v === undefined ? null : { slug: String(params[0]), id: String(params[0]), data: JSON.parse(v) };
}

beforeEach(() => {
  for (const t of Object.values(tables)) t.clear();
  vi.mocked(query).mockImplementation(async (t, p) => fakeQuery(t, p ?? []) as never);
  vi.mocked(queryOne).mockImplementation(async (t, p) => fakeQueryOne(t, p ?? []) as never);
  process.env.AUTH_SECRET = "test-secret-for-unit-tests";
  delete process.env.BYOV_SIEM_WEBHOOK_URL;
});

async function req(url: string, role: "admin" | "member", body?: unknown): Promise<NextRequest> {
  const session = await createSession({ email: `${role}@example.com`, provider: "passwordless", role });
  return new NextRequest(url, {
    method: body === undefined ? "GET" : "POST",
    headers: new Headers({ cookie: `${SESSION_COOKIE_NAME}=${session}`, "content-type": "application/json" }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("workspace RBAC", () => {
  it("members cannot create nodes or save settings; admins can", async () => {
    const draft = { name: "berlin-01", kind: "Coolify", location: "Berlin", endpoint: "", domainZone: "", tailnetHost: "" };
    expect((await nodePost(await req("http://localhost/api/workspace/nodes", "member", draft))).status).toBe(403);
    expect((await nodePost(await req("http://localhost/api/workspace/nodes", "admin", draft))).status).toBe(201);

    const settings = { workspaceName: "WS", defaultNode: "", devZone: "", tailnetDomain: "", defaultScenario: "public", appScenarios: {} };
    const putReq = await req("http://localhost/api/workspace/settings", "member", settings);
    // req() uses POST; rebuild as PUT with same session cookie.
    const memberPut = new NextRequest("http://localhost/api/workspace/settings", {
      method: "PUT",
      headers: putReq.headers,
      body: JSON.stringify(settings),
    });
    expect((await settingsPut(memberPut)).status).toBe(403);
  });
});

describe("SIEM dispatch", () => {
  it("forwards recorded events to the webhook when configured", async () => {
    process.env.BYOV_SIEM_WEBHOOK_URL = "https://siem.example.com/ingest";
    const sent: Array<{ url: string; body: string }> = [];
    _setSiemFetch(async (url, init) => {
      sent.push({ url, body: init.body });
    });
    await recordEvent({ actor: "ada", text: "deployed X to sandbox", appSlug: "x" });
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0]!.body)).toMatchObject({ source: "byov", actor: "ada", appSlug: "x" });
    delete process.env.BYOV_SIEM_WEBHOOK_URL;
  });

  it("stays silent without a webhook URL", async () => {
    const sent: unknown[] = [];
    _setSiemFetch(async () => { sent.push(1); });
    await recordEvent({ actor: "ada", text: "hello" });
    expect(sent).toHaveLength(0);
  });
});
