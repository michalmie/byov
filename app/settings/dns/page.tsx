"use client";

import { useState } from "react";
import Link from "next/link";
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

function Guide({ steps }: { steps: React.ReactNode[] }) {
  return (
    <ol className="grid list-decimal gap-1.5 pl-5 text-sm">
      {steps.map((step, index) => (
        <li key={index}>{step}</li>
      ))}
    </ol>
  );
}

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
            each app can override it on its own page. Tests run from the
            BYOV server — results reflect its network view.
          </p>
        </div>

        {notice && (
          <p role="status" className="flex items-center gap-3 text-sm">
            <StatusPill tone="ok" label="Saved" />
            <span style={{ color: "var(--color-ink-2)" }}>{notice}</span>
          </p>
        )}

        <form onSubmit={handleSubmit} noValidate className="grid gap-8">
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
          </section>

          <section
            aria-labelledby="dns-public-heading"
            className="card grid gap-6 p-5 sm:p-6"
          >
            <div className="max-w-2xl">
              <h2
                id="dns-public-heading"
                className="text-xl font-semibold tracking-tight"
              >
                Public subdomains
              </h2>
              <p
                className="mt-1 text-sm"
                style={{ color: "var(--color-ink-2)" }}
              >
                Envs at app-env under a public zone, secured by a wildcard
                certificate on each node.
              </p>
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
            <Guide
              steps={[
                <>
                  Set a zone on each node in{" "}
                  <Link className="underline" href="/settings/nodes">
                    Nodes
                  </Link>
                  .
                </>,
                <>
                  Create a <span className="mono">*.zone</span> A record
                  pointing at the node.
                </>,
                <>
                  Request a wildcard certificate on the node (Traefik DNS
                  challenge).
                </>,
                <>
                  Set each app&apos;s Coolify FQDN to the URL the control
                  plane shows, then Test from the Nodes rows.
                </>,
              ]}
            />
          </section>

          <section
            aria-labelledby="dns-tailnet-heading"
            className="card grid gap-6 p-5 sm:p-6"
          >
            <div className="max-w-2xl">
              <h2
                id="dns-tailnet-heading"
                className="text-xl font-semibold tracking-tight"
              >
                Tailscale
              </h2>
              <p
                className="mt-1 text-sm"
                style={{ color: "var(--color-ink-2)" }}
              >
                Envs on the node&apos;s tailnet name with a stable port,
                secured by the node certificate.
              </p>
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
            <Guide
              steps={[
                <>
                  Set the tailnet domain above and a machine name on each
                  node in{" "}
                  <Link className="underline" href="/settings/nodes">
                    Nodes
                  </Link>
                  .
                </>,
                <>
                  Enable MagicDNS and HTTPS certificates in Tailscale
                  Admin → DNS.
                </>,
                <>
                  Run{" "}
                  <span className="mono">
                    tailscale cert {"{machine}.{tailnet}"}
                  </span>{" "}
                  on the node and load it into the node&apos;s proxy.
                </>,
                <>
                  Point the proxy&apos;s per-env ports at the apps, then
                  Test from the Nodes rows or env cards.
                </>,
              ]}
            />
          </section>

          <section
            aria-labelledby="dns-local-heading"
            className="card grid gap-6 p-5 sm:p-6"
          >
            <div className="max-w-2xl">
              <h2
                id="dns-local-heading"
                className="text-xl font-semibold tracking-tight"
              >
                Local DNS
              </h2>
              <p
                className="mt-1 text-sm"
                style={{ color: "var(--color-ink-2)" }}
              >
                Envs under a zone on your internal resolver, secured by
                your private certificate authority.
              </p>
            </div>
            <Guide
              steps={[
                <>
                  Serve{" "}
                  <span className="mono">*.zone</span> from your internal
                  resolver — router DNS, dnsmasq, CoreDNS, or Pi-hole —
                  to the node&apos;s LAN IP.
                </>,
                <>
                  Run a private CA with ACME if you can (step-ca is one
                  option); mkcert covers a single admin machine.
                </>,
                <>
                  Trust the CA on every client and on the BYOV server, so
                  browsers and tests accept node certificates.
                </>,
                <>
                  Set the zone on each node in{" "}
                  <Link className="underline" href="/settings/nodes">
                    Nodes
                  </Link>
                  , then Test from the Nodes rows.
                </>,
              ]}
            />
          </section>

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
