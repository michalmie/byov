"use client";

import type { Deployment, AppEnvironment } from "@/lib/control-plane";
import { useManagedApps } from "@/lib/apps-store";
import { isDomainZone, isTestablePort, resolveEnvUrl } from "@/lib/dev-urls";
import { useWorkspaceSettings } from "@/lib/settings-store";
import { effectiveAccessPolicy } from "@/lib/access-policy";
import { DeployButton } from "./deploy-button";
import { EnvironmentCard } from "./environment-card";

/** Test target for a resolved URL, or undefined when untestable. */
function testTargetFor(
  url: string | null,
): { host: string; port: number } | undefined {
  if (!url) {
    return undefined;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return undefined;
    }
    const host = parsed.hostname.toLowerCase();
    const port = parsed.port ? Number(parsed.port) : 443;
    if (!isDomainZone(host) || !isTestablePort(port)) {
      return undefined;
    }
    return { host, port };
  } catch {
    return undefined;
  }
}

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
  const { apps } = useManagedApps();
  const app = apps.find((entry) => entry.slug === appSlug);
  const node = nodes.find((entry) => entry.slug === env.node);
  const nodeName = node?.name ?? env.node;
  const resolved = resolveEnvUrl(appSlug, env, {
    nodes,
    apps,
    devZone: settings.devZone,
    tailnetDomain: settings.tailnetDomain,
    defaultScenario: settings.defaultScenario,
    appScenarios: settings.appScenarios,
  });

  return (
    <EnvironmentCard
      env={{ ...env, url: resolved.url ?? "—" }}
      urlNote={resolved.warning ?? undefined}
      testTarget={testTargetFor(resolved.url)}
      nodeName={nodeName}
      lastDeploy={lastDeploy}
      checksPassing={checksPassing}
      checksTotal={checksTotal}
      actions={<DeployButton appSlug={appSlug} envName={env.name} />}
      varKeys={Object.keys(env.envVars ?? {}).sort()}
      accessPolicy={app ? effectiveAccessPolicy(app, env) : undefined}
    />
  );
}
