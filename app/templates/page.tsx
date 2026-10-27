import Link from "next/link";
import { ControlPlaneShell } from "@/components/shell";
import { SectionHead, StatStrip, StatusPill } from "@/components/data-ui";
import { listTemplates } from "@/lib/templates";

const statusTone = { draft: "info", stable: "ok", deprecated: "bad" } as const;
const statusLabel = {
  draft: "Draft",
  stable: "Stable",
  deprecated: "Deprecated",
} as const;

function frameworkOf(slug: string): string {
  const template = listTemplates().find((item) => item.slug === slug);
  const framework = template?.stack.find((item) => item.label === "Framework");
  return framework ? framework.value : "—";
}

export default function Templates() {
  const templates = listTemplates();
  const stable = templates.filter(
    (template) => template.status === "stable",
  ).length;
  const gates = templates[0] ? templates[0].checks.length : 0;
  const nodeKinds = new Set(templates.flatMap((template) => template.nodes))
    .size;

  return (
    <ControlPlaneShell crumb="Templates">
      <div className="grid gap-8">
        <div>
          <h1 className="text-[clamp(2rem,3.5vw+0.75rem,3rem)] font-bold leading-[1.05] tracking-tight">
            Templates
          </h1>
          <p
            className="mt-3 max-w-[65ch] text-base"
            style={{ color: "var(--color-ink-2)" }}
          >
            Paved-road starters for vibe-coded apps. Every template ships
            with the required gates built in — starting with the stack BYOV
            itself is built on.
          </p>
        </div>

        <div className="rule-top pt-8">
          <StatStrip
            items={[
              { value: String(templates.length), qualifier: "Templates" },
              { value: String(stable), qualifier: "Stable" },
              { value: String(gates), qualifier: "Gates per app" },
              { value: String(nodeKinds), qualifier: "Node kinds" },
            ]}
          />
        </div>

        <section aria-labelledby="catalog-heading" className="grid gap-5">
          <div id="catalog-heading">
            <SectionHead
              title="Catalog"
              lede="Pick a stack, scaffold, keep the gates green."
            />
          </div>
          <div className="overflow-x-auto">
            <table className="spec-table min-w-[720px]">
              <thead>
                <tr>
                  <th scope="col">Template</th>
                  <th scope="col">Status</th>
                  <th scope="col">Stack</th>
                  <th scope="col">Gates</th>
                  <th scope="col">Nodes</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.slug}>
                    <td>
                      <Link
                        href={`/templates/${template.slug}`}
                        className="font-semibold underline decoration-[var(--color-rule)] underline-offset-2 hover:decoration-[var(--color-accent-deep)]"
                      >
                        {template.name}
                      </Link>
                      <span
                        className="block max-w-[45ch] text-sm"
                        style={{ color: "var(--color-ink-2)" }}
                      >
                        {template.tagline}
                      </span>
                    </td>
                    <td>
                      <StatusPill
                        tone={statusTone[template.status]}
                        label={statusLabel[template.status]}
                      />
                    </td>
                    <td className="mono text-sm">
                      {frameworkOf(template.slug)}
                    </td>
                    <td>
                      {template.checks.length} gates
                    </td>
                    <td className="mono text-sm">
                      {template.nodes.join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p
            className="mono text-sm"
            style={{ color: "var(--color-ink-2)" }}
          >
            Adding a stack? See templates/README.md — manifest + blueprint,
            no new dependencies.
          </p>
        </section>
      </div>
    </ControlPlaneShell>
  );
}
