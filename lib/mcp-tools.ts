/**
 * MCP tool surface for coding agents (Claude, Codex, …): the same
 * connector client, exposed as tools. Handlers are pure over the
 * injected client so they unit-test without a transport; the stdio
 * entry (`mcp/byov-mcp.mjs`) only frames JSON-RPC.
 */

import type { ConnectorClient } from "./cli-core";

export const MCP_TOOLS = [
  {
    name: "byov_list_apps",
    description: "List every app registered in the BYOV Control Plane.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "byov_create_app",
    description: "Register a new app with a Sandbox env on an approved node.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        node: { type: "string", description: "Node slug hosting the Sandbox" },
        stack: { type: "string" },
        repoUrl: { type: "string" },
        owner: { type: "string", description: "App owner email" },
        ownerGithub: {
          type: "string",
          description: "App owner GitHub login (granted push as repo contributor)",
        },
      },
      required: ["name", "node"],
    },
  },
  {
    name: "byov_deploy",
    description: "Deploy one environment (default sandbox) via its node.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string" }, env: { type: "string" } },
      required: ["slug"],
    },
  },
  {
    name: "byov_status",
    description: "Live status for one environment.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string" }, env: { type: "string" } },
      required: ["slug"],
    },
  },
  {
    name: "byov_logs",
    description: "Recent provider logs for one environment.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string" }, env: { type: "string" } },
      required: ["slug"],
    },
  },
] as const;

function text(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

/** Execute one MCP tool call; returns MCP content blocks. */
export async function callMcpTool(
  client: ConnectorClient,
  name: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    switch (name) {
      case "byov_list_apps":
        return { content: [{ type: "text", text: text(await client.listApps()) }] };
      case "byov_create_app":
        return {
          content: [
            {
              type: "text",
              text: text(
                await client.createApp({
                  name: args.name,
                  node: args.node,
                  stack: typeof args.stack === "string" ? args.stack : "",
                  repoUrl: typeof args.repoUrl === "string" ? args.repoUrl : "",
                  owner: typeof args.owner === "string" ? args.owner : "",
                  ownerGithub:
                    typeof args.ownerGithub === "string" ? args.ownerGithub : "",
                }),
              ),
            },
          ],
        };
      case "byov_deploy":
        return { content: [{ type: "text", text: text(await client.deploy(String(args.slug ?? ""), typeof args.env === "string" ? args.env : "sandbox")) }] };
      case "byov_status":
        return { content: [{ type: "text", text: text(await client.status(String(args.slug ?? ""), typeof args.env === "string" ? args.env : "sandbox")) }] };
      case "byov_logs":
        return { content: [{ type: "text", text: text(await client.logs(String(args.slug ?? ""), typeof args.env === "string" ? args.env : "sandbox")) }] };
      default:
        return { content: [{ type: "text", text: `Unknown tool "${name}".` }], isError: true };
    }
  } catch (error) {
    return {
      content: [{ type: "text", text: error instanceof Error ? error.message : "Tool failed." }],
      isError: true,
    };
  }
}
