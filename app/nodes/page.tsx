import { AppShell } from "@/components/app-shell";
import { HealthPill, StatStrip } from "@/components/data-ui";
import { listNodes, listProjects } from "@/lib/control-plane";

export default function Nodes() {
  const nodes = listNodes();
  const projects = listProjects();
  const envCount = projects.reduce(
    (total, project) => total + project.envs.length,
    0,
  );

  return (
    <AppShell crumb="Nodes">
      <div className="grid gap-8">
        <div>
          <h1 className="text-[clamp(2rem,3.5vw+0.75rem,3rem)] font-bold leading-[1.05] tracking-tight">
            Nodes
          </h1>
          <p
            className="mt-3 max-w-[65ch] text-base"
            style={{ color: "var(--color-ink-2)" }}
          >
            Where projects land. Administrators pin each environment to a
            node — the first fleet is self-hosted Coolify.
          </p>
        </div>

        <div className="rule-top pt-8">
          <StatStrip
            items={[
              { value: String(nodes.length), qualifier: "Nodes" },
              { value: String(projects.length), qualifier: "Projects" },
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
                <th scope="col">Projects</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node) => {
                const hosted = projects.filter((project) =>
                  project.envs.some((env) => env.node === node.slug),
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
                      {hosted.map((project) => project.name).join(" · ")}
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
