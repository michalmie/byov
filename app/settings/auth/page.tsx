"use client";

import { useState } from "react";
import { ControlPlaneShell } from "@/components/shell";
import { StatusPill } from "@/components/data-ui";
import { AuthSettingsForm } from "@/components/auth-settings-form";
import { SettingsSubnav } from "@/components/settings-subnav";
import { useAuthSettings } from "@/lib/auth-settings-store";
import type {
  AuthSettings,
  AuthSettingsFieldErrors,
  OAuthProviderId,
} from "@/lib/auth-settings";

export default function SettingsAuth() {
  const { settings, saveAuthSettings, resetAuthSettings } = useAuthSettings();
  const [draft, setDraft] = useState<AuthSettings>(settings);
  const [prevSettings, setPrevSettings] = useState(settings);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<AuthSettingsFieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // Pick up stored settings once they hydrate, unless already editing.
  if (settings !== prevSettings && !dirty) {
    setPrevSettings(settings);
    setDraft(settings);
  }

  function touch(field: keyof AuthSettingsFieldErrors) {
    setDirty(true);
    setNotice(null);
    setErrors((prev) =>
      prev[field] ? { ...prev, [field]: undefined } : prev,
    );
  }

  function toggle(
    field: "passwordlessEnabled" | "magicLinkEnabled",
    value: boolean,
  ) {
    setDraft((prev) => ({ ...prev, [field]: value }));
    touch(field);
  }

  function toggleProvider(id: OAuthProviderId, value: boolean) {
    setDraft((prev) => ({
      ...prev,
      providers: { ...prev.providers, [id]: value },
    }));
    touch("providers");
  }

  function text(
    field: "allowedEmails" | "allowedDomains" | "adminEmails",
    value: string,
  ) {
    setDraft((prev) => ({ ...prev, [field]: value }));
    touch(field);
  }

  function lifetime(value: number) {
    setDraft((prev) => ({
      ...prev,
      sessionLifetimeHours: Number.isNaN(value) ? prev.sessionLifetimeHours : value,
    }));
    touch("sessionLifetimeHours");
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const result = saveAuthSettings(draft);
    if (result) {
      setErrors(result);
      return;
    }
    setDirty(false);
    setNotice("Auth settings saved.");
  }

  function handleReset() {
    resetAuthSettings();
    setDirty(false);
    setErrors({});
    setConfirmReset(false);
    setNotice("Auth settings are back to defaults.");
  }

  return (
    <ControlPlaneShell crumb="Settings / Auth" subnav={<SettingsSubnav />}>
      <div className="grid gap-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Auth</h1>
          <p
            className="mt-2 max-w-[65ch] text-sm"
            style={{ color: "var(--color-muted)" }}
          >
            How this workspace signs people in. These are workspace
            preferences kept in this browser — enforcement follows server
            configuration until the API lands.
          </p>
        </div>

        {notice && (
          <p role="status" className="flex items-center gap-3 text-sm">
            <StatusPill tone="ok" label="Saved" />
            <span style={{ color: "var(--color-ink-2)" }}>{notice}</span>
          </p>
        )}

        <form onSubmit={handleSubmit} noValidate className="grid gap-8">
          <AuthSettingsForm
            draft={draft}
            errors={errors}
            onToggle={toggle}
            onProviderToggle={toggleProvider}
            onText={text}
            onLifetime={lifetime}
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
