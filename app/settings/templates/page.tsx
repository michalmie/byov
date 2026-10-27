"use client";

import { useState } from "react";
import Link from "next/link";
import { ControlPlaneShell } from "@/components/shell";
import { StatusPill } from "@/components/data-ui";
import { TemplateForm } from "@/components/template-form";
import { SettingsSubnav } from "@/components/settings-subnav";
import { useManagedTemplates } from "@/lib/template-store";
import {
  defaultTemplateDraft,
  draftFromTemplate,
  frameworkOf,
  type TemplateDraft,
} from "@/lib/templates";

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

export default function SettingsTemplates() {
  const {
    templates,
    customTemplates,
    isCustom,
    getManagedTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    resetTemplates,
  } = useManagedTemplates();
  const [panel, setPanel] = useState<Panel>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function closePanels() {
    setPanel(null);
  }

  const panelTemplate =
    panel && panel.mode !== "new"
      ? getManagedTemplate(panel.slug)
      : undefined;

  const panelInitial: TemplateDraft | undefined = panel
    ? panel.mode === "new"
      ? defaultTemplateDraft()
      : panelTemplate
        ? panel.mode === "clone"
          ? draftFromTemplate(panelTemplate)
          : {
              ...draftFromTemplate(panelTemplate),
              name: panelTemplate.name,
              status: panelTemplate.status,
            }
        : undefined
    : undefined;

  return (
    <ControlPlaneShell crumb="Settings / Templates" subnav={<SettingsSubnav />}>
      <div className="grid gap-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Templates
          </h1>
          <p
            className="mt-2 max-w-[65ch] text-sm"
            style={{ color: "var(--color-muted)" }}
          >
            Define and edit workspace templates. Shipped templates are
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
                New template
              </button>
            )}
            {customTemplates.length > 0 &&
              (confirmReset ? (
                <>
                  <button
                    type="button"
                    className="btn-danger px-3 py-1.5 text-[13px]"
                    onClick={() => {
                      resetTemplates();
                      closePanels();
                      setConfirmReset(false);
                      setNotice(
                        "Workspace templates removed — shipped catalog restored.",
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
          <TemplateForm
            key={
              panel.mode === "new" ? "new" : `${panel.mode}-${panel.slug}`
            }
            formId={
              panel.mode === "new" ? "new-template" : `${panel.mode}-template`
            }
            heading={
              panel.mode === "new"
                ? "New template"
                : panel.mode === "clone"
                  ? `Clone ${panelTemplate?.name ?? "template"}`
                  : `Edit ${panelTemplate?.name ?? "template"}`
            }
            lede={
              panel.mode === "edit"
                ? `Slug ${panel.slug} never changes, so links keep working.`
                : "Define the stack, gate commands and ship targets. Customs inherit the five required checks."
            }
            initial={panelInitial}
            submitLabel={
              panel.mode === "new"
                ? "Add template"
                : panel.mode === "clone"
                  ? "Clone template"
                  : "Save template"
            }
            onSubmit={(draft) => {
              if (panel.mode === "edit") {
                const errors = updateTemplate(panel.slug, draft);
                if (errors) {
                  return errors;
                }
                closePanels();
                setNotice(`Saved ${draft.name.trim()}.`);
                return null;
              }
              const errors = createTemplate(draft);
              if (errors) {
                return errors;
              }
              closePanels();
              setNotice(
                panel.mode === "clone"
                  ? `Cloned ${panelTemplate?.name ?? "template"} as ${draft.name.trim()}.`
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
                <th scope="col">Template</th>
                <th scope="col">Source</th>
                <th scope="col">Status</th>
                <th scope="col">Stack</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => {
                const custom = isCustom(template.slug);
                const isConfirming = confirmingRemove === template.slug;
                return (
                  <tr key={template.slug}>
                    <td>
                      <Link
                        href={`/templates/${template.slug}`}
                        className="font-semibold underline decoration-[var(--color-rule)] underline-offset-2 hover:decoration-[var(--color-accent-deep)]"
                      >
                        {template.name}
                      </Link>
                      <span
                        className="mono block text-sm"
                        style={{ color: "var(--color-ink-2)" }}
                      >
                        {template.slug}
                      </span>
                    </td>
                    <td className="mono text-sm">
                      {custom ? "workspace" : "shipped"}
                    </td>
                    <td>
                      <StatusPill
                        tone={statusTone[template.status]}
                        label={statusLabel[template.status]}
                      />
                    </td>
                    <td className="mono text-sm">{frameworkOf(template)}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        {custom && (
                          <button
                            type="button"
                            className="btn-ghost px-3 py-1.5 text-sm"
                            onClick={() => {
                              setPanel({ mode: "edit", slug: template.slug });
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
                            setPanel({ mode: "clone", slug: template.slug });
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
                                  deleteTemplate(template.slug);
                                  setConfirmingRemove(null);
                                  closePanels();
                                  setNotice(`Removed ${template.name}.`);
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
                                setConfirmingRemove(template.slug);
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
          Workspace templates live in this browser until the API lands.
          Shipping a stack for everyone? See templates/README.md — manifest +
          blueprint, no new dependencies.
        </p>
      </div>
    </ControlPlaneShell>
  );
}
