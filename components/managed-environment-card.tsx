"use client";

import type { Deployment, AppEnvironment } from "@/lib/control-plane";
import { listApps } from "@/lib/control-plane";
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
  const resolved = resolveEnvUrl(appSlug, env, {
    nodes,
    apps: listApps(),
    devZone: settings.devZone,
    tailnetDomain: settings.tailnetDomain,
  });

  return (
    <EnvironmentCard
      env={{ ...env, url: resolved.url ?? "—" }}
      urlNote={resolved.warning ?? undefined}
      nodeName={nodeName}
      lastDeploy={lastDeploy}
      checksPassing={checksPassing}
      checksTotal={checksTotal}
    />
  );
}
