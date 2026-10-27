"use client";

import type { Deployment, AppEnvironment } from "@/lib/control-plane";
import { resolveEnvUrl } from "@/lib/dev-urls";
import { useWorkspaceSettings } from "@/lib/settings-store";
import { EnvironmentCard } from "./environment-card";

/** Environment card that resolves node name and URL from managed state. */
export function ManagedEnvironmentCard({
  appSlug,
  env,
  lastDeploy,
  checksPassing,
  checksTotal,
}: {
  appSlug: string;
  env: AppEnvironment;
  lastDeploy?: Deployment;
  checksPassing: number;
  checksTotal: number;
}) {
  const { settings, nodes } = useWorkspaceSettings();
  const node = nodes.find((entry) => entry.slug === env.node);
  const nodeName = node?.name ?? env.node;
  const resolved = resolveEnvUrl(appSlug, env, nodes, settings.devZone);
  const urlNote =
    resolved.source === "missing-zone"
      ? `Set a domain zone on ${nodeName} to get a URL.`
      : (resolved.warning ?? undefined);

  return (
    <EnvironmentCard
      env={{ ...env, url: resolved.url ?? "—" }}
      urlNote={urlNote}
      nodeName={nodeName}
      lastDeploy={lastDeploy}
      checksPassing={checksPassing}
      checksTotal={checksTotal}
    />
  );
}
