#!/usr/bin/env node
// BYOV MCP server (stdio, no dependencies): exposes the Control
// Plane to coding agents. One-snippet setup for Claude/Codex:
//   { "mcpServers": { "byov": { "command": "node",
//       "args": ["mcp/byov-mcp.mjs"],
//       "env": { "BYOV_URL": "https://byov.example.com", "BYOV_TOKEN": "byov_..." } } } }
// Tool behavior mirrors lib/mcp-tools.ts (unit-tested).
import { createInterface } from "node:readline";

const base = (process.env.BYOV_URL ?? "").replace(/\/+$/, "");
const token = process.env.BYOV_TOKEN ?? "";

const TOOLS = [
  { name: "byov_list_apps", description: "List apps in the BYOV Control Plane.", inputSchema: { type: "object", properties: {} } },
  { name: "byov_create_app", description: "Register an app with a Sandbox env.", inputSchema: { type: "object", properties: { name: { type: "string" }, node: { type: "string" }, stack: { type: "string" }, repoUrl: { type: "string" } }, required: ["name", "node"] } },
  { name: "byov_deploy", description: "Deploy one env (default sandbox).", inputSchema: { type: "object", properties: { slug: { type: "string" }, env: { type: "string" } }, required: ["slug"] } },
  { name: "byov_status", description: "Live status for one env.", inputSchema: { type: "object", properties: { slug: { type: "string" }, env: { type: "string" } }, required: ["slug"] } },
  { name: "byov_logs", description: "Recent logs for one env.", inputSchema: { type: "object", properties: { slug: { type: "string" }, env: { type: "string" } }, required: ["slug"] } },
];

async function api(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.ok) throw new Error(payload?.error ?? `HTTP ${res.status}`);
  return payload.data;
}

async function callTool(name, a = {}) {
  const env = a.env ?? "sandbox";
  if (name === "byov_list_apps") return api("GET", "/api/v1/apps");
  if (name === "byov_create_app") return api("POST", "/api/v1/apps", { name: a.name, node: a.node, stack: a.stack ?? "", repoUrl: a.repoUrl ?? "" });
  if (name === "byov_deploy") return api("POST", `/api/v1/apps/${encodeURIComponent(a.slug)}/envs/${encodeURIComponent(env)}/deploy`, {});
  if (name === "byov_status") return api("GET", `/api/v1/apps/${encodeURIComponent(a.slug)}/envs/${encodeURIComponent(env)}/status`);
  if (name === "byov_logs") return api("GET", `/api/v1/apps/${encodeURIComponent(a.slug)}/envs/${encodeURIComponent(env)}/logs`);
  throw new Error(`Unknown tool "${name}".`);
}

function send(obj) { process.stdout.write(`${JSON.stringify(obj)}\n`); }
const rl = createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  if (method === "initialize") {
    send({ jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "byov", version: "0.1.0" } } });
  } else if (method === "tools/list") {
    send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
  } else if (method === "tools/call") {
    try {
      const data = await callTool(params?.name, params?.arguments ?? {});
      send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] } });
    } catch (error) {
      send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: String(error?.message ?? error) }], isError: true } });
    }
  } else if (id !== undefined) {
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method "${method}".` } });
  }
});
