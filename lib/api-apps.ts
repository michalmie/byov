/**
 * Server-side app store for the control-plane API: the apps created over
 * `/api/v1/apps`, persisted as JSONB documents in Postgres.
 *
 * Validation mirrors the browser new-app flow (`lib/apps.ts`): names,
 * slugs and descriptions follow the same rules, every new app starts
 * with one Sandbox environment, and stacks/nodes must be known. Known
 * stacks come from the shipped catalog (`lib/stacks.ts`), known nodes
 * from the control-plane dataset (`lib/control-plane.ts`).
 *
 * Node-only (reads the database): never import from `middleware.ts`
 * (Edge) or client components.
 */

import { query, queryOne } from "@/lib/db";
import "@/db/migrations/0001_tokens_apps";
import {
  buildApp,
  parseStoredApps,
  sandboxEnv,
  validateAppDraft,
  type AppDraft,
  type AppFieldErrors,
} from "./apps";
import { listNodes, type App, type AppEnvironment } from "./control-plane";
import { listStacks } from "./stacks";

/** Lowercase labels joined by single hyphens, no edges (env names). */
const ENV_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_ENV_NAME = 60;

/** One `api_apps` row: `pg` parses the JSONB document into an object. */
interface ApiAppRow {
  slug: string;
  data: unknown;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

/** Apps created over the API, oldest first; corrupt rows are skipped. */
export async function readApiApps(): Promise<App[]> {
  const rows = await query<ApiAppRow>(
    "SELECT slug, data FROM api_apps ORDER BY created_at ASC, slug ASC",
  );
  return parseStoredApps(rows.map((row) => row.data)) ?? [];
}

/**
 * Apps created over the API. Sample apps stay a UI concern: the machine
 * API serves only real persisted state, never placeholder rows.
 */
export async function listApiApps(): Promise<App[]> {
  return readApiApps();
}

/** Find an API-created app by slug. */
export async function findApp(slug: string): Promise<App | undefined> {
  const row = await queryOne<ApiAppRow>(
    "SELECT slug, data FROM api_apps WHERE slug = $1",
    [slug],
  );
  if (!row) {
    return undefined;
  }
  return parseStoredApps([row.data])?.[0];
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
export async function createApiApp(
  input: CreateApiAppInput,
): Promise<CreateApiAppResult> {
  const stored = await readApiApps();
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
  try {
    await query("INSERT INTO api_apps (slug, data) VALUES ($1, $2)", [
      app.slug,
      JSON.stringify(app),
    ]);
  } catch (error) {
    // Lost a race with a concurrent create for the same slug: report the
    // conflict the same way validation does.
    if (isUniqueViolation(error)) {
      const raced = await readApiApps();
      const racedErrors = validateAppDraft(
        draft,
        raced,
        listNodes(),
        knownStackSlugs(),
      );
      return {
        ok: false,
        errors:
          Object.keys(racedErrors).length > 0
            ? racedErrors
            : { slug: "An app with this slug already exists." },
      };
    }
    throw error;
  }
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
export async function addApiEnv(
  slug: string,
  input: CreateApiEnvInput,
): Promise<CreateApiEnvResult> {
  const app = await findApp(slug);
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
  await query(
    "UPDATE api_apps SET data = $1, updated_at = now() WHERE slug = $2",
    [JSON.stringify(app), slug],
  );
  return { ok: true, app, env };
}

/** Find one environment of an API-created app, or null. */
export async function findAppEnv(
  slug: string,
  envName: string,
): Promise<{ app: App; env: AppEnvironment } | null> {
  const app = await findApp(slug);
  if (!app) {
    return null;
  }
  const env = app.envs.find((entry) => entry.name === envName);
  return env ? { app, env } : null;
}
