"use client";

import Link from "next/link";
import { ControlPlaneShell } from "@/components/shell";
import { SectionHead, StatStrip, StatusPill } from "@/components/data-ui";
import { ArrowRightIcon } from "@/components/icons";
import { useManagedStacks } from "@/lib/stack-store";
import { primaryTechnologyOf } from "@/lib/stacks";

const statusTone = { draft: "info", stable: "ok", deprecated: "bad" } as const;
const statusLabel = {
  draft: "Draft",
  stable: "Stable",
  deprecated: "Deprecated",
} as const;

export default function TechStacks() {
  const { stacks, isCustomStack } = useManagedStacks();
  const stable = stacks.filter((stack) => stack.status === "stable").length;
  const gates = stacks[0] ? stacks[0].checks.length : 0;
  const nodeKinds = new Set(stacks.flatMap((stack) => stack.nodes)).size;

  return (
    <ControlPlaneShell crumb="Tech stacks">
      <div className="grid gap-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Tech stacks
          </h1>
          <p
            className="mt-2 max-w-[65ch] text-sm"
            style={{ color: "var(--color-muted)" }}
          >
            Paved-road starters for vibe-coded apps. Every stack ships
            with the required gates built in — starting with the stack BYOV
            itself is built on.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/apps/new" className="btn-ghost px-3 py-1.5 text-[13px]">
              New app
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/settings/stacks"
              className="btn-ghost px-3 py-1.5 text-[13px]"
            >
              Manage stacks
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className="rule-top pt-6">
          <StatStrip
            items={[
              { value: String(stacks.length), qualifier: "Stacks" },
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
                  <th scope="col">Stack</th>
                  <th scope="col">Status</th>
                  <th scope="col">Headliner</th>
                  <th scope="col">Gates</th>
                  <th scope="col">Nodes</th>
                </tr>
              </thead>
              <tbody>
                {stacks.map((stack) => (
                  <tr key={stack.slug}>
                    <td>
                      <Link
                        href={`/stacks/${stack.slug}`}
                        className="font-semibold underline decoration-[var(--color-rule)] underline-offset-2 hover:decoration-[var(--color-accent-deep)]"
                      >
                        {stack.name}
                      </Link>
                      <span
                        className="block max-w-[45ch] text-sm"
                        style={{ color: "var(--color-ink-2)" }}
                      >
                        {stack.tagline}
                      </span>
                      {isCustomStack(stack.slug) && (
                        <span
                          className="mono block text-sm"
                          style={{ color: "var(--color-muted)" }}
                        >
                          workspace
                        </span>
                      )}
                    </td>
                    <td>
                      <StatusPill
                        tone={statusTone[stack.status]}
                        label={statusLabel[stack.status]}
                      />
                    </td>
                    <td className="mono text-sm">
                      {primaryTechnologyOf(stack)}
                    </td>
                    <td>
                      {stack.checks.length} gates
                    </td>
                    <td className="mono text-sm">
                      {stack.nodes.join(" · ")}
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
            Define your own in Settings → Tech stacks. Shipping a stack for
            everyone? See stacks/README.md — manifest + blueprint, no new
            dependencies.
          </p>
        </section>
      </div>
    </ControlPlaneShell>
  );
}
