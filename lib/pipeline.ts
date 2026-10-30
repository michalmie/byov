/**
 * Push pipeline: webhook → gates → (deploy on pass).
 * Persists fresh check results on the app, records audit events for
 * both outcomes, and deploys the target env only when every gate
 * passes. Deploy is injectable for tests; production uses
 * `deployEnv` (Coolify adapter).
 */

import type { CheckStatus } from "./control-plane";
import { deployEnv, type DeployResult } from "./deploy";
import { recordEvent } from "./events";
import { evaluateGates, type GateOutcome, type PushFile } from "./gates";
import { findWorkspaceApp, saveWorkspaceApp } from "./workspace-store";

export interface PushPayload {
  branch?: string;
  env?: string;
  files?: PushFile[];
  reported?: Record<string, CheckStatus>;
}

export type PipelineResult =
  | { ok: true; gates: GateOutcome; deployed: boolean; deploy?: DeployResult }
  | { ok: false; error: string };

type DeployFn = (slug: string, env: string, actor: string) => Promise<DeployResult>;

export async function handlePush(
  slug: string,
  payload: PushPayload,
  actor: string,
  deploy: DeployFn = (s, e, a) => deployEnv(s, e, a),
): Promise<PipelineResult> {
  const app = await findWorkspaceApp(slug);
  if (!app) {
    return { ok: false, error: `No app found for slug "${slug}".` };
  }
  const envName = (payload.env ?? "sandbox").trim() || "sandbox";
  if (!app.envs.some((e) => e.name === envName)) {
    return { ok: false, error: `No environment "${envName}" found for app "${slug}".` };
  }

  const gates = evaluateGates(app.checks, {
    files: payload.files ?? [],
    reported: payload.reported,
  });
  app.checks = gates.checks;
  await saveWorkspaceApp(app);

  if (gates.blocked) {
    await recordEvent({
      actor: "BYOV",
      text: `blocked a ${envName} deploy of ${app.name} — ${gates.summary}`,
      appSlug: slug,
    });
    return { ok: true, gates, deployed: false };
  }

  await recordEvent({
    actor,
    text: `passed all gates for ${app.name} (${envName})`,
    appSlug: slug,
  });
  // deployEnv records its own "deployed …" event on success.
  const deployed = await deploy(slug, envName, actor);
  return { ok: true, gates, deployed: deployed.ok, deploy: deployed };
}

/** Link (or relink) the source repo the pipeline watches. */
export async function linkRepo(
  slug: string,
  repoUrl: string,
  branch: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const app = await findWorkspaceApp(slug);
  if (!app) {
    return { ok: false, error: `No app found for slug "${slug}".` };
  }
  app.repoUrl = repoUrl;
  if (branch) {
    app.branch = branch;
  }
  await saveWorkspaceApp(app);
  return { ok: true };
}
