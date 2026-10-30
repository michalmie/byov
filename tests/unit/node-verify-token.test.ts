import { beforeEach, describe, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db");

import { query, queryOne } from "@/lib/db";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { encryptToken } from "@/lib/node-credentials";
import type { Node } from "@/lib/control-plane";
import { POST } from "@/app/api/workspace/nodes/verify-token/route";

const tables: Record<string, Map<string, string>> = {
  workspace_nodes: new Map(),
  workspace_node_credentials: new Map(),
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
    if (text.includes("workspace_node_credentials")) {
      return [...table.keys()].map((slug) => ({ slug }));
    }
    return [...table.values()].map((v) => ({ data: JSON.parse(v) }));
  }
  if (sql.startsWith("UPDATE")) {
    table.set(String(params[1]), String(params[0]));
    return [];
  }
  throw new Error(`unexpected SQL: ${text}`);
}
async function fakeQueryOne(text: string, params: unknown[] = []): Promise<Record<string, unknown> | null> {
  const table = tableOf(text);
  const value = table.get(String(params[0]));
  if (value === undefined) return null;
  if (text.includes("workspace_node_credentials")) return { ciphertext: value };
  return { data: JSON.parse(value) };
}

beforeEach(() => {
  for (const t of Object.values(tables)) t.clear();
  vi.mocked(query).mockImplementation(async (t, p) => fakeQuery(t, p ?? []) as never);
  vi.mocked(queryOne).mockImplementation(async (t, p) => fakeQueryOne(t, p ?? []) as never);
  process.env.AUTH_SECRET = "test-secret-for-unit-tests";
  const node: Node = {
    slug: "contabo",
    name: "Contabo",
    kind: "Coolify",
    location: "Munchen",
    status: "pending",
    endpoint: "https://panel.example.com",
  };
  tables.workspace_nodes.set(node.slug, JSON.stringify(node));
  tables.workspace_node_credentials.set(node.slug, encryptToken("saved-token"));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ status: 200, text: async () => "[]" })),
  );
});

describe("verify-token first contact", () => {
  it("flips a Pending node healthy on a passing test", async () => {
    const session = await createSession({
      email: "admin@example.com",
      provider: "passwordless",
      role: "admin",
    });
    const response = await POST(
      new NextRequest("http://localhost/api/workspace/nodes/verify-token", {
        method: "POST",
        headers: new Headers({
          cookie: `${SESSION_COOKIE_NAME}=${session}`,
          "content-type": "application/json",
        }),
        body: JSON.stringify({ endpoint: "https://panel.example.com", slug: "contabo", apiToken: "" }),
      }),
    );
    const body = (await response.json()) as { ok: boolean; data: { ok: boolean } };
    expect(body.data.ok).toBe(true);
    const stored = JSON.parse(tables.workspace_nodes.get("contabo")!) as Node;
    expect(stored.status).toBe("healthy");
  });
});
