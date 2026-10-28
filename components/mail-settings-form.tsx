"use client";

// Default sending-account form for Settings → Email (admin-only).
// Unlike the workspace preferences elsewhere in Settings, this edits live
// server configuration through /api/settings/mail — never localStorage.

import { useState } from "react";
import { StatusPill } from "@/components/data-ui";

export interface MailStatus {
  configured: boolean;
  source: "settings" | "env" | "none";
  host: string;
  port: number;
  security: string;
  user: string;
  from: string;
  hasPassword: boolean;
}

interface MailSettingsFormProps {
  initial: MailStatus;
  onStatusChange: (status: MailStatus) => void;
}

type FieldErrors = Partial<
  Record<"host" | "port" | "security" | "user" | "pass" | "from", string>
>;

function sourceCopy(status: MailStatus): { tone: "ok" | "warn"; label: string; text: string } {
  if (!status.configured) {
    return {
      tone: "warn",
      label: "Not configured",
      text: "No sending account — mail only lands in the server log. Save one below or set SMTP_* on the server.",
    };
  }
  if (status.source === "settings") {
    return {
      tone: "ok",
      label: "Settings",
      text: `Sending through the Settings-saved account (${status.host}). It overrides SMTP_* env.`,
    };
  }
  return {
    tone: "ok",
    label: "Server env",
    text: `Sending through SMTP_* env (${status.host}). Saving here overrides it.`,
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function MailSettingsForm({ initial, onStatusChange }: MailSettingsFormProps) {
  const [host, setHost] = useState(initial.host);
  const [port, setPort] = useState(String(initial.port || 587));
  const [security, setSecurity] = useState(initial.security || "auto");
  const [user, setUser] = useState(initial.user);
  const [pass, setPass] = useState("");
  const [from, setFrom] = useState(initial.from);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testState, setTestState] = useState<
    { pending: true } | { pending: false; ok: boolean; text: string } | null
  >(null);

  const source = sourceCopy(initial);

  function clearFieldError(field: keyof FieldErrors) {
    setBanner(null);
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }

  function applyStatus(body: unknown): boolean {
    const status =
      typeof body === "object" && body !== null
        ? (body as { status?: unknown }).status
        : undefined;
    if (typeof status !== "object" || status === null) return false;
    onStatusChange(status as MailStatus);
    return true;
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setErrors({});
    setBanner(null);
    try {
      const response = await fetch("/api/settings/mail", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: host.trim(),
          port: Number.parseInt(port, 10),
          security,
          user: user.trim(),
          pass,
          from: from.trim(),
        }),
      });
      const body = await readJson(response);
      if (!response.ok) {
        const fieldErrors =
          typeof body === "object" && body !== null
            ? ((body as { errors?: unknown }).errors as FieldErrors | undefined)
            : undefined;
        if (fieldErrors && typeof fieldErrors === "object") {
          setErrors(fieldErrors);
          return;
        }
        const message =
          typeof body === "object" && body !== null
            ? ((body as { error?: unknown }).error as string | undefined)
            : undefined;
        setBanner({
          tone: "warn",
          text: message || "Could not save the sending account.",
        });
        return;
      }
      if (applyStatus(body)) {
        setBanner({ tone: "ok", text: "Sending account saved." });
      }
    } catch {
      setBanner({
        tone: "warn",
        text: "Could not save. Check your connection and try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    setBanner(null);
    try {
      const response = await fetch("/api/settings/mail", { method: "DELETE" });
      const body = await readJson(response);
      if (!response.ok || !applyStatus(body)) {
        setBanner({
          tone: "warn",
          text: "Could not clear the sending account.",
        });
        return;
      }
      setConfirmReset(false);
      setBanner({ tone: "ok", text: "Settings account cleared — server env applies." });
    } catch {
      setBanner({
        tone: "warn",
        text: "Could not clear. Check your connection and try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(event: React.FormEvent) {
    event.preventDefault();
    const to = testTo.trim();
    if (!to || !to.includes("@")) {
      setTestState({
        pending: false,
        ok: false,
        text: "Enter a valid recipient address.",
      });
      return;
    }
    setTestState({ pending: true });
    try {
      const response = await fetch("/api/settings/mail/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const body = await readJson(response);
      const message =
        typeof body === "object" && body !== null
          ? ((body as { error?: unknown }).error as string | undefined)
          : undefined;
      setTestState(
        response.ok
          ? { pending: false, ok: true, text: `Test email sent to ${to}.` }
          : {
              pending: false,
              ok: false,
              text: message || "Test email failed.",
            },
      );
    } catch {
      setTestState({
        pending: false,
        ok: false,
        text: "Could not send. Check your connection and try again.",
      });
    }
  }

  return (
    <div className="grid gap-8">
      <p role="status" className="flex items-center gap-3 text-sm">
        <StatusPill tone={source.tone} label={source.label} />
        <span style={{ color: "var(--color-ink-2)" }}>{source.text}</span>
      </p>

      {banner && (
        <p
          role={banner.tone === "ok" ? "status" : "alert"}
          data-testid="mail-banner"
          className="flex items-center gap-3 text-sm"
        >
          <StatusPill tone={banner.tone} label={banner.tone === "ok" ? "Saved" : "Error"} />
          <span style={{ color: "var(--color-ink-2)" }}>{banner.text}</span>
        </p>
      )}

      <form onSubmit={handleSave} noValidate className="grid gap-8">
        <section aria-labelledby="mail-account-heading" className="card grid gap-6 p-5 sm:p-6">
          <div className="max-w-2xl">
            <h2 id="mail-account-heading" className="text-xl font-semibold tracking-tight">
              Sending account
            </h2>
            <p className="mt-1 text-sm" style={{ color: "var(--color-ink-2)" }}>
              SMTP account for notifications. Saving here overrides SMTP_*
              env on the server; clearing falls back to it.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="field sm:col-span-1">
              <label htmlFor="mail-host" className="field-label">
                SMTP host
              </label>
              <input
                id="mail-host"
                data-testid="mail-host"
                autoComplete="off"
                placeholder="smtp.example.com"
                className="input"
                value={host}
                onChange={(event) => {
                  setHost(event.target.value);
                  clearFieldError("host");
                }}
              />
              {errors.host && (
                <p role="alert" className="form-error">
                  {errors.host}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="field">
                <label htmlFor="mail-port" className="field-label">
                  Port
                </label>
                <input
                  id="mail-port"
                  data-testid="mail-port"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="587"
                  className="input mono"
                  value={port}
                  onChange={(event) => {
                    setPort(event.target.value);
                    clearFieldError("port");
                  }}
                />
                {errors.port && (
                  <p role="alert" className="form-error">
                    {errors.port}
                  </p>
                )}
              </div>
              <div className="field">
                <label htmlFor="mail-security" className="field-label">
                  Security
                </label>
                <select
                  id="mail-security"
                  data-testid="mail-security"
                  className="input"
                  value={security}
                  onChange={(event) => {
                    setSecurity(event.target.value);
                    clearFieldError("security");
                  }}
                >
                  <option value="auto">Auto</option>
                  <option value="ssl">SSL (465)</option>
                  <option value="starttls">STARTTLS</option>
                </select>
                {errors.security && (
                  <p role="alert" className="form-error">
                    {errors.security}
                  </p>
                )}
              </div>
            </div>
            <div className="field">
              <label htmlFor="mail-user" className="field-label">
                Username
              </label>
              <input
                id="mail-user"
                data-testid="mail-user"
                autoComplete="off"
                placeholder="alerts@example.com"
                className="input"
                value={user}
                onChange={(event) => {
                  setUser(event.target.value);
                  clearFieldError("user");
                }}
              />
              {errors.user && (
                <p role="alert" className="form-error">
                  {errors.user}
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor="mail-pass" className="field-label">
                Password
                {initial.hasPassword && (
                  <span className="hint ml-2">(saved — leave blank to keep)</span>
                )}
              </label>
              <input
                id="mail-pass"
                data-testid="mail-pass"
                type="password"
                autoComplete="new-password"
                placeholder={initial.hasPassword ? "••••••••" : "App or account password"}
                className="input"
                value={pass}
                onChange={(event) => {
                  setPass(event.target.value);
                  clearFieldError("pass");
                }}
              />
              {errors.pass && (
                <p role="alert" className="form-error">
                  {errors.pass}
                </p>
              )}
            </div>
            <div className="field sm:col-span-2">
              <label htmlFor="mail-from" className="field-label">
                From address
              </label>
              <input
                id="mail-from"
                data-testid="mail-from"
                autoComplete="off"
                placeholder="BYOV <alerts@example.com>"
                className="input"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  clearFieldError("from");
                }}
              />
              {errors.from && (
                <p role="alert" className="form-error">
                  {errors.from}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              data-testid="mail-save"
              className="btn-primary px-4 py-2 text-sm"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save sending account"}
            </button>
            {confirmReset ? (
              <>
                <button
                  type="button"
                  data-testid="mail-reset-confirm"
                  className="btn-danger px-4 py-2 text-sm"
                  disabled={saving}
                  onClick={handleReset}
                >
                  Confirm clear
                </button>
                <button
                  type="button"
                  className="btn-ghost px-4 py-2 text-sm"
                  disabled={saving}
                  onClick={() => setConfirmReset(false)}
                >
                  Keep
                </button>
              </>
            ) : (
              <button
                type="button"
                data-testid="mail-reset"
                className="btn-ghost px-4 py-2 text-sm"
                disabled={saving}
                onClick={() => setConfirmReset(true)}
              >
                Clear saved account
              </button>
            )}
          </div>
        </section>
      </form>

      <form onSubmit={handleTest} noValidate className="grid gap-8">
        <section aria-labelledby="mail-test-heading" className="card grid gap-6 p-5 sm:p-6">
          <div className="max-w-2xl">
            <h2 id="mail-test-heading" className="text-xl font-semibold tracking-tight">
              Test delivery
            </h2>
            <p className="mt-1 text-sm" style={{ color: "var(--color-ink-2)" }}>
              Send a test email through the active account. Failures report
              the provider error so the account can be fixed.
            </p>
          </div>
          {testState && !testState.pending && (
            <p
              role={testState.ok ? "status" : "alert"}
              data-testid="mail-test-result"
              className="flex items-center gap-3 text-sm"
            >
              <StatusPill tone={testState.ok ? "ok" : "warn"} label={testState.ok ? "Sent" : "Failed"} />
              <span style={{ color: "var(--color-ink-2)" }}>{testState.text}</span>
            </p>
          )}
          <div className="field max-w-md">
            <label htmlFor="mail-test-to" className="field-label">
              Recipient
            </label>
            <input
              id="mail-test-to"
              data-testid="mail-test-to"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className="input"
              value={testTo}
              onChange={(event) => setTestTo(event.target.value)}
            />
          </div>
          <div>
            <button
              type="submit"
              data-testid="mail-test-send"
              className="btn-ghost px-4 py-2 text-sm"
              disabled={testState?.pending}
            >
              {testState?.pending ? "Sending…" : "Send test email"}
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
