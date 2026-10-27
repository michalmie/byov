"use client";

import { useState } from "react";
import { ControlPlaneShell } from "@/components/shell";
import { StatusPill } from "@/components/data-ui";
import { SettingsSubnav } from "@/components/settings-subnav";
import { useWorkspaceSettings } from "@/lib/settings-store";
import type {
  WorkspaceFieldErrors,
  WorkspaceSettings,
} from "@/lib/settings";

export default function SettingsGeneral() {
  const { settings, nodes, saveSettings, resetSettings } =
    useWorkspaceSettings();
  const [draft, setDraft] = useState<WorkspaceSettings>(settings);
  const [prevSettings, setPrevSettings] = useState(settings);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<WorkspaceFieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // Pick up stored settings once they hydrate, unless already editing.
  if (settings !== prevSettings && !dirty) {
    setPrevSettings(settings);
    setDraft(settings);
  }

  function set<K extends keyof WorkspaceSettings>(
    field: K,
    value: WorkspaceSettings[K],
  ) {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
    setNotice(null);
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }

  const defaultKnown =
    !draft.defaultNode ||
    nodes.some((node) => node.slug === draft.defaultNode);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const normalized = {
      ...draft,
      defaultNode: defaultKnown ? draft.defaultNode : "",
    };
    const result = saveSettings(normalized);
    if (result) {
      setErrors(result);
      return;
    }
    setDraft(normalized);
    setDirty(false);
    setNotice("Workspace settings saved.");
  }

  function handleReset() {
    resetSettings();
    setDirty(false);
    setErrors({});
    setConfirmReset(false);
    setNotice("Workspace settings are back to defaults.");
  }

  return (
    <ControlPlaneShell
      crumb="Settings / General"
      subnav={<SettingsSubnav />}
    >
      <div className="grid gap-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            General
          </h1>
          <p
            className="mt-2 max-w-[65ch] text-sm"
            style={{ color: "var(--color-muted)" }}
          >
            How this workspace presents itself. Settings stay in this browser
            until the API lands.
          </p>
        </div>

        {notice && (
          <p role="status" className="flex items-center gap-3 text-sm">
            <StatusPill tone="ok" label="Saved" />
            <span style={{ color: "var(--color-ink-2)" }}>{notice}</span>
          </p>
        )}

        <section
          aria-labelledby="workspace-heading"
          className="card grid gap-6 p-5 sm:p-6"
        >
          <div className="max-w-2xl">
            <h2
              id="workspace-heading"
              className="text-xl font-semibold tracking-tight"
            >
              Workspace
            </h2>
            <p
              className="mt-1 text-sm"
              style={{ color: "var(--color-ink-2)" }}
            >
              The name your team sees, and the node new environments prefer.
            </p>
          </div>
          <form onSubmit={handleSubmit} noValidate className="grid gap-5">
            <div className="field">
              <label className="field-label" htmlFor="workspace-name">
                Workspace name
              </label>
              <input
                id="workspace-name"
                className="input max-w-md"
                type="text"
                autoComplete="off"
                value={draft.workspaceName}
                aria-invalid={Boolean(errors.workspaceName)}
                aria-describedby={
                  errors.workspaceName
                    ? "workspace-name-error"
                    : "workspace-name-hint"
                }
                onChange={(event) => set("workspaceName", event.target.value)}
              />
              <p id="workspace-name-hint" className="hint">
                Shown across the control plane and the client.
              </p>
              {errors.workspaceName && (
                <p id="workspace-name-error" className="form-error">
                  {errors.workspaceName}
                </p>
              )}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="default-node">
                Default node
              </label>
              <select
                id="default-node"
                className="input max-w-md"
                value={defaultKnown ? draft.defaultNode : ""}
                aria-invalid={Boolean(errors.defaultNode)}
                aria-describedby={
                  errors.defaultNode ? "default-node-error" : "default-node-hint"
                }
                onChange={(event) => set("defaultNode", event.target.value)}
              >
                <option value="">None</option>
                {nodes.map((node) => (
                  <option key={node.slug} value={node.slug}>
                    {node.name} · {node.location}
                  </option>
                ))}
              </select>
              <p id="default-node-hint" className="hint">
                {draft.defaultNode && !defaultKnown
                  ? "That node no longer exists — pick a new default or leave it unset."
                  : "Where new environments land unless pinned elsewhere."}
              </p>
              {errors.defaultNode && (
                <p id="default-node-error" className="form-error">
                  {errors.defaultNode}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button type="submit" className="btn-primary px-3 py-1.5 text-[13px]">
                Save changes
              </button>
              {confirmReset ? (
                <>
                  <button
                    type="button"
                    className="btn-danger px-3 py-1.5 text-[13px]"
                    onClick={handleReset}
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
                  Reset to defaults
                </button>
              )}
            </div>
          </form>
        </section>
      </div>
    </ControlPlaneShell>
  );
}
