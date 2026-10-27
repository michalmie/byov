"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ControlPlaneShell } from "@/components/shell";
import { SectionHead, StatStrip, StatusPill } from "@/components/data-ui";
import { ArrowLeftIcon, ArrowRightIcon } from "@/components/icons";
import { useManagedStacks } from "@/lib/stack-store";
import { STACK_CATEGORY_LABELS, layersByCategory } from "@/lib/stacks";

const statusTone = { draft: "info", stable: "ok", deprecated: "bad" } as const;
const statusLabel = {
  draft: "Draft",
  stable: "Stable",
  deprecated: "Deprecated",
} as const;

export function StackDetailView({ slug }: { slug: string }) {
  const { getManagedStack, isCustomStack } = useManagedStacks();
  // Customs hydrate after mount; hold the loading state until then so a
  // workspace slug never flashes a 404 on first render.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const stack = getManagedStack(slug);

  if (!stack && !mounted) {
    return (
      <ControlPlaneShell crumb="Tech stacks">
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          Loading stack…
        </p>
      </ControlPlaneShell>
    );
  }

  if (!stack) {
    notFound();
  }

  const custom = isCustomStack(stack.slug);

  return (
    <ControlPlaneShell
      crumb={
        <>
          <Link href="/stacks" className="hover:underline">
            Tech stacks
          </Link>{" "}
          / {stack.name}
        </>
      }
    >
      <div className="grid gap-8">
        <div id="overview" className="scroll-mt-24">
          <Link
            href="/stacks"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium"
            style={{ color: "var(--color-muted)" }}
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            Tech stacks
          </Link>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold tracking-tight">
              {stack.name}
            </h1>
            <StatusPill
              tone={statusTone[stack.status]}
              label={statusLabel[stack.status]}
            />
          </div>
          <p
            className="mt-1 text-[13px]"
            style={{ color: "var(--color-muted)" }}
          >
            {stack.slug}
            {custom ? " · workspace stack" : ""}
          </p>
          <p
            className="mt-3 max-w-[65ch] text-sm"
            style={{ color: "var(--color-ink-2)" }}
          >
            {stack.tagline}
          </p>
          <div className="mt-4">
            <Link
              href="/settings/stacks"
              className="btn-ghost px-3 py-1.5 text-[13px]"
            >
              {custom ? "Edit in Settings" : "Manage stacks"}
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className="rule-top pt-6">
          <StatStrip
            items={[
              {
                value: String(stack.stack.length),
                qualifier: "Stack layers",
              },
              {
                value: String(stack.checks.length),
                qualifier: "Required gates",
              },
              {
                value: String(stack.scaffold.length),
                qualifier: "Scaffold steps",
              },
              {
                value: String(stack.nodes.length),
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
              title="Tech stack"
              lede="What a scaffolded app is built with, by category."
            />
          </div>
          <div className="grid gap-6">
            {layersByCategory(stack).map((group) => (
              <div key={group.category} className="grid gap-2">
                <h3 className="text-sm font-semibold tracking-tight">
                  {STACK_CATEGORY_LABELS[group.category]}
                </h3>
                <div className="overflow-x-auto">
                  <table className="spec-table min-w-[520px]">
                    <thead>
                      <tr>
                        <th scope="col">Layer</th>
                        <th scope="col">Choice</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.layers.map((item) => (
                        <tr key={item.label}>
                          <td className="font-semibold">{item.label}</td>
                          <td className="mono text-sm">{item.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
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
                {stack.checks.map((check) => (
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
              lede="From stack to running app."
            />
          </div>
          <ol className="grid gap-4">
            {stack.scaffold.map((step, index) => (
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
                    {stack.starter.kind} ·{" "}
                    <span className="mono">{stack.starter.ref}</span>
                    <span
                      className="block"
                      style={{ color: "var(--color-ink-2)" }}
                    >
                      {stack.starter.note}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="font-semibold">Nodes</td>
                  <td className="mono text-sm">
                    {stack.nodes.join(" · ")}
                  </td>
                </tr>
                <tr>
                  <td className="font-semibold">Docs</td>
                  <td className="mono text-sm">
                    {stack.docs.join(" · ")}
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
