#!/usr/bin/env node
// byov — Bring Your Own Vibe connector CLI (no dependencies).
// Config: BYOV_URL + BYOV_TOKEN env, or flags --url/--token.
// Behavior mirrors lib/cli-core.ts (unit-tested); this file only
// wires argv/stdout to the Control Plane API.
const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] ?? "" : "";
}
const base = (flag("url") || process.env.BYOV_URL || "").replace(/\/+$/, "");
const token = flag("token") || process.env.BYOV_TOKEN || "";
const positional = args.filter((a, i) => !a.startsWith("--") && args[i - 1]?.startsWith("--") === false);
const command = positional[0] ?? "help";
const rest = positional.slice(1);

async function call(method, path, body) {
  if (!base || !token) {
    console.error("Set BYOV_URL and BYOV_TOKEN (or pass --url/--token).");
    process.exit(2);
  }
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.ok) {
    console.error(payload?.error ?? `Request failed (HTTP ${res.status}).`);
    process.exit(1);
  }
  console.log(JSON.stringify(payload.data, null, 2));
}

const env = rest[1] ?? "sandbox";
if (command === "apps") await call("GET", "/api/v1/apps");
else if (command === "create") {
  if (!rest[0] || !flag("node")) { console.error("Usage: byov create <name> --node <slug>"); process.exit(2); }
  await call("POST", "/api/v1/apps", { name: rest[0], node: flag("node"), stack: flag("stack"), repoUrl: flag("repo") });
} else if (command === "link") {
  if (!rest[0] || !flag("repo")) { console.error("Usage: byov link <app> --repo <url>"); process.exit(2); }
  await call("POST", `/api/v1/apps/${encodeURIComponent(rest[0])}/repo`, { repoUrl: flag("repo"), branch: flag("branch") });
} else if (command === "deploy") await call("POST", `/api/v1/apps/${encodeURIComponent(rest[0] ?? "")}/envs/${encodeURIComponent(env)}/deploy`, {});
else if (command === "status") await call("GET", `/api/v1/apps/${encodeURIComponent(rest[0] ?? "")}/envs/${encodeURIComponent(env)}/status`);
else if (command === "logs") await call("GET", `/api/v1/apps/${encodeURIComponent(rest[0] ?? "")}/envs/${encodeURIComponent(env)}/logs`);
else {
  console.log(`byov — Bring Your Own Vibe connector

Commands: apps | create <name> --node <slug> | link <app> --repo <url> |
deploy <app> [env] | status <app> [env] | logs <app> [env]

Agent setup (MCP): node mcp/byov-mcp.mjs with BYOV_URL + BYOV_TOKEN set.`);
}
