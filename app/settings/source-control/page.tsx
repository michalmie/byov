"use client";

import { useState } from "react";
import { ControlPlaneShell } from "@/components/shell";
import { HealthPill, StatusPill } from "@/components/data-ui";
import { SettingsSubnav } from "@/components/settings-subnav";
import { SourceControlForm } from "@/components/source-control-form";
import { useSourceControlSettings } from "@/lib/source-control-store";
import {
  defaultSourceControlSettings,
  resolveRepoName,
  type GitHubAccountType,
  type RepoProvider,
  type RepoVisibility,
  type SourceControlFieldErrors,
  type SourceControlSettings,
} from "@/lib/source-control";

export default function SettingsSourceControl() {
  const { settings, saveSettings, resetSettings } = useSourceControlSettings();
  const [draft, setDraft] = useState<SourceControlSettings>(settings);
  const [prevSettings, setPrevSettings] = useState(settings);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<SourceControlFieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Pick up stored settings once they hydrate, unless already editing.
  if (settings !== prevSettings && !dirty) {
    setPrevSettings(settings);
    setDraft(settings);
  }

  const configured = settings.connected || settings.accountLogin.trim().length > 0;
  const inForm = adding || editing;

  function touch(field: keyof SourceControlFieldErrors) {
    setDirty(true);
    setNotice(null);
    setErrors((prev) =>
      prev[field] ? { ...prev, [field]: undefined } : prev,
    );
  }

  function toggle(
    field: "connected" | "allowPublicRepos" | "autoCreateRepo",
    value: boolean,
  ) {
    setDraft((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "allowPublicRepos" && !value && next.defaultVisibility === "public") {
        next.defaultVisibility = "private";
      }
      return next;
    });
    touch(field);
    if (field === "allowPublicRepos") touch("defaultVisibility");
  }

  function startNew() {
    setDraft(defaultSourceControlSettings());
    setErrors({});
    setDirty(false);
    setNotice(null);
    setConfirmRemove(false);
    setEditing(false);
    setAdding(true);
  }

  function startManage() {
    setDraft(settings);
    setErrors({});
    setDirty(false);
    setNotice(null);
    setConfirmRemove(false);
    setAdding(false);
    setEditing(true);
  }

  function closeForm() {
    setDraft(settings);
    setErrors({});
    setDirty(false);
    setAdding(false);
    setEditing(false);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const result = saveSettings(draft);
    if (result) {
      setErrors(result);
      return;
    }
    setDirty(false);
    setAdding(false);
    setEditing(false);
    setNotice("Code repository settings saved.");
  }

  function handleReset() {
    resetSettings();
    setDirty(false);
    setErrors({});
    setConfirmReset(false);
    setNotice("Code repository settings are back to defaults.");
  }

  function handleRemove() {
    resetSettings();
    setDraft(defaultSourceControlSettings());
    setDirty(false);
    setErrors({});
    setConfirmRemove(false);
    setAdding(false);
    setEditing(false);
    setNotice("Code repository removed.");
  }

  return (
    <ControlPlaneShell crumb="Settings / Code repositories" subnav={<SettingsSubnav />}>
      <div className="grid gap-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Code repositories</h1>
          <p
            className="mt-2 max-w-[65ch] text-sm"
            style={{ color: "var(--color-muted)" }}
          >
            Where app code lives for the whole workspace. Link a provider
            once, then every new app gets a governed repo — private by
            default, named with your taxonomy. Admins only.
          </p>
        </div>

        {notice && (
          <p role="status" className="flex items-center gap-3 text-sm">
            <StatusPill tone="ok" label="Saved" />
            <span style={{ color: "var(--color-ink-2)" }}>{notice}</span>
          </p>
        )}

        {!inForm && (
          <section aria-labelledby="code-repos-heading" className="grid gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2
                  id="code-repos-heading"
                  className="text-[15px] font-semibold tracking-tight"
                >
                  Configured repositories
                </h2>
                <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-muted)" }}>
                  {configured ? "1 provider linked" : "No provider linked yet"}
                </p>
              </div>
              <button
                type="button"
                className="btn-primary px-4 py-2 text-sm"
                onClick={startNew}
              >
                New Code Repository
              </button>
            </div>

            {configured ? (
              <article
                aria-labelledby="code-repo-card-name"
                className="card grid gap-3 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="grid gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3
                        id="code-repo-card-name"
                        className="text-[15px] font-semibold tracking-tight"
                      >
                        GitHub
                      </h3>
                      <span
                        className="tag px-2 py-0.5 text-xs"
                        style={{ background: "var(--color-paper-2)", color: "var(--color-ink-2)" }}
                      >
                        {settings.accountType === "organization" ? "Organization" : "Personal account"}
                      </span>
                    </div>
                    <p className="mono text-xs" style={{ color: "var(--color-ink-2)" }}>
                      {settings.accountLogin || "not linked"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <HealthPill health={settings.connected ? "healthy" : "pending"} />
                    <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={startManage}>
                      Manage
                    </button>
                    {confirmRemove ? (
                      <>
                        <button type="button" className="btn-danger px-3 py-1.5 text-sm" onClick={handleRemove}>
                          Confirm
                        </button>
                        <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setConfirmRemove(false)}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setConfirmRemove(true)}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <p className="max-w-2xl text-sm" style={{ color: "var(--color-ink-2)" }}>
                  Repos are created through the BYOV GitHub App installation.
                </p>
                <dl className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <dt className="text-[13px] font-medium">Owner</dt>
                    <dd className="mono truncate text-sm" style={{ color: "var(--color-ink-2)" }}>
                      {settings.accountLogin || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[13px] font-medium">Pattern</dt>
                    <dd className="mono truncate text-sm" style={{ color: "var(--color-ink-2)" }}>
                      {settings.repoPattern} → {resolveRepoName(settings, "rota-planner")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[13px] font-medium">Visibility</dt>
                    <dd className="text-sm capitalize" style={{ color: "var(--color-ink-2)" }}>
                      {settings.defaultVisibility} · {settings.defaultBranch}
                    </dd>
                  </div>
                </dl>
              </article>
            ) : (
              <p className="hint">
                No code repository yet — choose <strong>New Code Repository</strong>{" "}
                to link GitHub (the available provider today).
              </p>
            )}
          </section>
        )}

        {inForm && (
          <>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                {adding ? "New Code Repository" : "Manage Code Repository"}
              </h2>
              <p className="mt-1 max-w-[65ch] text-sm" style={{ color: "var(--color-muted)" }}>
                Pick a provider, link it, and set the naming pattern.
                GitHub is available today; more providers come later.
              </p>
            </div>
            <form onSubmit={handleSubmit} noValidate className="grid gap-8">
              <SourceControlForm
                draft={draft}
                errors={errors}
                onToggle={toggle}
                onProvider={(value: RepoProvider) => {
                  setDraft((prev) => ({ ...prev, provider: value }));
                  touch("provider");
                }}
                onAccountType={(value: GitHubAccountType) => {
                  setDraft((prev) => ({ ...prev, accountType: value }));
                  touch("accountType");
                }}
                onVisibility={(value: RepoVisibility) => {
                  setDraft((prev) => ({ ...prev, defaultVisibility: value }));
                  touch("defaultVisibility");
                }}
                onText={(field, value) => {
                  setDraft((prev) => ({ ...prev, [field]: value }));
                  touch(field);
                }}
              />

              <div className="flex flex-wrap gap-3">
                <button type="submit" className="btn-primary px-4 py-2 text-sm">
                  Save changes
                </button>
                <button type="button" className="btn-ghost px-4 py-2 text-sm" onClick={closeForm}>
                  Cancel
                </button>
                {editing && (confirmReset ? (
                  <>
                    <button type="button" className="btn-danger px-4 py-2 text-sm" onClick={handleReset}>
                      Confirm reset
                    </button>
                    <button type="button" className="btn-ghost px-4 py-2 text-sm" onClick={() => setConfirmReset(false)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn-ghost px-4 py-2 text-sm" onClick={() => setConfirmReset(true)}>
                    Reset to defaults
                  </button>
                ))}
              </div>
            </form>
          </>
        )}
      </div>
    </ControlPlaneShell>
  );
}
