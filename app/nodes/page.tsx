"use client";

import Link from "next/link";
import { HealthPill, StatStrip } from "@/components/data-ui";
import { ArrowRightIcon } from "@/components/icons";
import { ControlPlaneShell } from "@/components/shell";
import { listApps } from "@/lib/control-plane";
import { useManagedNodes } from "@/lib/settings-store";

export default function Nodes() {
  const { nodes } = useManagedNodes();
  const apps = listApps();
  const envCount = apps.reduce(
    (total, app) => total + app.envs.length,
    0,
  );

  return (
    <ControlPlaneShell crumb="Nodes">
      <div className="grid gap-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Nodes
          </h1>
          <p
            className="mt-2 max-w-[65ch] text-sm"
            style={{ color: "var(--color-muted)" }}
          >
            Where apps land. Administrators pin each environment to a
            node — the first fleet is self-hosted Coolify.
          </p>
          <div className="mt-4">
            <Link
              href="/settings/nodes"
              className="btn-ghost px-3 py-1.5 text-[13px]"
            >
              Manage nodes
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className="rule-top pt-6">
          <StatStrip
            items={[
              { value: String(nodes.length), qualifier: "Nodes" },
              { value: String(apps.length), qualifier: "Apps" },
              { value: String(envCount), qualifier: "Environments" },
              {
                value: String(
                  nodes.filter((node) => node.status === "healthy").length,
                ),
                qualifier: "Nodes healthy",
              },
            ]}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="spec-table min-w-[680px]">
            <thead>
              <tr>
                <th scope="col">Node</th>
                <th scope="col">Kind</th>
                <th scope="col">Status</th>
                <th scope="col">Apps</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node) => {
                const hosted = apps.filter((app) =>
                  app.envs.some((env) => env.node === node.slug),
                );
                return (
                  <tr key={node.slug}>
                    <td>
                      <span className="mono text-sm font-semibold">
                        {node.name}
                      </span>
                      <span
                        className="block text-sm"
                        style={{ color: "var(--color-ink-2)" }}
                      >
                        {node.location}
                      </span>
                    </td>
                    <td>{node.kind}</td>
                    <td>
                      <HealthPill health={node.status} />
                    </td>
                    <td className="text-sm">
                      {hosted.length} ·{" "}
                      {hosted.map((app) => app.name).join(" · ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </ControlPlaneShell>
  );
}
