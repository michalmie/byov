/**
 * Cell completeness: per-env vars/secrets, branch previews, rollback.
 *
 * Vars live on the env document; API reads mask values (keys only
 * ever leave the server in clear). Deploys push vars to the provider
 * first. Previews are ordinary envs named `preview-<branch>` on the
 * Sandbox node; rollback redeploys the provider app and records a
 * deployment that names its source.
 */

import { sandboxEnv } from "./apps";
import type { AppEnvironment } from "./control-plane";
import { deployEnv, type DeployResult } from "./deploy";
import { recordEvent } from "./events";
import { findWorkspaceApp, saveWorkspaceApp } from "./workspace-store";

const VAR_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function validateEnvVars(
  input: unknown,
): { ok: true; vars: Record<string, string> } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Send an object of KEY: value pairs." };
  }
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!VAR_KEY.test(key)) {
      return { ok: false, error: `Invalid variable name "${key}".` };
    }
    if (typeof value !== "string") {
      return { ok: false, error: `Variable "${key}" must be a string.` };
    }
    vars[key] = value;
  }
  return { ok: true, vars };
}

/** Keys + masked values for display; raw values never serialize. */
export function maskEnvVars(
  env: AppEnvironment,
): Array<{ key: string; masked: string }> {
  return Object.entries(env.envVars ?? {})
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => ({ key, masked: value ? "••••••••" : "(empty)" }));
}

export async function setEnvVars(
  slug: string,
  envName: string,
  vars: Record<string, string>,
): Promise<{ ok: true; keys: string[] } | { ok: false; error: string }> {
  const app = await findWorkspaceApp(slug);
  const env = app?.envs.find((e) => e.name === envName);
  if (!app || !env) {
    return { ok: false, error: `No environment "${envName}" found for app "${slug}".` };
  }
  env.envVars = vars;
  await saveWorkspaceApp(app);
  return { ok: true, keys: Object.keys(vars).sort() };
}

/** DNS-safe preview env name for a branch, e.g. preview-feat-x. */
export function previewEnvName(branch: string): string {
  const label = branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `preview-${label || "branch"}`;
}

export async function createPreview(
  slug: string,
  branch: string,
  actor: string,
  deploy: (s: string, e: string, a: string) => Promise<DeployResult> = (s, e, a) => deployEnv(s, e, a),
): Promise<{ ok: true; env: AppEnvironment; deployed: boolean } | { ok: false; error: string }> {
  const app = await findWorkspaceApp(slug);
  if (!app) {
    return { ok: false, error: `No app found for slug "${slug}".` };
  }
  const sandbox = app.envs.find((e) => e.name === "sandbox") ?? app.envs[0];
  if (!sandbox) {
    return { ok: false, error: "App has no environment to preview from." };
  }
  const name = previewEnvName(branch);
  let env = app.envs.find((e) => e.name === name);
  if (!env) {
    env = { ...sandboxEnv(sandbox.node), name };
    app.envs.push(env);
    await saveWorkspaceApp(app);
    await recordEvent({ actor, text: `created preview ${name} for ${app.name} (${branch})`, appSlug: slug });
  }
  const result = await deploy(slug, name, actor);
  return { ok: true, env, deployed: result.ok };
}

/** Redeploy the provider app as a rollback to a named deployment. */
export async function rollbackEnv(
  slug: string,
  envName: string,
  deploymentId: string,
  actor: string,
  deploy: (s: string, e: string, a: string) => Promise<DeployResult> = (s, e, a) => deployEnv(s, e, a),
): Promise<{ ok: true; deploymentId: string } | { ok: false; error: string }> {
  const app = await findWorkspaceApp(slug);
  const env = app?.envs.find((e) => e.name === envName);
  if (!app || !env) {
    return { ok: false, error: `No environment "${envName}" found for app "${slug}".` };
  }
  if (!env.providerId) {
    return { ok: false, error: "Environment is not provisioned yet — nothing to roll back." };
  }
  const source = deploymentId
    ? app.deployments.find((d) => d.id === deploymentId)
    : app.deployments.find((d) => d.env === envName);
  if (deploymentId && !source) {
    return { ok: false, error: `No deployment "${deploymentId}" found for app "${slug}".` };
  }
  const result = await deploy(slug, envName, `rollback:${actor}`);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  await recordEvent({
    actor,
    text: `rolled back ${app.name} (${envName})${source ? ` to ${source.id}` : ""}`,
    appSlug: slug,
  });
  return { ok: true, deploymentId: result.deployment.id };
}
