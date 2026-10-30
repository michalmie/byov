/**
 * Connector core shared by the `byov` CLI and the MCP server:
 * a tiny typed client over `/api/v1` plus command/tool handlers
 * that return plain results (no process/console access) so every
 * behavior is unit-testable with a fake fetch.
 */

export interface ConnectorConfig {
  baseUrl: string;
  token: string;
}

export type FetchFn = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ status: number; json: () => Promise<unknown> }>;

const defaultFetch: FetchFn = async (url, init) => {
  const res = await fetch(url, init);
  return { status: res.status, json: () => res.json() as Promise<unknown> };
};

export class ConnectorError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function createClient(config: ConnectorConfig, fetchFn: FetchFn = defaultFetch) {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetchFn(`${config.baseUrl.replace(/\/+$/, "")}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => null)) as
      | { ok?: boolean; data?: T; error?: string }
      | null;
    if (res.status < 200 || res.status >= 300 || !payload || payload.ok !== true) {
      throw new ConnectorError(res.status, payload?.error ?? `Request failed (HTTP ${res.status}).`);
    }
    return payload.data as T;
  }
  return {
    listApps: () => call<unknown[]>("GET", "/api/v1/apps"),
    createApp: (input: Record<string, unknown>) => call<unknown>("POST", "/api/v1/apps", input),
    deploy: (slug: string, env: string) =>
      call<unknown>("POST", `/api/v1/apps/${encodeURIComponent(slug)}/envs/${encodeURIComponent(env)}/deploy`, {}),
    status: (slug: string, env: string) =>
      call<unknown>("GET", `/api/v1/apps/${encodeURIComponent(slug)}/envs/${encodeURIComponent(env)}/status`),
    logs: (slug: string, env: string) =>
      call<unknown>("GET", `/api/v1/apps/${encodeURIComponent(slug)}/envs/${encodeURIComponent(env)}/logs`),
    push: (slug: string, payload: Record<string, unknown>) =>
      call<unknown>("POST", `/api/v1/apps/${encodeURIComponent(slug)}/webhook`, payload),
    linkRepo: (slug: string, repoUrl: string, branch?: string) =>
      call<unknown>("POST", `/api/v1/apps/${encodeURIComponent(slug)}/repo`, { repoUrl, branch }),
  };
}

export type ConnectorClient = ReturnType<typeof createClient>;

/** Parse `byov <command> [args] --flag value` into a structured call. */
export function parseCliArgs(argv: string[]): { command: string; positional: string[]; flags: Record<string, string> } {
  const [command = "help", ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i]!;
    if (arg.startsWith("--")) {
      flags[arg.slice(2)] = rest[i + 1] ?? "";
      i += 1;
    } else {
      positional.push(arg);
    }
  }
  return { command, positional, flags };
}

export const CLI_HELP = `byov — Bring Your Own Vibe connector

Setup:
  export BYOV_URL=https://byov.example.com
  export BYOV_TOKEN=byov_...

Commands:
  byov apps                          List apps
  byov create <name> --node <slug> [--stack <slug>] [--repo <url>] [--owner <email>] [--owner-github <login>]
  byov link <app> --repo <url> [--branch <name>]
  byov deploy <app> [env]            Deploy (default env: sandbox)
  byov status <app> [env]            Live env status
  byov logs <app> [env]              Recent provider logs
  byov push <app> [env]              Report local gate results + files to the pipeline

One-command agent setup (MCP): point your coding tool at
  node mcp/byov-mcp.mjs
with BYOV_URL and BYOV_TOKEN set — no other install step.`;

/** Run one CLI command against the client; returns exit code + output. */
export async function runCli(
  client: ConnectorClient,
  argv: string[],
): Promise<{ code: number; out: string }> {
  const { command, positional, flags } = parseCliArgs(argv);
  try {
    switch (command) {
      case "apps":
        return { code: 0, out: JSON.stringify(await client.listApps(), null, 2) };
      case "create": {
        const name = positional[0];
        if (!name || !flags.node) {
          return { code: 2, out: "Usage: byov create <name> --node <slug> [--stack <slug>] [--repo <url>] [--owner <email>] [--owner-github <login>]" };
        }
        const app = await client.createApp({
          name,
          node: flags.node,
          stack: flags.stack ?? "",
          repoUrl: flags.repo ?? "",
          branch: flags.branch ?? "",
          owner: flags.owner ?? "",
          ownerGithub: flags["owner-github"] ?? "",
        });
        return { code: 0, out: JSON.stringify(app, null, 2) };
      }
      case "link": {
        if (!positional[0] || !flags.repo) {
          return { code: 2, out: "Usage: byov link <app> --repo <url> [--branch <name>]" };
        }
        return { code: 0, out: JSON.stringify(await client.linkRepo(positional[0], flags.repo, flags.branch), null, 2) };
      }
      case "deploy":
        if (!positional[0]) return { code: 2, out: "Usage: byov deploy <app> [env]" };
        return { code: 0, out: JSON.stringify(await client.deploy(positional[0], positional[1] ?? "sandbox"), null, 2) };
      case "status":
        if (!positional[0]) return { code: 2, out: "Usage: byov status <app> [env]" };
        return { code: 0, out: JSON.stringify(await client.status(positional[0], positional[1] ?? "sandbox"), null, 2) };
      case "logs":
        if (!positional[0]) return { code: 2, out: "Usage: byov logs <app> [env]" };
        return { code: 0, out: JSON.stringify(await client.logs(positional[0], positional[1] ?? "sandbox"), null, 2) };
      case "help":
      case "--help":
        return { code: 0, out: CLI_HELP };
      default:
        return { code: 2, out: `Unknown command "${command}".\n\n${CLI_HELP}` };
    }
  } catch (error) {
    return { code: 1, out: error instanceof Error ? error.message : "Command failed." };
  }
}
