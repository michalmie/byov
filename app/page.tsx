import Link from "next/link";
import { ActivityFeed } from "@/components/activity-feed";
import { AppShell } from "@/components/app-shell";
import { HealthPill, SectionHead, StatStrip } from "@/components/data-ui";
import { ArrowRightIcon } from "@/components/icons";
import {
  fleetSummary,
  getNode,
  listNodes,
  listProjects,
  projectHealth,
  recentActivity,
} from "@/lib/control-plane";

export default function Dashboard() {
  const summary = fleetSummary();
  const projects = listProjects();
  const nodes = listNodes();
  const activity = recentActivity();

  return (
    <AppShell crumb="Dashboard">
      <div className="grid gap-10">
        <div>
          <h1 className="flex flex-wrap items-baseline gap-x-4 text-[clamp(2rem,3.5vw+0.75rem,3rem)] font-bold leading-[1.05] tracking-tight">
            <span aria-hidden="true" className="tnum">
              {summary.projects}
            </span>
            <span className="max-w-[16ch]">
              projects ship from this control plane.
            </span>
          </h1>
          <p
            className="mt-4 max-w-[65ch] text-base"
            style={{ color: "var(--color-ink-2)" }}
          >
            Every vibe-coded app your teams rely on — governed, deployed and
            watched from one place.
          </p>
          <div className="mt-6">
            <Link href="/projects" className="btn-ghost px-4 py-2 text-sm">
              Browse projects
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="rule-top pt-8">
          <StatStrip
            items={[
              { value: String(summary.projects), qualifier: "Projects" },
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

        <section aria-labelledby="projects-heading" className="grid gap-5">
          <div id="projects-heading">
            <SectionHead
              title="Projects"
              lede="Health, home node and last deploy at a glance."
            />
          </div>
          <div className="overflow-x-auto">
            <table className="spec-table min-w-[760px]">
              <thead>
                <tr>
                  <th scope="col">Project</th>
                  <th scope="col">Health</th>
                  <th scope="col">Node</th>
                  <th scope="col">Envs</th>
                  <th scope="col">Checks</th>
                  <th scope="col">Last deploy</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => {
                  const health = projectHealth(project);
                  const passing = project.checks.filter(
                    (check) => check.status === "pass",
                  ).length;
                  const last = project.deployments[0];
                  const home = project.envs.find(
                    (env) => env.name === "production",
                  );
                  const homeNode = home ? getNode(home.node) : undefined;
                  return (
                    <tr key={project.slug}>
                      <td>
                        <Link
                          href={`/projects/${project.slug}`}
                          className="font-semibold underline decoration-[var(--color-rule)] underline-offset-2 hover:decoration-[var(--color-accent-deep)]"
                        >
                          {project.name}
                        </Link>
                        <span
                          className="mono block text-sm"
                          style={{ color: "var(--color-ink-2)" }}
                        >
                          {project.slug}
                        </span>
                      </td>
                      <td>
                        <HealthPill health={health} />
                      </td>
                      <td className="mono text-sm">
                        {homeNode ? homeNode.name : "—"}
                      </td>
                      <td>{project.envs.length}</td>
                      <td>
                        {passing}/{project.checks.length}
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
                lede="Where projects land. The first fleet is self-hosted Coolify."
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
                    style={{
                      background:
                        node.status === "healthy"
                          ? "var(--color-ok)"
                          : "var(--color-warn)",
                    }}
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
    </AppShell>
  );
}
