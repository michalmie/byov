import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ControlPlaneShell } from "@/components/shell";
import { SectionHead, StatStrip, StatusPill } from "@/components/data-ui";
import { ArrowLeftIcon } from "@/components/icons";
import { getTemplate, listTemplates } from "@/lib/templates";

export function generateStaticParams() {
  return listTemplates().map((template) => ({ slug: template.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const template = getTemplate(slug);
  return { title: template ? template.name : "Unknown template" };
}

const statusTone = { draft: "info", stable: "ok", deprecated: "bad" } as const;
const statusLabel = {
  draft: "Draft",
  stable: "Stable",
  deprecated: "Deprecated",
} as const;

export default async function TemplateDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const template = getTemplate(slug);
  if (!template) {
    notFound();
  }

  return (
    <ControlPlaneShell
      crumb={
        <>
          <Link href="/templates" className="hover:underline">
            Templates
          </Link>{" "}
          / {template.name}
        </>
      }
    >
      <div className="grid gap-8">
        <div id="overview" className="scroll-mt-24">
          <Link
            href="/templates"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium"
            style={{ color: "var(--color-muted)" }}
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            Templates
          </Link>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold tracking-tight">
              {template.name}
            </h1>
            <StatusPill
              tone={statusTone[template.status]}
              label={statusLabel[template.status]}
            />
          </div>
          <p
            className="mt-1 text-[13px]"
            style={{ color: "var(--color-muted)" }}
          >
            {template.slug}
          </p>
          <p
            className="mt-3 max-w-[65ch] text-sm"
            style={{ color: "var(--color-ink-2)" }}
          >
            {template.tagline}
          </p>
        </div>

        <div className="rule-top pt-6">
          <StatStrip
            items={[
              {
                value: String(template.stack.length),
                qualifier: "Stack layers",
              },
              {
                value: String(template.checks.length),
                qualifier: "Required gates",
              },
              {
                value: String(template.scaffold.length),
                qualifier: "Scaffold steps",
              },
              {
                value: String(template.nodes.length),
                qualifier: "Node targets",
              },
            ]}
          />
        </div>

        <section
          id="stack"
          aria-labelledby="stack-heading"
          className="grid scroll-mt-24 gap-5"
        >
          <div id="stack-heading">
            <SectionHead
              title="Stack"
              lede="What a scaffolded app is built with."
            />
          </div>
          <div className="overflow-x-auto">
            <table className="spec-table min-w-[520px]">
              <thead>
                <tr>
                  <th scope="col">Layer</th>
                  <th scope="col">Choice</th>
                </tr>
              </thead>
              <tbody>
                {template.stack.map((item) => (
                  <tr key={item.label}>
                    <td className="font-semibold">{item.label}</td>
                    <td className="mono text-sm">{item.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section
          id="checks"
          aria-labelledby="checks-heading"
          className="grid scroll-mt-24 gap-5"
        >
          <div id="checks-heading">
            <SectionHead
              title="Checks"
              lede="Required gates, mirrored from the Control Plane."
            />
          </div>
          <div className="overflow-x-auto">
            <table className="spec-table min-w-[520px]">
              <thead>
                <tr>
                  <th scope="col">Check</th>
                  <th scope="col">Command</th>
                  <th scope="col">Cadence</th>
                </tr>
              </thead>
              <tbody>
                {template.checks.map((check) => (
                  <tr key={check.name}>
                    <td className="font-semibold">{check.name}</td>
                    <td className="mono text-sm">{check.command}</td>
                    <td className="text-sm">{check.cadence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section
          id="scaffold"
          aria-labelledby="scaffold-heading"
          className="grid scroll-mt-24 gap-5"
        >
          <div id="scaffold-heading">
            <SectionHead
              title="Scaffold"
              lede="From template to running app."
            />
          </div>
          <ol className="grid gap-4">
            {template.scaffold.map((step, index) => (
              <li key={step.title} className="card grid gap-2 p-4 sm:p-5">
                <p className="font-semibold">
                  <span
                    className="mono mr-2 text-sm"
                    style={{ color: "var(--color-ink-2)" }}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {step.title}
                </p>
                <p
                  className="max-w-[70ch] text-sm"
                  style={{ color: "var(--color-ink-2)" }}
                >
                  {step.detail}
                </p>
                {step.command && (
                  <pre className="mono overflow-x-auto text-sm">
                    {step.command}
                  </pre>
                )}
              </li>
            ))}
          </ol>
        </section>

        <section
          id="ship"
          aria-labelledby="ship-heading"
          className="grid scroll-mt-24 gap-5"
        >
          <div id="ship-heading">
            <SectionHead
              title="Ship"
              lede="Starter source, node targets and docs."
            />
          </div>
          <div className="overflow-x-auto">
            <table className="spec-table min-w-[520px]">
              <tbody>
                <tr>
                  <td className="font-semibold">Starter</td>
                  <td className="text-sm">
                    {template.starter.kind} ·{" "}
                    <span className="mono">{template.starter.ref}</span>
                    <span
                      className="block"
                      style={{ color: "var(--color-ink-2)" }}
                    >
                      {template.starter.note}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="font-semibold">Nodes</td>
                  <td className="mono text-sm">
                    {template.nodes.join(" · ")}
                  </td>
                </tr>
                <tr>
                  <td className="font-semibold">Docs</td>
                  <td className="mono text-sm">
                    {template.docs.join(" · ")}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </ControlPlaneShell>
  );
}
