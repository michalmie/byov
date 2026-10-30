/**
 * Coolify node adapter: the first real deploy target.
 *
 * Talks to a self-hosted Coolify instance over its HTTP API using the
 * node's endpoint plus a bearer token from the server environment
 * (`COOLIFY_API_TOKEN`, optionally per-node `COOLIFY_TOKEN_<SLUG>`).
 * Tokens never enter Postgres or the browser — same rule as the mail
 * account fallback chain.
 *
 * The fetch surface is injectable (`CoolifyDeps`) so unit tests run
 * offline against a fake, exactly like `lib/coolify-probe.ts`. The
 * live API paths follow Coolify's v1 applications API; a live spike
 * against a real instance remains the acceptance check for Pack 2.
 *
 * Node-only: never import from middleware (Edge) or client code.
 */

import type { Health } from "./control-plane";

export interface CoolifyDeps {
  fetchJson(
    url: string,
    init: { method: string; token: string; body?: unknown },
  ): Promise<{ status: number; body: unknown }>;
}

export interface CoolifyAppRef {
  uuid: string;
  fqdn?: string;
  status?: string;
}

function baseUrl(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, "");
}

/** Bearer token for a node: per-node env wins, then the shared token. */
export function coolifyTokenFor(nodeSlug: string): string {
  const perNode =
    process.env[`COOLIFY_TOKEN_${nodeSlug.toUpperCase().replace(/-/g, "_")}`] ??
    "";
  return (perNode || process.env.COOLIFY_API_TOKEN || "").trim();
}

async function fetchJsonLive(
  url: string,
  init: { method: string; token: string; body?: unknown },
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, {
    method: init.method,
    headers: {
      authorization: `Bearer ${init.token}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, body };
}

const liveDeps: CoolifyDeps = { fetchJson: fetchJsonLive };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function uuidOf(body: unknown): string | null {
  if (!isRecord(body)) return null;
  const uuid = body.uuid ?? body.id;
  return typeof uuid === "string" && uuid ? uuid : null;
}

export class CoolifyError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function ensureOk(status: number, what: string): void {
  if (status < 200 || status >= 300) {
    throw new CoolifyError(status, `${what} failed (HTTP ${status}).`);
  }
}

/** Create a Coolify application for one BYOV env; returns its uuid. */
export async function createApplication(
  endpoint: string,
  token: string,
  input: { name: string; fqdn: string | null; gitRepo?: string; branch?: string },
  deps: CoolifyDeps = liveDeps,
): Promise<CoolifyAppRef> {
  const res = await deps.fetchJson(`${baseUrl(endpoint)}/api/v1/applications`, {
    method: "POST",
    token,
    body: {
      name: input.name,
      ...(input.fqdn ? { fqdn: input.fqdn } : {}),
      ...(input.gitRepo ? { git_repository: input.gitRepo } : {}),
      ...(input.branch ? { git_branch: input.branch } : {}),
    },
  });
  ensureOk(res.status, "Create Coolify application");
  const uuid = uuidOf(res.body);
  if (!uuid) {
    throw new CoolifyError(res.status, "Coolify did not return an application uuid.");
  }
  return { uuid };
}

/** Point a Coolify application at its BYOV-resolved FQDN. */
export async function updateApplicationFqdn(
  endpoint: string,
  token: string,
  uuid: string,
  fqdn: string,
  deps: CoolifyDeps = liveDeps,
): Promise<void> {
  const res = await deps.fetchJson(
    `${baseUrl(endpoint)}/api/v1/applications/${encodeURIComponent(uuid)}`,
    { method: "PATCH", token, body: { fqdn } },
  );
  ensureOk(res.status, "Update Coolify FQDN");
}

/** Replace a Coolify application's env vars (deploy picks them up). */
export async function setApplicationEnvVars(
  endpoint: string,
  token: string,
  uuid: string,
  vars: Record<string, string>,
  deps: CoolifyDeps = liveDeps,
): Promise<void> {
  const res = await deps.fetchJson(
    `${baseUrl(endpoint)}/api/v1/applications/${encodeURIComponent(uuid)}/envs`,
    { method: "PUT", token, body: { envs: vars } },
  );
  ensureOk(res.status, "Set Coolify env vars");
}

/** Trigger a deployment; returns the provider deployment id if given. */
export async function deployApplication(
  endpoint: string,
  token: string,
  uuid: string,
  deps: CoolifyDeps = liveDeps,
): Promise<{ deploymentId: string | null }> {
  const res = await deps.fetchJson(
    `${baseUrl(endpoint)}/api/v1/applications/${encodeURIComponent(uuid)}/deploy`,
    { method: "POST", token, body: {} },
  );
  ensureOk(res.status, "Deploy via Coolify");
  const id =
    isRecord(res.body) && typeof res.body.deployment_id === "string"
      ? res.body.deployment_id
      : isRecord(res.body) && typeof res.body.id === "string"
        ? res.body.id
        : null;
  return { deploymentId: id };
}

/** Read a Coolify application's status/FQDN. */
export async function getApplication(
  endpoint: string,
  token: string,
  uuid: string,
  deps: CoolifyDeps = liveDeps,
): Promise<CoolifyAppRef> {
  const res = await deps.fetchJson(
    `${baseUrl(endpoint)}/api/v1/applications/${encodeURIComponent(uuid)}`,
    { method: "GET", token },
  );
  ensureOk(res.status, "Read Coolify application");
  const uuidOut = uuidOf(res.body) ?? uuid;
  const fqdn =
    isRecord(res.body) && typeof res.body.fqdn === "string"
      ? res.body.fqdn
      : undefined;
  const status =
    isRecord(res.body) && typeof res.body.status === "string"
      ? res.body.status
      : undefined;
  return { uuid: uuidOut, fqdn, status };
}

/** Recent log lines for a Coolify application (plain text). */
export async function getApplicationLogs(
  endpoint: string,
  token: string,
  uuid: string,
  deps: CoolifyDeps = liveDeps,
): Promise<string> {
  const res = await deps.fetchJson(
    `${baseUrl(endpoint)}/api/v1/applications/${encodeURIComponent(uuid)}/logs`,
    { method: "GET", token },
  );
  ensureOk(res.status, "Read Coolify logs");
  if (typeof res.body === "string") return res.body;
  if (isRecord(res.body) && typeof res.body.logs === "string") return res.body.logs;
  return JSON.stringify(res.body ?? "");
}

export interface CoolifyVerifyResult {
  ok: boolean;
  status: number;
  detail: string;
}

/**
 * Verify endpoint + token with one authenticated read. 2xx means the
 * token works; 401/403 means Coolify rejected it; anything else is
 * reported plainly without leaking the token.
 */
export async function verifyCoolifyConnection(
  endpoint: string,
  token: string,
  deps: CoolifyDeps = liveDeps,
): Promise<CoolifyVerifyResult> {
  try {
    const res = await deps.fetchJson(`${baseUrl(endpoint)}/api/v1/applications`, {
      method: "GET",
      token,
    });
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, status: res.status, detail: "Coolify accepted the API token." };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        status: res.status,
        detail: "Coolify rejected the API token — create a new token in Coolify and paste it again.",
      };
    }
    return {
      ok: false,
      status: res.status,
      detail: `Coolify answered HTTP ${res.status} — check the endpoint URL.`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      detail: error instanceof Error ? error.message : "Could not reach Coolify.",
    };
  }
}

/** Map a Coolify application status onto BYOV health. */
export function coolifyStatusToHealth(status: string | undefined): Health {
  const s = (status ?? "").toLowerCase();
  if (s.includes("running") || s.includes("healthy")) return "healthy";
  if (s.includes("deploy") || s.includes("restart") || s.includes("build")) {
    return "deploying";
  }
  if (s.includes("degrad") || s.includes("unhealthy")) return "degraded";
  if (s.includes("exit") || s.includes("stop") || s.includes("down") || s.includes("fail")) {
    return "down";
  }
  return "pending";
}
