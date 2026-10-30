/**
 * Deploy orchestration: app env → node → Coolify application.
 *
 * Resolves the env's URL through the dev-URL contract (`lib/dev-urls`),
 * provisions or reuses the Coolify application, points its FQDN at
 * that URL, triggers a deploy, and records the outcome on the unified
 * app store (env status + a `Deployment` row). First successful contact
 * flips a Pending workspace node to healthy.
 *
 * Node-only. Coolify calls go through `lib/coolify-adapter` with
 * injectable deps so tests fake the provider; Vercel nodes are
 * rejected clearly until their adapter lands.
 */

import type { App, Deployment, Node } from "./control-plane";
import { listNodes } from "./control-plane";
import {
  coolifyStatusToHealth,
  coolifyTokenFor,
  createApplication,
  deployApplication,
  getApplication,
  getApplicationLogs,
  updateApplicationFqdn,
  type CoolifyDeps,
} from "./coolify-adapter";
import { resolveEnvUrl } from "./dev-urls";
import {
  findWorkspaceApp,
  getWorkspaceSettings,
  listWorkspaceApps,
  listWorkspaceNodes,
  saveWorkspaceApp,
  touchWorkspaceNode,
} from "./workspace-store";

export type DeployResult =
  | { ok: true; app: App; deployment: Deployment; providerId: string }
  | { ok: false; error: string };

async function findNode(slug: string): Promise<Node | undefined> {
  const workspace = await listWorkspaceNodes();
  return (
    workspace.find((n) => n.slug === slug) ??
    listNodes().find((n) => n.slug === slug)
  );
}

function deploymentId(): string {
  return `dpl_${Math.random().toString(36).slice(2, 8)}`;
}

/** Deploy one env. `actor` is recorded on the deployment row. */
export async function deployEnv(
  slug: string,
  envName: string,
  actor: string,
  deps?: CoolifyDeps,
): Promise<DeployResult> {
  const app = await findWorkspaceApp(slug);
  if (!app) {
    return { ok: false, error: `No app found for slug "${slug}".` };
  }
  const env = app.envs.find((e) => e.name === envName);
  if (!env) {
    return {
      ok: false,
      error: `No environment "${envName}" found for app "${slug}".`,
    };
  }
  const node = await findNode(env.node);
  if (!node) {
    return { ok: false, error: `Environment is pinned to unknown node "${env.node}".` };
  }
  if (node.kind !== "Coolify") {
    return {
      ok: false,
      error: `Deploys to ${node.kind} nodes land in a later slice; this env is pinned to "${node.name}".`,
    };
  }
  const endpoint = node.endpoint?.trim();
  if (!endpoint) {
    return {
      ok: false,
      error: `Node "${node.name}" has no endpoint yet — add it in Settings → Nodes.`,
    };
  }
  const token = coolifyTokenFor(node.slug);
  if (!token) {
    return {
      ok: false,
      error: "No Coolify API token configured — set COOLIFY_API_TOKEN on the BYOV server.",
    };
  }

  const settings = await getWorkspaceSettings();
  const nodes = [...listNodes(), ...(await listWorkspaceNodes())];
  const apps = [...(await listWorkspaceApps())];
  const resolved = resolveEnvUrl(slug, env, {
    nodes,
    apps: [app, ...apps.filter((a) => a.slug !== slug)],
    devZone: settings.devZone,
    tailnetDomain: settings.tailnetDomain,
    defaultScenario: settings.defaultScenario,
    appScenarios: settings.appScenarios,
  });

  try {
    let providerId = env.providerId;
    if (!providerId) {
      const created = await createApplication(
        endpoint,
        token,
        { name: `${slug}-${envName}`, fqdn: resolved.url },
        deps,
      );
      providerId = created.uuid;
    } else if (resolved.url) {
      await updateApplicationFqdn(endpoint, token, providerId, resolved.url, deps);
    }
    const { deploymentId: providerDeployId } = await deployApplication(
      endpoint,
      token,
      providerId,
      deps,
    );

    const deployment: Deployment = {
      id: providerDeployId ?? deploymentId(),
      env: envName,
      status: "running",
      when: new Date().toISOString(),
      by: actor,
    };
    env.providerId = providerId;
    env.status = "deploying";
    app.deployments = [deployment, ...app.deployments];
    await saveWorkspaceApp(app);
    await touchWorkspaceNode(node.slug);
    return { ok: true, app, deployment, providerId };
  } catch (error) {
    env.status = "degraded";
    await saveWorkspaceApp(app).catch(() => undefined);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Deploy failed.",
    };
  }
}

/** Live provider status for one env, mapped onto BYOV health. */
export async function envStatus(
  slug: string,
  envName: string,
  deps?: CoolifyDeps,
): Promise<{ ok: true; status: string; health: string } | { ok: false; error: string }> {
  const found = await findWorkspaceApp(slug);
  const env = found?.envs.find((e) => e.name === envName);
  if (!found || !env) {
    return { ok: false, error: `No environment "${envName}" found for app "${slug}".` };
  }
  if (!env.providerId) {
    return { ok: true, status: "not provisioned", health: env.status };
  }
  const node = await findNode(env.node);
  if (!node?.endpoint) {
    return { ok: false, error: "Node endpoint is not configured." };
  }
  const token = coolifyTokenFor(node.slug);
  if (!token) {
    return { ok: false, error: "No Coolify API token configured." };
  }
  try {
    const remote = await getApplication(node.endpoint, token, env.providerId, deps);
    const health = coolifyStatusToHealth(remote.status);
    if (health !== env.status) {
      env.status = health;
      await saveWorkspaceApp(found);
    }
    return { ok: true, status: remote.status ?? "unknown", health };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Status check failed." };
  }
}

/** Recent provider logs for one env. */
export async function envLogs(
  slug: string,
  envName: string,
  deps?: CoolifyDeps,
): Promise<{ ok: true; logs: string } | { ok: false; error: string }> {
  const found = await findWorkspaceApp(slug);
  const env = found?.envs.find((e) => e.name === envName);
  if (!found || !env?.providerId) {
    return { ok: false, error: "Environment is not provisioned yet — deploy first." };
  }
  const node = await findNode(env.node);
  if (!node?.endpoint) {
    return { ok: false, error: "Node endpoint is not configured." };
  }
  const token = coolifyTokenFor(node.slug);
  if (!token) {
    return { ok: false, error: "No Coolify API token configured." };
  }
  try {
    const logs = await getApplicationLogs(node.endpoint, token, env.providerId, deps);
    return { ok: true, logs };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Log fetch failed." };
  }
}

export type { App };
