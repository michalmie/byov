// Workspace apps: pure draft logic for creating apps in the browser.
// No DOM access here so every rule stays unit-testable;
// lib/apps-store.ts owns the hooks. Every new app starts with one
// Sandbox environment; the owner guide on the app page walks them
// from scaffold to first Sandbox deploy.

import type {
  App,
  AppEnvironment,
  Check,
  CheckStatus,
  Deployment,
  Health,
  Node,
} from "./control-plane";

export const APPS_STORAGE_KEY = "byov:apps:v1";

/** Default environment every new app starts with. */
export const SANDBOX_ENV_NAME = "sandbox";

const MAX_NAME = 60;
const MAX_SLUG = 60;
const MAX_DESCRIPTION = 2000;

/** Lowercase labels joined by single hyphens, no edges. */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Raw form values for creating an app. */
export interface AppDraft {
  name: string;
  /** Explicit slug; blank derives from the name. */
  slug: string;
  description: string;
  /** Tech stack slug from the managed catalog. */
  stack: string;
  /** Node slug the Sandbox environment pins to. */
  node: string;
  /** Optional source repository to link at creation. */
  repoUrl?: string;
  /** Optional watched branch for the linked repo. */
  branch?: string;
}

export type AppField =
  | "name"
  | "slug"
  | "description"
  | "stack"
  | "node"
  | "repoUrl"
  | "branch";
export type AppFieldErrors = Partial<Record<AppField, string>>;

export function slugifyAppName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function uniqueAppSlug(
  name: string,
  existingSlugs: readonly string[],
): string {
  const base = slugifyAppName(name) || "app";
  if (!existingSlugs.includes(base)) {
    return base;
  }
  let counter = 2;
  while (existingSlugs.includes(`${base}-${counter}`)) {
    counter += 1;
  }
  return `${base}-${counter}`;
}

export function validateAppDraft(
  draft: AppDraft,
  existing: readonly App[],
  nodes: readonly Node[],
  knownStacks: readonly string[],
): AppFieldErrors {
  const errors: AppFieldErrors = {};

  const name = draft.name.trim();
  if (!name) {
    errors.name = "Give the app a name.";
  } else if (name.length > MAX_NAME) {
    errors.name = `Keep the name under ${MAX_NAME} characters.`;
  } else if (
    existing.some(
      (app) => app.name.trim().toLowerCase() === name.toLowerCase(),
    )
  ) {
    errors.name = "An app with this name already exists.";
  }

  const explicitSlug = draft.slug.trim();
  if (explicitSlug) {
    if (explicitSlug.length > MAX_SLUG) {
      errors.slug = `Keep the slug under ${MAX_SLUG} characters.`;
    } else if (!SLUG_PATTERN.test(explicitSlug)) {
      errors.slug =
        "Use lowercase letters, numbers and hyphens, e.g. rota-planner.";
    } else if (existing.some((app) => app.slug === explicitSlug)) {
      errors.slug = "An app with this slug already exists.";
    }
  } else {
    const derived = slugifyAppName(name);
    if (!derived) {
      errors.slug =
        "Use a name with letters or numbers, or set the slug explicitly.";
    } else if (existing.some((app) => app.slug === derived)) {
      errors.slug =
        "An app with this slug already exists — set a different slug.";
    }
  }

  const description = draft.description.trim();
  if (description.length > MAX_DESCRIPTION) {
    errors.description = `Keep the description under ${MAX_DESCRIPTION} characters.`;
  }

  if (draft.stack.trim() && !knownStacks.includes(draft.stack)) {
    errors.stack = "Choose one of the known tech stacks.";
  }

  if (!draft.node.trim()) {
    errors.node = "Choose the node hosting the Sandbox.";
  } else if (!nodes.some((node) => node.slug === draft.node)) {
    errors.node = "Choose one of the known nodes.";
  }

  const repoUrl = (draft.repoUrl ?? "").trim();
  if (repoUrl && !isRepoUrl(repoUrl)) {
    errors.repoUrl = "Enter an https or git repository URL.";
  }
  const branch = (draft.branch ?? "").trim();
  if (branch && !/^[A-Za-z0-9._/-]+$/.test(branch)) {
    errors.branch = "Enter a branch name, e.g. main.";
  }

  return errors;
}

/** True for an https/git repository URL the pipeline can watch. */
export function isRepoUrl(value: string): boolean {
  const v = value.trim();
  if (/^git@[^:]+:.+/.test(v)) return true;
  try {
    const url = new URL(v);
    return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "git:";
  } catch {
    return false;
  }
}

/** The five governed gates, green until the first run proves otherwise. */
export function standardNewAppChecks(): Check[] {
  return [
    { name: "Unit tests", type: "unit", cadence: "Every change", status: "pass" },
    { name: "Lint", type: "gate", cadence: "Every change", status: "pass" },
    { name: "Production build", type: "gate", cadence: "Every change", status: "pass" },
    { name: "DLP scan", type: "gate", cadence: "Every change", status: "pass" },
    { name: "Dependency audit", type: "gate", cadence: "Nightly", status: "pass" },
  ];
}

/** The default environment: pending until the first Sandbox deploy. */
export function sandboxEnv(nodeSlug: string): AppEnvironment {
  return { name: SANDBOX_ENV_NAME, node: nodeSlug, status: "pending" };
}

/** Build a validated draft into a workspace app. */
export function buildApp(draft: AppDraft, existing: readonly App[]): App {
  const explicitSlug = draft.slug.trim();
  const repoUrl = (draft.repoUrl ?? "").trim();
  const branch = (draft.branch ?? "").trim();
  return {
    slug: explicitSlug
      ? explicitSlug
      : uniqueAppSlug(
          draft.name,
          existing.map((app) => app.slug),
        ),
    name: draft.name.trim(),
    stack: draft.stack.trim(),
    description: draft.description.trim(),
    checks: standardNewAppChecks(),
    envs: [sandboxEnv(draft.node)],
    deployments: [],
    ...(repoUrl ? { repoUrl } : {}),
    ...(branch ? { branch } : {}),
  };
}

/** True when the app still has its default Sandbox environment. */
export function hasSandboxEnv(app: App): boolean {
  return app.envs.some((env) => env.name === SANDBOX_ENV_NAME);
}

/** True while the owner still needs the Sandbox setup guide. */
export function needsSandboxSetup(app: App): boolean {
  return hasSandboxEnv(app) && app.deployments.length === 0;
}

const storedStatuses: readonly Health[] = [
  "healthy",
  "deploying",
  "degraded",
  "down",
  "pending",
];

const storedCheckStatuses: readonly CheckStatus[] = ["pass", "fail", "running"];

const storedDeployStatuses = ["live", "failed", "running"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseChecks(value: unknown): Check[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const checks: Check[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      return undefined;
    }
    const { name, type, cadence, status } = entry;
    if (
      typeof name !== "string" ||
      !name ||
      typeof type !== "string" ||
      !type ||
      typeof cadence !== "string" ||
      !cadence ||
      typeof status !== "string" ||
      !(storedCheckStatuses as readonly string[]).includes(status)
    ) {
      return undefined;
    }
    checks.push({ name, type, cadence, status: status as CheckStatus });
  }
  return checks;
}

function parseEnvs(value: unknown): AppEnvironment[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const envs: AppEnvironment[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      return undefined;
    }
    const { name, node, status, url, providerId, envVars } = entry;
    if (
      typeof name !== "string" ||
      !name ||
      typeof node !== "string" ||
      !node ||
      typeof status !== "string" ||
      !(storedStatuses as readonly string[]).includes(status)
    ) {
      return undefined;
    }
    const parsedVars: Record<string, string> = {};
    if (isRecord(envVars)) {
      for (const [k, v] of Object.entries(envVars)) {
        if (typeof v === "string") parsedVars[k] = v;
      }
    }
    envs.push({
      name,
      node,
      status: status as Health,
      ...(typeof url === "string" && url ? { url } : {}),
      ...(typeof providerId === "string" && providerId
        ? { providerId }
        : {}),
      ...(Object.keys(parsedVars).length > 0 ? { envVars: parsedVars } : {}),
    });
  }
  return envs;
}

function parseDeployments(value: unknown): Deployment[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const deployments: Deployment[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      return undefined;
    }
    const { id, env, status, when, by } = entry;
    if (
      typeof id !== "string" ||
      !id ||
      typeof env !== "string" ||
      !env ||
      typeof status !== "string" ||
      !(storedDeployStatuses as readonly string[]).includes(status) ||
      typeof when !== "string" ||
      typeof by !== "string"
    ) {
      return undefined;
    }
    deployments.push({
      id,
      env,
      status: status as Deployment["status"],
      when,
      by,
    });
  }
  return deployments;
}

/** Parse stored workspace apps; undefined means "fall back to sample data". */
export function parseStoredApps(value: unknown): App[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const apps: App[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    const { slug, name, stack, description, checks, envs, deployments, repoUrl, branch } = entry;
    if (
      typeof slug !== "string" ||
      !slug ||
      typeof name !== "string" ||
      !name ||
      typeof stack !== "string" ||
      typeof description !== "string"
    ) {
      continue;
    }
    const parsedChecks = parseChecks(checks);
    const parsedEnvs = parseEnvs(envs);
    const parsedDeployments = parseDeployments(deployments);
    if (!parsedChecks || !parsedEnvs || !parsedDeployments) {
      continue;
    }
    apps.push({
      slug,
      name,
      stack,
      description,
      checks: parsedChecks,
      envs: parsedEnvs,
      deployments: parsedDeployments,
      ...(typeof repoUrl === "string" && repoUrl ? { repoUrl } : {}),
      ...(typeof branch === "string" && branch ? { branch } : {}),
    });
  }
  return apps;
}
