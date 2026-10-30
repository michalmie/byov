"use client";

import Link from "next/link";
import { HealthPill } from "@/components/data-ui";
import { ControlPlaneShell } from "@/components/shell";
import { useManagedApps } from "@/lib/apps-store";
import { appHealth } from "@/lib/control-plane";

export default function Apps() {
  const { apps, isCustomApp } = useManagedApps();

  return (
    <ControlPlaneShell crumb="Apps">
      <div className="grid gap-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Apps
          </h1>
          <p
            className="mt-2 max-w-[65ch] text-sm"
            style={{ color: "var(--color-muted)" }}
          >
            Every vibe-coded app governed by this control plane. Open one to
            see its environments, deployments and checks.
          </p>
          <div className="mt-4">
            <Link href="/apps/new" className="btn-ghost px-3 py-1.5 text-[13px]">
              New app
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="spec-table min-w-[820px]">
            <thead>
              <tr>
                <th scope="col">App</th>
                <th scope="col">Health</th>
                <th scope="col">Environments</th>
                <th scope="col">Checks</th>
                <th scope="col">Last deploy</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => {
                const passing = app.checks.filter(
                  (check) => check.status === "pass",
                ).length;
                const last = app.deployments[0];
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
                        className="max-w-[45ch] text-sm line-clamp-2"
                        style={{ color: "var(--color-ink-2)" }}
                      >
                        {app.description}
                      </span>
                      {app.owner && (
                        <span
                          className="block text-sm"
                          style={{ color: "var(--color-muted)" }}
                        >
                          Owner: {app.owner}
                          {app.ownerGithub ? ` (@${app.ownerGithub})` : ""}
                        </span>
                      )}
                      {isCustomApp(app.slug) && (
                        <span
                          className="mono block text-sm"
                          style={{ color: "var(--color-muted)" }}
                        >
                          workspace
                        </span>
                      )}
                    </td>
                    <td>
                      <HealthPill health={appHealth(app)} />
                    </td>
                    <td>
                      <span className="mono text-sm">
                        {app.envs.map((env) => env.name).join(" · ")}
                      </span>
                    </td>
                    <td>
                      {passing}/{app.checks.length} passing
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
      </div>
    </ControlPlaneShell>
  );
}
