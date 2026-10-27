"use client";

import { useState } from "react";
import Link from "next/link";
import { ControlPlaneShell } from "@/components/shell";
import { StatusPill } from "@/components/data-ui";
import { StackForm } from "@/components/stack-form";
import { SettingsSubnav } from "@/components/settings-subnav";
import { useManagedStacks } from "@/lib/stack-store";
import {
  defaultStackDraft,
  draftFromStack,
  primaryTechnologyOf,
  type StackDraft,
} from "@/lib/stacks";

const statusTone = { draft: "info", stable: "ok", deprecated: "bad" } as const;
const statusLabel = {
  draft: "Draft",
  stable: "Stable",
  deprecated: "Deprecated",
} as const;

type Panel =
  | { mode: "new" }
  | { mode: "clone"; slug: string }
  | { mode: "edit"; slug: string }
  | null;

export default function SettingsStacks() {
  const {
    stacks,
    customStacks,
    isCustomStack,
    getManagedStack,
    createStack,
    updateStack,
    deleteStack,
    resetStacks,
  } = useManagedStacks();
  const [panel, setPanel] = useState<Panel>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function closePanels() {
    setPanel(null);
  }

  const panelStack =
    panel && panel.mode !== "new" ? getManagedStack(panel.slug) : undefined;

  const panelInitial: StackDraft | undefined = panel
    ? panel.mode === "new"
      ? defaultStackDraft()
      : panelStack
        ? panel.mode === "clone"
          ? draftFromStack(panelStack)
          : {
              ...draftFromStack(panelStack),
              name: panelStack.name,
              status: panelStack.status,
            }
        : undefined
    : undefined;

  return (
    <ControlPlaneShell crumb="Settings / Tech stacks" subnav={<SettingsSubnav />}>
      <div className="grid gap-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Tech stacks
          </h1>
          <p
            className="mt-2 max-w-[65ch] text-sm"
            style={{ color: "var(--color-muted)" }}
          >
            Define and edit workspace tech stacks. Shipped stacks are
            read-only — clone one to start an editable copy. Gates stay
            governed: customs inherit the five required checks.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {!panel && (
              <button
                type="button"
                className="btn-primary px-3 py-1.5 text-[13px]"
                onClick={() => {
                  setPanel({ mode: "new" });
                  setNotice(null);
                }}
              >
                New stack
              </button>
            )}
            {customStacks.length > 0 &&
              (confirmReset ? (
                <>
                  <button
                    type="button"
                    className="btn-danger px-3 py-1.5 text-[13px]"
                    onClick={() => {
                      resetStacks();
                      closePanels();
                      setConfirmReset(false);
                      setNotice(
                        "Workspace stacks removed — shipped catalog restored.",
                      );
                    }}
                  >
                    Confirm reset
                  </button>
                  <button
                    type="button"
                    className="btn-ghost px-3 py-1.5 text-[13px]"
                    onClick={() => setConfirmReset(false)}
                  >
                    Keep
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-ghost px-3 py-1.5 text-[13px]"
                  onClick={() => setConfirmReset(true)}
                >
                  Reset to shipped catalog
                </button>
              ))}
          </div>
        </div>

        {notice && (
          <p role="status" className="flex items-center gap-3 text-sm">
            <StatusPill tone="ok" label="Saved" />
            <span style={{ color: "var(--color-ink-2)" }}>{notice}</span>
          </p>
        )}

        {panel && panelInitial && (
          <StackForm
            key={
              panel.mode === "new" ? "new" : `${panel.mode}-${panel.slug}`
            }
            formId={
              panel.mode === "new" ? "new-stack" : `${panel.mode}-stack`
            }
            heading={
              panel.mode === "new"
                ? "New tech stack"
                : panel.mode === "clone"
                  ? `Clone ${panelStack?.name ?? "stack"}`
                  : `Edit ${panelStack?.name ?? "stack"}`
            }
            lede={
              panel.mode === "edit"
                ? `Slug ${panel.slug} never changes, so links keep working.`
                : "Define the tech stack, gate commands and ship targets. Customs inherit the five required checks."
            }
            initial={panelInitial}
            submitLabel={
              panel.mode === "new"
                ? "Add stack"
                : panel.mode === "clone"
                  ? "Clone stack"
                  : "Save stack"
            }
            onSubmit={(draft) => {
              if (panel.mode === "edit") {
                const errors = updateStack(panel.slug, draft);
                if (errors) {
                  return errors;
                }
                closePanels();
                setNotice(`Saved ${draft.name.trim()}.`);
                return null;
              }
              const errors = createStack(draft);
              if (errors) {
                return errors;
              }
              closePanels();
              setNotice(
                panel.mode === "clone"
                  ? `Cloned ${panelStack?.name ?? "stack"} as ${draft.name.trim()}.`
                  : `Added ${draft.name.trim()} as a draft.`,
              );
              return null;
            }}
            onCancel={closePanels}
          />
        )}

        <div className="overflow-x-auto">
          <table className="spec-table min-w-[820px]">
            <thead>
              <tr>
                <th scope="col">Stack</th>
                <th scope="col">Source</th>
                <th scope="col">Status</th>
                <th scope="col">Headliner</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {stacks.map((stack) => {
                const custom = isCustomStack(stack.slug);
                const isConfirming = confirmingRemove === stack.slug;
                return (
                  <tr key={stack.slug}>
                    <td>
                      <Link
                        href={`/stacks/${stack.slug}`}
                        className="font-semibold underline decoration-[var(--color-rule)] underline-offset-2 hover:decoration-[var(--color-accent-deep)]"
                      >
                        {stack.name}
                      </Link>
                      <span
                        className="mono block text-sm"
                        style={{ color: "var(--color-ink-2)" }}
                      >
                        {stack.slug}
                      </span>
                    </td>
                    <td className="mono text-sm">
                      {custom ? "workspace" : "shipped"}
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
                      <div className="flex flex-wrap gap-2">
                        {custom && (
                          <button
                            type="button"
                            className="btn-ghost px-3 py-1.5 text-sm"
                            onClick={() => {
                              setPanel({ mode: "edit", slug: stack.slug });
                              setConfirmingRemove(null);
                              setNotice(null);
                            }}
                          >
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-ghost px-3 py-1.5 text-sm"
                          onClick={() => {
                            setPanel({ mode: "clone", slug: stack.slug });
                            setConfirmingRemove(null);
                            setNotice(null);
                          }}
                        >
                          Clone
                        </button>
                        {custom &&
                          (isConfirming ? (
                            <>
                              <button
                                type="button"
                                className="btn-danger px-3 py-1.5 text-sm"
                                onClick={() => {
                                  deleteStack(stack.slug);
                                  setConfirmingRemove(null);
                                  closePanels();
                                  setNotice(`Removed ${stack.name}.`);
                                }}
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                className="btn-ghost px-3 py-1.5 text-sm"
                                onClick={() => setConfirmingRemove(null)}
                              >
                                Keep
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="btn-ghost px-3 py-1.5 text-sm"
                              onClick={() => {
                                setConfirmingRemove(stack.slug);
                                setNotice(null);
                              }}
                            >
                              Remove
                            </button>
                          ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mono text-sm" style={{ color: "var(--color-ink-2)" }}>
          Workspace stacks live in this browser until the API lands.
          Shipping a stack for everyone? See stacks/README.md — manifest +
          blueprint, no new dependencies.
        </p>
      </div>
    </ControlPlaneShell>
  );
}
