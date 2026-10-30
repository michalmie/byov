"use client";

import { useState } from "react";
import { ControlPlaneShell } from "@/components/shell";
import { StatusPill } from "@/components/data-ui";
import { SettingsSubnav } from "@/components/settings-subnav";
import { SourceControlForm } from "@/components/source-control-form";
import { useSourceControlSettings } from "@/lib/source-control-store";
import type {
  GitHubAccountType,
  RepoVisibility,
  SourceControlFieldErrors,
  SourceControlSettings,
} from "@/lib/source-control";

export default function SettingsSourceControl() {
  const { settings, saveSettings, resetSettings } = useSourceControlSettings();
  const [draft, setDraft] = useState<SourceControlSettings>(settings);
  const [prevSettings, setPrevSettings] = useState(settings);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<SourceControlFieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [previewSlug, setPreviewSlug] = useState("rota-planner");

  // Pick up stored settings once they hydrate, unless already editing.
  if (settings !== prevSettings && !dirty) {
    setPrevSettings(settings);
    setDraft(settings);
  }

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
      // Turning public off while public is the default would strand the
      // form in an invalid state — fall back to private in the same edit.
      if (field === "allowPublicRepos" && !value && next.defaultVisibility === "public") {
        next.defaultVisibility = "private";
      }
      return next;
    });
    touch(field);
    if (field === "allowPublicRepos") touch("defaultVisibility");
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const result = saveSettings(draft);
    if (result) {
      setErrors(result);
      return;
    }
    setDirty(false);
    setNotice("Source control settings saved.");
  }

  function handleReset() {
    resetSettings();
    setDirty(false);
    setErrors({});
    setConfirmReset(false);
    setNotice("Source control settings are back to defaults.");
  }

  return (
    <ControlPlaneShell crumb="Settings / Source control" subnav={<SettingsSubnav />}>
      <div className="grid gap-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Source control</h1>
          <p
            className="mt-2 max-w-[65ch] text-sm"
            style={{ color: "var(--color-muted)" }}
          >
            Where app code lives for the whole workspace. Link GitHub once,
            then every new app gets a governed repo — private by default,
            named with the <span className="mono">byov-</span> taxonomy.
            Admins only.
          </p>
        </div>

        {notice && (
          <p role="status" className="flex items-center gap-3 text-sm">
            <StatusPill tone="ok" label="Saved" />
            <span style={{ color: "var(--color-ink-2)" }}>{notice}</span>
          </p>
        )}

        <form onSubmit={handleSubmit} noValidate className="grid gap-8">
          <SourceControlForm
            draft={draft}
            errors={errors}
            previewSlug={previewSlug}
            onPreviewSlugChange={setPreviewSlug}
            onToggle={toggle}
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
            {confirmReset ? (
              <>
                <button
                  type="button"
                  className="btn-danger px-4 py-2 text-sm"
                  onClick={handleReset}
                >
                  Confirm reset
                </button>
                <button
                  type="button"
                  className="btn-ghost px-4 py-2 text-sm"
                  onClick={() => setConfirmReset(false)}
                >
                  Keep
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn-ghost px-4 py-2 text-sm"
                onClick={() => setConfirmReset(true)}
              >
                Reset to defaults
              </button>
            )}
          </div>
        </form>
      </div>
    </ControlPlaneShell>
  );
}
