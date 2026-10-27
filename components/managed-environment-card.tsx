"use client";

import type { Deployment, AppEnvironment } from "@/lib/control-plane";
import { useManagedNodes } from "@/lib/settings-store";
import { EnvironmentCard } from "./environment-card";

/** Environment card that resolves its node name from managed nodes. */
export function ManagedEnvironmentCard({
  env,
  lastDeploy,
  checksPassing,
  checksTotal,
}: {
  env: AppEnvironment;
  lastDeploy?: Deployment;
  checksPassing: number;
  checksTotal: number;
}) {
  const { nodes } = useManagedNodes();
  const nodeName = nodes.find((node) => node.slug === env.node)?.name ?? env.node;

  return (
    <EnvironmentCard
      env={env}
      nodeName={nodeName}
      lastDeploy={lastDeploy}
      checksPassing={checksPassing}
      checksTotal={checksTotal}
    />
  );
}
