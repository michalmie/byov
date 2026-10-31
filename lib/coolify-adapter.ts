/**
 * Coolify node adapter: the first real deploy target.
 *
 * Talks to a self-hosted Coolify instance over its HTTP API using the
 * node's endpoint plus a Bearer [REDACTED] from the server environment
 * (`COOLIFY_API_TOKEN`, optionally per-node `COOLIFY_TOKEN_<SLUG>`).
 * Tokens never enter Postgres or the browser — same rule as the mail
 * account fallback chain.
 *
 * The fetch surface is injectable (`CoolifyDeps`) so unit tests run
 * offline against a fake, exactly like `lib/coolify-probe.ts`. The
 * paths follow Coolify v4's real API (verified against
 * `routes/api.php` plus a live 4.x instance): typed create endpoints
 * per source, `domains` for the FQDN, bulk env writes, and deploys
 * through `POST /api/v1/deploy?uuid=…`.
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

export type CoolifyBuildPack =
  | "nixpacks"
  | "railpack"
  | "static"
  | "dockerfile"
  | "dockercompose";

/** Where a BYOV env lives inside Coolify: server + project + environment. */
export interface CoolifyTarget {
  serverUuid: string;
  projectUuid: string;
  environmentName: string;
  environmentUuid: string;
}

/** Name of the Coolify project BYOV provisions and reuses. */
export const BYOV_COOLIFY_PROJECT = "BYOV";

function baseUrl(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, "");
}

/** Bearer [REDACTED] for a node: per-node env wins, then the shared token. */
export function coolifyTokenFor(nodeSlug: string): string {
  const perNode =
    process.env[`COOLIFY_TOKEN_${nodeSlug.toUpperCase().replace(/-/g, "_")}`] ??
    "";
  return (perNode || process.env.COOLIFY_API_TOKEN || "").trim();
}

/**
 * Coolify GitHub App uuid for private repos on a node
 * (`COOLIFY_GITHUB_APP_<SLUG>`). Empty when unset — creation then
 * falls back to the public endpoint or the auto-detected app.
 */
export function coolifyGithubAppFor(nodeSlug: string): string {
  return (
    process.env[
      `COOLIFY_GITHUB_APP_${nodeSlug.toUpperCase().replace(/-/g, "_")}`
    ] ?? ""
  ).trim();
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

function asList(body: unknown): Record<string, unknown>[] {
  return Array.isArray(body) ? body.filter(isRecord) : [];
}

export class CoolifyError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function providerMessage(body: unknown): string | null {
  if (isRecord(body) && typeof body.message === "string" && body.message) {
    return body.message.slice(0, 200);
  }
  if (typeof body === "string" && body) {
    return body.slice(0, 200);
  }
  return null;
}

function ensureOk(status: number, what: string, body?: unknown): void {
  if (status >= 200 && status < 300) return;
  const detail = body === undefined ? null : providerMessage(body);
  const permission =
    status === 401 || status === 403
      ? " Check that the API token is valid and has write and deploy permissions."
      : "";
  throw new CoolifyError(
    status,
    detail
      ? `${what} failed (HTTP ${status}): ${detail}${permission}`
      : `${what} failed (HTTP ${status}).${permission}`,
  );
}

/** Usable, reachable Coolify servers (uuids only). */
export async function listServers(
  endpoint: string,
  token: string,
  deps: CoolifyDeps = liveDeps,
): Promise<string[]> {
  const res = await deps.fetchJson(`${baseUrl(endpoint)}/api/v1/servers`, {
    method: "GET",
    token,
  });
  ensureOk(res.status, "List Coolify servers", res.body);
  return asList(res.body)
    .filter((s) => s.is_usable === true && s.is_reachable !== false)
    .map((s) => (typeof s.uuid === "string" ? s.uuid : ""))
    .filter(Boolean);
}

interface CoolifyProject {
  uuid: string;
  name: string;
}

async function listProjects(
  endpoint: string,
  token: string,
  deps: CoolifyDeps,
): Promise<CoolifyProject[]> {
  const res = await deps.fetchJson(`${baseUrl(endpoint)}/api/v1/projects`, {
    method: "GET",
    token,
  });
  ensureOk(res.status, "List Coolify projects", res.body);
  return asList(res.body)
    .filter((p) => typeof p.uuid === "string" && typeof p.name === "string")
    .map((p) => ({ uuid: p.uuid as string, name: p.name as string }));
}

async function createProject(
  endpoint: string,
  token: string,
  name: string,
  deps: CoolifyDeps,
): Promise<string> {
  const res = await deps.fetchJson(`${baseUrl(endpoint)}/api/v1/projects`, {
    method: "POST",
    token,
    body: { name, description: "Managed by BYOV" },
  });
  ensureOk(res.status, "Create Coolify project", res.body);
  const uuid = uuidOf(res.body);
  if (!uuid) {
    throw new CoolifyError(res.status, "Coolify did not return a project uuid.");
  }
  return uuid;
}

interface CoolifyEnvironment {
  uuid: string;
  name: string;
}

async function listEnvironments(
  endpoint: string,
  token: string,
  projectUuid: string,
  deps: CoolifyDeps,
): Promise<CoolifyEnvironment[]> {
  const res = await deps.fetchJson(
    `${baseUrl(endpoint)}/api/v1/projects/${encodeURIComponent(projectUuid)}/environments`,
    { method: "GET", token },
  );
  ensureOk(res.status, "List Coolify environments", res.body);
  return asList(res.body)
    .filter((e) => typeof e.uuid === "string" && typeof e.name === "string")
    .map((e) => ({ uuid: e.uuid as string, name: e.name as string }));
}

async function createEnvironment(
  endpoint: string,
  token: string,
  projectUuid: string,
  name: string,
  deps: CoolifyDeps,
): Promise<string> {
  const res = await deps.fetchJson(
    `${baseUrl(endpoint)}/api/v1/projects/${encodeURIComponent(projectUuid)}/environments`,
    { method: "POST", token, body: { name } },
  );
  ensureOk(res.status, "Create Coolify environment", res.body);
  const uuid = uuidOf(res.body);
  if (!uuid) {
    throw new CoolifyError(res.status, "Coolify did not return an environment uuid.");
  }
  return uuid;
}

/**
 * Resolve (creating when missing) the Coolify home for a BYOV env:
 * the single usable server, the shared BYOV project, and an
 * environment named after the BYOV env.
 */
export async function ensureCoolifyTarget(
  endpoint: string,
  token: string,
  envName: string,
  deps: CoolifyDeps = liveDeps,
): Promise<CoolifyTarget> {
  const servers = await listServers(endpoint, token, deps);
  if (servers.length === 0) {
    throw new CoolifyError(
      0,
      "Coolify reports no usable server — finish the server setup in Coolify first.",
    );
  }
  const serverUuid = servers[0] ?? "";
  if (servers.length > 1 || !serverUuid) {
    throw new CoolifyError(
      0,
      `Coolify reports ${servers.length} usable servers — pinning one per node lands in a later slice.`,
    );
  }
  const projects = await listProjects(endpoint, token, deps);
  const projectUuid =
    projects.find((p) => p.name === BYOV_COOLIFY_PROJECT)?.uuid ??
    (await createProject(endpoint, token, BYOV_COOLIFY_PROJECT, deps));
  const environments = await listEnvironments(endpoint, token, projectUuid, deps);
  const environmentUuid =
    environments.find((e) => e.name === envName)?.uuid ??
    (await createEnvironment(endpoint, token, projectUuid, envName, deps));
  return { serverUuid, projectUuid, environmentName: envName, environmentUuid };
}

interface CoolifyGithubApp {
  uuid: string;
  isPublic: boolean;
}

async function listGithubApps(
  endpoint: string,
  token: string,
  deps: CoolifyDeps,
): Promise<CoolifyGithubApp[]> {
  const res = await deps.fetchJson(`${baseUrl(endpoint)}/api/v1/github-apps`, {
    method: "GET",
    token,
  });
  ensureOk(res.status, "List Coolify GitHub Apps", res.body);
  return asList(res.body)
    .filter((a) => typeof a.uuid === "string")
    .map((a) => ({ uuid: a.uuid as string, isPublic: a.is_public === true }));
}

/**
 * GitHub App uuid for private-repo creates: the explicit value wins;
 * otherwise the single private app is used when there is exactly one.
 * Null means public endpoint (or a clear error when several exist —
 * the caller tells the operator to pin one).
 */
export async function resolveGithubAppUuid(
  endpoint: string,
  token: string,
  explicit: string | null,
  deps: CoolifyDeps = liveDeps,
): Promise<string | null> {
  if (explicit?.trim()) return explicit.trim();
  const apps = await listGithubApps(endpoint, token, deps);
  const privates = apps.filter((a) => !a.isPublic);
  if (privates.length === 1) return privates[0]?.uuid ?? null;
  return null;
}

function githubShortForm(repo: string): string | null {
  const trimmed = repo.trim();
  const full = trimmed.match(
    /^https?:\/\/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?(?:\/.*)?$/i,
  );
  if (full?.[1]) return full[1];
  if (/^[\w.-]+\/[\w.-]+$/.test(trimmed)) return trimmed;
  return null;
}

function looksLikeGithubRepo(repo: string): boolean {
  return githubShortForm(repo) !== null;
}

export interface CreateApplicationInput {
  name: string;
  /** Full BYOV-resolved URL(s), comma-separated; null when unknown. */
  domains: string | null;
  gitRepository: string;
  gitBranch: string;
  buildPack: CoolifyBuildPack;
  portsExposes: string;
  target: CoolifyTarget;
  /** Coolify GitHub App uuid for private repos; null/blank → public. */
  githubAppUuid?: string | null;
}

/**
 * Create a Coolify application for one BYOV env; returns its uuid.
 * Private GitHub repos go through the private-github-app endpoint,
 * everything else through the public endpoint.
 */
export async function createApplication(
  endpoint: string,
  token: string,
  input: CreateApplicationInput,
  deps: CoolifyDeps = liveDeps,
): Promise<CoolifyAppRef> {
  const gitRepository = input.gitRepository.trim();
  const gitBranch = input.gitBranch.trim() || "main";
  if (!gitRepository) {
    throw new CoolifyError(
      400,
      "Cannot create the Coolify application without a git repository — link the app repo first.",
    );
  }
  const githubAppUuid = input.githubAppUuid?.trim() || "";
  const viaGithubApp = Boolean(githubAppUuid) && looksLikeGithubRepo(gitRepository);
  const path = viaGithubApp ? "private-github-app" : "public";
  const res = await deps.fetchJson(
    `${baseUrl(endpoint)}/api/v1/applications/${path}`,
    {
      method: "POST",
      token,
      body: {
        name: input.name,
        project_uuid: input.target.projectUuid,
        server_uuid: input.target.serverUuid,
        environment_name: input.target.environmentName,
        git_repository: viaGithubApp
          ? (githubShortForm(gitRepository) ?? gitRepository)
          : gitRepository,
        git_branch: gitBranch,
        build_pack: input.buildPack,
        ports_exposes: input.portsExposes,
        ...(viaGithubApp ? { github_app_uuid: githubAppUuid } : {}),
        ...(input.domains ? { domains: input.domains } : {}),
        // BYOV deploys through its own gates — pushes must not ship directly.
        is_auto_deploy_enabled: false,
        is_force_https_enabled: true,
      },
    },
  );
  ensureOk(res.status, "Create Coolify application", res.body);
  const uuid = uuidOf(res.body);
  if (!uuid) {
    throw new CoolifyError(res.status, "Coolify did not return an application uuid.");
  }
  return { uuid };
}

/** Point a Coolify application at its BYOV-resolved domains. */
export async function updateApplicationFqdn(
  endpoint: string,
  token: string,
  uuid: string,
  fqdn: string,
  deps: CoolifyDeps = liveDeps,
): Promise<void> {
  const res = await deps.fetchJson(
    `${baseUrl(endpoint)}/api/v1/applications/${encodeURIComponent(uuid)}`,
    { method: "PATCH", token, body: { domains: fqdn } },
  );
  ensureOk(res.status, "Update Coolify FQDN", res.body);
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
    `${baseUrl(endpoint)}/api/v1/applications/${encodeURIComponent(uuid)}/envs/bulk`,
    {
      method: "PATCH",
      token,
      body: { data: Object.entries(vars).map(([key, value]) => ({ key, value })) },
    },
  );
  ensureOk(res.status, "Set Coolify env vars", res.body);
}

/** Trigger a deployment; returns the provider deployment id if given. */
export async function deployApplication(
  endpoint: string,
  token: string,
  uuid: string,
  deps: CoolifyDeps = liveDeps,
): Promise<{ deploymentId: string | null }> {
  const res = await deps.fetchJson(
    `${baseUrl(endpoint)}/api/v1/deploy?uuid=${encodeURIComponent(uuid)}`,
    { method: "POST", token, body: {} },
  );
  ensureOk(res.status, "Deploy via Coolify", res.body);
  const deployments =
    isRecord(res.body) && Array.isArray(res.body.deployments)
      ? res.body.deployments.filter(isRecord)
      : [];
  const first = deployments[0]?.deployment_uuid;
  if (typeof first === "string" && first) return { deploymentId: first };
  const direct =
    isRecord(res.body) && typeof res.body.deployment_uuid === "string"
      ? res.body.deployment_uuid
      : null;
  if (direct) return { deploymentId: direct };
  const legacy = uuidOf(res.body);
  return { deploymentId: legacy };
}

/** Delete a Coolify application (cleanup; irreversible). */
export async function deleteApplication(
  endpoint: string,
  token: string,
  uuid: string,
  deps: CoolifyDeps = liveDeps,
): Promise<void> {
  const res = await deps.fetchJson(
    `${baseUrl(endpoint)}/api/v1/applications/${encodeURIComponent(uuid)}`,
    { method: "DELETE", token },
  );
  ensureOk(res.status, "Delete Coolify application", res.body);
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
  ensureOk(res.status, "Read Coolify application", res.body);
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
  ensureOk(res.status, "Read Coolify logs", res.body);
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
