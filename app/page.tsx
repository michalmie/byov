"use client";

import Link from "next/link";
import { ActivityFeed } from "@/components/activity-feed";
import { HealthPill, SectionHead, StatStrip } from "@/components/data-ui";
import { ArrowRightIcon } from "@/components/icons";
import { ControlPlaneShell } from "@/components/shell";
import type { Health } from "@/lib/control-plane";
import {
  appHealth,
  fleetSummaryFor,
  listApps,
  recentActivity,
} from "@/lib/control-plane";
import { useManagedNodes } from "@/lib/settings-store";

const nodeDot: Record<Health, string> = {
  healthy: "var(--color-ok)",
  deploying: "var(--color-info)",
  degraded: "var(--color-warn)",
  down: "var(--color-bad)",
  pending: "var(--color-info)",
};

export default function Dashboard() {
  const apps = listApps();
  const { nodes } = useManagedNodes();
  const summary = fleetSummaryFor(apps, nodes);
  const activity = recentActivity();

  return (
    <ControlPlaneShell crumb="Dashboard">
      <div className="grid gap-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            <span aria-hidden="true" className="tnum">
              {summary.apps}
            </span>{" "}
            apps ship from this control plane.
          </h1>
          <p
            className="mt-2 max-w-[65ch] text-sm"
            style={{ color: "var(--color-muted)" }}
          >
            Every vibe-coded app your teams rely on — governed, deployed and
            watched from one place.
          </p>
          <div className="mt-4">
            <Link href="/apps" className="btn-ghost px-3 py-1.5 text-[13px]">
              Browse apps
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className="rule-top pt-6">
          <StatStrip
            items={[
              { value: String(summary.apps), qualifier: "Apps" },
              { value: String(summary.nodes), qualifier: "Nodes" },
              {
                value: String(summary.attention),
                qualifier: "Need attention",
                accent: summary.attention > 0,
              },
              {
                value: String(summary.deployments),
                qualifier: "Recent deployments",
              },
            ]}
          />
        </div>

        <section aria-labelledby="apps-heading" className="grid gap-5">
          <div id="apps-heading">
            <SectionHead
              title="Apps"
              lede="Health, home node and last deploy at a glance."
            />
          </div>
          <div className="overflow-x-auto">
            <table className="spec-table min-w-[760px]">
              <thead>
                <tr>
                  <th scope="col">App</th>
                  <th scope="col">Health</th>
                  <th scope="col">Node</th>
                  <th scope="col">Envs</th>
                  <th scope="col">Checks</th>
                  <th scope="col">Last deploy</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((app) => {
                  const health = appHealth(app);
                  const passing = app.checks.filter(
                    (check) => check.status === "pass",
                  ).length;
                  const last = app.deployments[0];
                  const home = app.envs.find(
                    (env) => env.name === "production",
                  );
                  const homeNode = home
                    ? nodes.find((node) => node.slug === home.node)
                    : undefined;
                  return (
                    <tr key={app.slug}>
                      <td>
                        <Link
                          href={`/apps/${app.slug}`}
                          className="font-semibold underline decoration-[var(--color-rule)] underline-offset-2 hover:decoration-[var(--color-accent-deep)]"
                        >
                          {app.name}
                        </Link>
                        <span
                          className="mono block text-sm"
                          style={{ color: "var(--color-ink-2)" }}
                        >
                          {app.slug}
                        </span>
                      </td>
                      <td>
                        <HealthPill health={health} />
                      </td>
                      <td className="mono text-sm">
                        {homeNode ? homeNode.name : "—"}
                      </td>
                      <td>{app.envs.length}</td>
                      <td>
                        {passing}/{app.checks.length}
                      </td>
                      <td className="text-sm">
                        {last ? (
                          <>
                            {last.when}
                            <span
                              className="block"
                              style={{ color: "var(--color-ink-2)" }}
                            >
                              by {last.by}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid gap-10 lg:grid-cols-[7fr_5fr]">
          <section aria-labelledby="nodes-heading" className="grid content-start gap-5">
            <div id="nodes-heading">
              <SectionHead
                title="Nodes"
                lede="Where apps land. The first fleet is self-hosted Coolify."
              />
            </div>
            <ul className="grid">
              {nodes.map((node) => (
                <li
                  key={node.slug}
                  className="rule-top flex items-center gap-3 py-3"
                >
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: nodeDot[node.status] }}
                  />
                  <span className="mono text-sm font-semibold">
                    {node.name}
                  </span>
                  <span
                    className="truncate text-sm"
                    style={{ color: "var(--color-ink-2)" }}
                  >
                    {node.kind} · {node.location}
                  </span>
                  <span className="ml-auto">
                    <HealthPill health={node.status} />
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href="/nodes"
              className="inline-flex w-fit items-center gap-2 text-sm font-semibold underline decoration-[var(--color-rule)] underline-offset-2 hover:decoration-[var(--color-accent-deep)]"
            >
              All nodes
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </section>

          <section aria-labelledby="activity-heading" className="grid content-start gap-5">
            <div id="activity-heading">
              <SectionHead
                title="Activity"
                lede="Latest control plane events."
              />
            </div>
            <ActivityFeed items={activity} />
            <Link
              href="/activity"
              className="inline-flex w-fit items-center gap-2 text-sm font-semibold underline decoration-[var(--color-rule)] underline-offset-2 hover:decoration-[var(--color-accent-deep)]"
            >
              All activity
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </section>
        </div>
      </div>
    </ControlPlaneShell>
  );
}
