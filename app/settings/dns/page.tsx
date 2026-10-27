"use client";

import { useState } from "react";
import { ControlPlaneShell } from "@/components/shell";
import { StatusPill } from "@/components/data-ui";
import { SettingsSubnav } from "@/components/settings-subnav";
import { DNS_SCENARIOS } from "@/lib/control-plane";
import { useWorkspaceSettings } from "@/lib/settings-store";
import { DNS_SCENARIO_META } from "@/lib/settings";
import type {
  WorkspaceFieldErrors,
  WorkspaceSettings,
} from "@/lib/settings";

export default function SettingsDns() {
  const { settings, saveSettings, resetSettings } = useWorkspaceSettings();
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

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const result = saveSettings(draft);
    if (result) {
      setErrors(result);
      return;
    }
    setDirty(false);
    setNotice("DNS settings saved.");
  }

  function handleReset() {
    resetSettings();
    setDirty(false);
    setErrors({});
    setConfirmReset(false);
    setNotice("Workspace settings are back to defaults.");
  }

  return (
    <ControlPlaneShell crumb="Settings / DNS" subnav={<SettingsSubnav />}>
      <div className="grid gap-8">
        <div>
          <h1 className="text-[clamp(2rem,3.5vw+0.75rem,3rem)] font-bold leading-[1.05] tracking-tight">
            DNS
          </h1>
          <p
            className="mt-3 max-w-[65ch] text-base"
            style={{ color: "var(--color-ink-2)" }}
          >
            How environment URLs resolve. The default applies workspace-wide;
            each app can override it on its own page.
          </p>
        </div>

        {notice && (
          <p role="status" className="flex items-center gap-3 text-sm">
            <StatusPill tone="ok" label="Saved" />
            <span style={{ color: "var(--color-ink-2)" }}>{notice}</span>
          </p>
        )}

        <section
          aria-labelledby="dns-default-heading"
          className="card grid gap-6 p-5 sm:p-6"
        >
          <div className="max-w-2xl">
            <h2
              id="dns-default-heading"
              className="text-xl font-semibold tracking-tight"
            >
              Default scenario
            </h2>
            <p
              className="mt-1 text-sm"
              style={{ color: "var(--color-ink-2)" }}
            >
              Envs use this unless their app picks another scenario.
            </p>
          </div>
          <form onSubmit={handleSubmit} noValidate className="grid gap-5">
            <div className="field">
              <span className="field-label" id="default-scenario-label">
                Scenario
              </span>
              <div
                role="radiogroup"
                aria-labelledby="default-scenario-label"
                aria-describedby={
                  errors.defaultScenario
                    ? "default-scenario-error"
                    : "default-scenario-hint"
                }
                className="grid gap-2"
              >
                {DNS_SCENARIOS.map((scenario) => (
                  <label
                    key={scenario}
                    className="flex items-start gap-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="default-scenario"
                      value={scenario}
                      checked={draft.defaultScenario === scenario}
                      onChange={() => set("defaultScenario", scenario)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block font-medium">
                        {DNS_SCENARIO_META[scenario].label}
                      </span>
                      <span className="hint">
                        {DNS_SCENARIO_META[scenario].blurb}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <p id="default-scenario-hint" className="hint">
                Nodes serve whatever their setup supports: a zone for
                public and local, a machine name for Tailscale.
              </p>
              {errors.defaultScenario && (
                <p id="default-scenario-error" className="form-error">
                  {errors.defaultScenario}
                </p>
              )}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="dev-zone">
                Development zone <span className="hint">(optional)</span>
              </label>
              <input
                id="dev-zone"
                className="input max-w-md"
                type="text"
                inputMode="url"
                autoComplete="off"
                placeholder="dev.byov.xexo.io"
                value={draft.devZone}
                aria-invalid={Boolean(errors.devZone)}
                aria-describedby={
                  errors.devZone ? "dev-zone-error" : "dev-zone-hint"
                }
                onChange={(event) => set("devZone", event.target.value)}
              />
              <p id="dev-zone-hint" className="hint">
                Short URLs for public development envs on the node serving
                this zone, like app.dev.byov.xexo.io. Blank keeps
                app-env URLs.
              </p>
              {errors.devZone && (
                <p id="dev-zone-error" className="form-error">
                  {errors.devZone}
                </p>
              )}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="tailnet-domain">
                Tailnet domain <span className="hint">(optional)</span>
              </label>
              <input
                id="tailnet-domain"
                className="input max-w-md"
                type="text"
                inputMode="url"
                autoComplete="off"
                placeholder="yak-bebop.ts.net"
                value={draft.tailnetDomain}
                aria-invalid={Boolean(errors.tailnetDomain)}
                aria-describedby={
                  errors.tailnetDomain
                    ? "tailnet-domain-error"
                    : "tailnet-domain-hint"
                }
                onChange={(event) => set("tailnetDomain", event.target.value)}
              />
              <p id="tailnet-domain-hint" className="hint">
                Your tailnet&apos;s DNS name, from Tailscale Admin → DNS.
                Tailnet envs serve on it with stable ports.
              </p>
              {errors.tailnetDomain && (
                <p id="tailnet-domain-error" className="form-error">
                  {errors.tailnetDomain}
                </p>
              )}
            </div>

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
        </section>
      </div>
    </ControlPlaneShell>
  );
}
