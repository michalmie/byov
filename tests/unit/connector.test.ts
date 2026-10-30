import { describe, expect, it, vi } from "vitest";
import { createClient, parseCliArgs, runCli, type FetchFn } from "@/lib/cli-core";
import { callMcpTool, MCP_TOOLS } from "@/lib/mcp-tools";
import { tokenHasScope, validateScopes } from "@/lib/api-tokens";

function fakeFetch(routes: Record<string, unknown>): FetchFn {
  return vi.fn(async (url: string) => {
    const path = new URL(url).pathname;
    const data = routes[path];
    if (data === undefined) {
      return { status: 404, json: async () => ({ ok: false, error: "not found" }) };
    }
    return { status: 200, json: async () => ({ ok: true, data }) };
  }) as FetchFn;
}

describe("connector client + CLI", () => {
  it("parses commands and flags", () => {
    expect(parseCliArgs(["create", "Rota", "--node", "coolify-frankfurt"])).toEqual({
      command: "create",
      positional: ["Rota"],
      flags: { node: "coolify-frankfurt" },
    });
  });

  it("lists apps and deploys through the API", async () => {
    const client = createClient(
      { baseUrl: "https://byov.example.com/", token: "byov_x_y" },
      fakeFetch({ "/api/v1/apps": [{ slug: "rota" }], "/api/v1/apps/rota/envs/sandbox/deploy": { deployment: { id: "d1" } } }),
    );
    expect(await runCli(client, ["apps"])).toMatchObject({ code: 0 });
    expect((await runCli(client, ["deploy", "rota"])).code).toBe(0);
    expect((await runCli(client, ["deploy"])).code).toBe(2);
  });

  it("surfaces API errors as exit code 1", async () => {
    const client = createClient({ baseUrl: "https://x.example.com", token: "t" }, fakeFetch({}));
    expect((await runCli(client, ["apps"])).code).toBe(1);
  });
});

describe("MCP tools", () => {
  it("exposes the five governed tools and executes calls", async () => {
    expect(MCP_TOOLS.map((t) => t.name)).toEqual([
      "byov_list_apps", "byov_create_app", "byov_deploy", "byov_status", "byov_logs",
    ]);
    const client = createClient(
      { baseUrl: "https://x.example.com", token: "t" },
      fakeFetch({ "/api/v1/apps": [] }),
    );
    const out = await callMcpTool(client, "byov_list_apps", {});
    expect(out.isError).toBeFalsy();
    expect((await callMcpTool(client, "nope", {})).isError).toBe(true);
  });
});

describe("token scopes", () => {
  it("validates and checks scopes; legacy tokens keep full access", () => {
    expect(validateScopes(["apps:read"])).toEqual({ ok: true, scopes: ["apps:read"] });
    expect(validateScopes(["bogus"]).ok).toBe(false);
    expect(validateScopes(undefined).ok).toBe(true);
    const legacy = { id: "a", name: "old", createdAt: "", lastUsedAt: null, revokedAt: null, scopes: [] as never[] };
    expect(tokenHasScope(legacy as never, "tokens:manage")).toBe(true);
    const scoped = { ...legacy, scopes: ["apps:read"] as never[] };
    expect(tokenHasScope(scoped as never, "apps:read")).toBe(true);
    expect(tokenHasScope(scoped as never, "apps:write")).toBe(false);
  });
});
