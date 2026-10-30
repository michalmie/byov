/**
 * Machine-API facade over the unified app store.
 *
 * Apps live in one place — `workspace_apps`, owned by
 * `lib/workspace-store.ts` — so apps created from the browser
 * (`/api/workspace/apps`) and apps created over the machine API
 * (`/api/v1/apps`) are the same rows, visible from both surfaces.
 * This module keeps the `/api/v1` shapes (field errors, env rules)
 * while delegating storage and app validation to the workspace
 * store: names/slugs clash against samples too, and Sandbox nodes
 * and stacks may be workspace-defined, not only shipped samples.
 *
 * Node-only (reads the database): never import from `middleware.ts`
 * (Edge) or client components.
 */

import "@/db/migrations/0004_unify_apps";
import {
  sandboxEnv,
  type AppDraft,
  type AppFieldErrors,
} from "./apps";
import { listNodes, type App, type AppEnvironment } from "./control-plane";
import {
  createWorkspaceApp,
  findWorkspaceApp,
  listWorkspaceApps,
  listWorkspaceNodes,
  saveWorkspaceApp,
} from "./workspace-store";

/** Lowercase labels joined by single hyphens, no edges (env names). */
const ENV_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_ENV_NAME = 60;

/** Every persisted app, ordered by slug. Samples are never served. */
export async function readApiApps(): Promise<App[]> {
  return listWorkspaceApps();
}

/** Apps visible to the machine API — the same rows the UI persists. */
export async function listApiApps(): Promise<App[]> {
  return listWorkspaceApps();
}

/** Find a persisted app by slug (either creation surface). */
export async function findApp(slug: string): Promise<App | undefined> {
  return findWorkspaceApp(slug);
}

async function knownNodeSlugs(): Promise<string[]> {
  const workspace = await listWorkspaceNodes();
  return [...listNodes(), ...workspace].map((node) => node.slug);
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
 * Validate and persist a new app. Delegates to the workspace store so
 * browser and API creates enforce identical rules (sample clashes,
 * workspace nodes/stacks, Sandbox env, governed checks).
 */
export async function createApiApp(
  input: CreateApiAppInput,
): Promise<CreateApiAppResult> {
  return createWorkspaceApp(asDraft(input));
}

export interface CreateApiEnvInput {
  name: unknown;
  node: unknown;
  url: unknown;
}

export type CreateApiEnvResult =
  | { ok: true; app: App; env: AppEnvironment }
  | { ok: false; errors: Record<string, string> };

async function validateEnvInput(
  app: App,
  input: CreateApiEnvInput,
): Promise<Record<string, string>> {
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
  } else if (!(await knownNodeSlugs()).includes(node)) {
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
 * Add an environment to a persisted app. New envs start Pending until
 * the first deploy. Works for apps from either creation surface.
 */
export async function addApiEnv(
  slug: string,
  input: CreateApiEnvInput,
): Promise<CreateApiEnvResult> {
  const app = await findWorkspaceApp(slug);
  if (!app) {
    return { ok: false, errors: { app: `No app found for slug "${slug}".` } };
  }
  const errors = await validateEnvInput(app, input);
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
  await saveWorkspaceApp(app);
  return { ok: true, app, env };
}

/** Find one environment of a persisted app, or null. */
export async function findAppEnv(
  slug: string,
  envName: string,
): Promise<{ app: App; env: AppEnvironment } | null> {
  const app = await findWorkspaceApp(slug);
  if (!app) {
    return null;
  }
  const env = app.envs.find((entry) => entry.name === envName);
  return env ? { app, env } : null;
}

