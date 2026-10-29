/**
 * Server-side app store for the control-plane API: the apps created over
 * `/api/v1/apps`, persisted as JSON under the server data dir.
 *
 * Validation mirrors the browser new-app flow (`lib/apps.ts`): names,
 * slugs and descriptions follow the same rules, every new app starts
 * with one Sandbox environment, and stacks/nodes must be known. Known
 * stacks come from the shipped catalog (`lib/stacks.ts`), known nodes
 * from the control-plane dataset (`lib/control-plane.ts`).
 *
 * Node-only (reads the data dir): never import from `middleware.ts`
 * (Edge) or client components.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildApp,
  parseStoredApps,
  sandboxEnv,
  validateAppDraft,
  type AppDraft,
  type AppFieldErrors,
} from "./apps";
import { listNodes, type App, type AppEnvironment } from "./control-plane";
import { getServerDataDir } from "./api-tokens";
import { listStacks } from "./stacks";

export const API_APPS_FILE_NAME = "apps.json";

/** Lowercase labels joined by single hyphens, no edges (env names). */
const ENV_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_ENV_NAME = 60;

export function getApiAppsFilePath(): string {
  return join(getServerDataDir(), API_APPS_FILE_NAME);
}

/** Apps created over the API; a missing or corrupt file reads as []. */
export function readApiApps(): App[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(getApiAppsFilePath(), "utf8"));
  } catch {
    return [];
  }
  const apps = isAppsFile(parsed) ? parseStoredApps(parsed.apps) : undefined;
  return apps ?? [];
}

function isAppsFile(value: unknown): value is { apps: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "apps" in value
  );
}

function writeApiApps(apps: App[]): void {
  mkdirSync(getServerDataDir(), { recursive: true });
  writeFileSync(getApiAppsFilePath(), `${JSON.stringify({ apps })}\n`, {
    mode: 0o600,
  });
}

/**
 * Apps created over the API. Sample apps stay a UI concern: the machine
 * API serves only real persisted state, never placeholder rows.
 */
export function listApiApps(): App[] {
  return readApiApps();
}

/** Find an API-created app by slug. */
export function findApp(slug: string): App | undefined {
  return readApiApps().find((app) => app.slug === slug);
}

function knownNodeSlugs(): string[] {
  return listNodes().map((node) => node.slug);
}

function knownStackSlugs(): string[] {
  return listStacks().map((stack) => stack.slug);
}

export interface CreateApiAppInput {
  name: unknown;
  slug: unknown;
  description: unknown;
  stack: unknown;
  node: unknown;
}

function asDraft(input: CreateApiAppInput): AppDraft {
  return {
    name: typeof input.name === "string" ? input.name : "",
    slug: typeof input.slug === "string" ? input.slug : "",
    description:
      typeof input.description === "string" ? input.description : "",
    stack: typeof input.stack === "string" ? input.stack : "",
    node: typeof input.node === "string" ? input.node : "",
  };
}

export type CreateApiAppResult =
  | { ok: true; app: App }
  | { ok: false; errors: AppFieldErrors };

/**
 * Validate and persist a new API-created app. Mirrors the browser flow:
 * blank slugs derive from the name, every app starts with one Sandbox
 * environment on the chosen node.
 */
export function createApiApp(input: CreateApiAppInput): CreateApiAppResult {
  const stored = readApiApps();
  const draft = asDraft(input);
  const errors = validateAppDraft(
    draft,
    stored,
    listNodes(),
    knownStackSlugs(),
  );
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  const app = buildApp(draft, stored);
  stored.push(app);
  writeApiApps(stored);
  return { ok: true, app };
}

export interface CreateApiEnvInput {
  name: unknown;
  node: unknown;
  url: unknown;
}

export type CreateApiEnvResult =
  | { ok: true; app: App; env: AppEnvironment }
  | { ok: false; errors: Record<string, string> };

function validateEnvInput(
  app: App,
  input: CreateApiEnvInput,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) {
    errors.name = "Give the environment a name.";
  } else if (name.length > MAX_ENV_NAME) {
    errors.name = `Keep the name under ${MAX_ENV_NAME} characters.`;
  } else if (!ENV_NAME_PATTERN.test(name)) {
    errors.name =
      "Use lowercase letters, numbers and hyphens, e.g. staging.";
  } else if (app.envs.some((env) => env.name === name)) {
    errors.name = `The app already has a "${name}" environment.`;
  }
  const node = typeof input.node === "string" ? input.node.trim() : "";
  if (!node) {
    errors.node = "Choose the node hosting the environment.";
  } else if (!knownNodeSlugs().includes(node)) {
    errors.node = "Choose one of the known nodes.";
  }
  const url = typeof input.url === "string" ? input.url.trim() : "";
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        errors.url = "Use an http(s) URL override, or leave it blank.";
      }
    } catch {
      errors.url = "Use an http(s) URL override, or leave it blank.";
    }
  }
  return errors;
}

/**
 * Add an environment to an API-created app. New envs start Pending until
 * the first deploy.
 */
export function addApiEnv(
  slug: string,
  input: CreateApiEnvInput,
): CreateApiEnvResult {
  const stored = readApiApps();
  const app = stored.find((entry) => entry.slug === slug);
  if (!app) {
    return { ok: false, errors: { app: `No app found for slug "${slug}".` } };
  }
  const errors = validateEnvInput(app, input);
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  const name = (input.name as string).trim();
  const node = (input.node as string).trim();
  const url = typeof input.url === "string" ? input.url.trim() : "";
  const env: AppEnvironment = {
    ...sandboxEnv(node),
    name,
    ...(url ? { url } : {}),
  };
  app.envs.push(env);
  writeApiApps(stored);
  return { ok: true, app, env };
}

/** Find one environment of an API-created app, or null. */
export function findAppEnv(
  slug: string,
  envName: string,
): { app: App; env: AppEnvironment } | null {
  const app = findApp(slug);
  if (!app) {
    return null;
  }
  const env = app.envs.find((entry) => entry.name === envName);
  return env ? { app, env } : null;
}
