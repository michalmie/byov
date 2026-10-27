import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { HealthPill } from "@/components/data-ui";
import { listProjects, projectHealth } from "@/lib/control-plane";

export default function Projects() {
  const projects = listProjects();

  return (
    <AppShell crumb="Projects">
      <div className="grid gap-8">
        <div>
          <h1 className="text-[clamp(2rem,3.5vw+0.75rem,3rem)] font-bold leading-[1.05] tracking-tight">
            Projects
          </h1>
          <p
            className="mt-3 max-w-[65ch] text-base"
            style={{ color: "var(--color-ink-2)" }}
          >
            Every vibe-coded app governed by this control plane. Open one to
            see its environments, deployments and checks.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="spec-table min-w-[820px]">
            <thead>
              <tr>
                <th scope="col">Project</th>
                <th scope="col">Health</th>
                <th scope="col">Environments</th>
                <th scope="col">Checks</th>
                <th scope="col">Last deploy</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => {
                const passing = project.checks.filter(
                  (check) => check.status === "pass",
                ).length;
                const last = project.deployments[0];
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
                        className="block max-w-[45ch] text-sm"
                        style={{ color: "var(--color-ink-2)" }}
                      >
                        {project.description}
                      </span>
                    </td>
                    <td>
                      <HealthPill health={projectHealth(project)} />
                    </td>
                    <td>
                      <span className="mono text-sm">
                        {project.envs.map((env) => env.name).join(" · ")}
                      </span>
                    </td>
                    <td>
                      {passing}/{project.checks.length} passing
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
    </AppShell>
  );
}
