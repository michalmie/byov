"use client";

import {
  ADMIN_EMAILS_ENV,
  ALLOWED_DOMAINS_ENV,
  ALLOWED_EMAILS_ENV,
  AUTH_PROVIDERS,
  AUTH_PROVIDER_META,
  ENFORCEMENT_NOTE,
  MAGIC_LINK_ENV_FLAG,
  PASSWORDLESS_ENV_FLAG,
  type AuthSettings,
  type AuthSettingsFieldErrors,
  type OAuthProviderId,
} from "@/lib/auth-settings";

interface AuthSettingsFormProps {
  draft: AuthSettings;
  errors: AuthSettingsFieldErrors;
  onToggle: (
    field: "passwordlessEnabled" | "magicLinkEnabled",
    value: boolean,
  ) => void;
  onProviderToggle: (id: OAuthProviderId, value: boolean) => void;
  onText: (
    field: "allowedEmails" | "allowedDomains" | "adminEmails",
    value: string,
  ) => void;
  onLifetime: (value: number) => void;
}

function MethodToggle({
  id,
  title,
  blurb,
  envFlag,
  checked,
  onChange,
}: {
  id: string;
  title: string;
  blurb: string;
  envFlag: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-2 text-sm">
      <input
        id={id}
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="hint">
          {blurb} Server flag <span className="mono">{envFlag}</span>.{" "}
          {ENFORCEMENT_NOTE}
        </span>
      </span>
    </label>
  );
}

function AccessListField({
  id,
  label,
  placeholder,
  hint,
  error,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  hint: React.ReactNode;
  error: string | undefined;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="input max-w-xl"
        rows={3}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : `${id}-hint`}
        onChange={(event) => onChange(event.target.value)}
      />
      <p id={`${id}-hint`} className="hint">
        {hint}
      </p>
      {error && (
        <p id={`${id}-error`} className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function AuthSettingsForm({
  draft,
  errors,
  onToggle,
  onProviderToggle,
  onText,
  onLifetime,
}: AuthSettingsFormProps) {
  return (
    <>
      <section
        aria-labelledby="auth-methods-heading"
        className="card grid gap-6 p-5 sm:p-6"
      >
        <div className="max-w-2xl">
          <h2
            id="auth-methods-heading"
            className="text-xl font-semibold tracking-tight"
          >
            Sign-in methods
          </h2>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--color-ink-2)" }}
          >
            Email-based sign-in. Both stay on unless the server says
            otherwise.
          </p>
        </div>
        <div className="grid gap-4">
          <MethodToggle
            id="auth-passwordless"
            title="Passwordless code"
            blurb="One-time code sent to the sign-in email."
            envFlag={PASSWORDLESS_ENV_FLAG}
            checked={draft.passwordlessEnabled}
            onChange={(value) => onToggle("passwordlessEnabled", value)}
          />
          <MethodToggle
            id="auth-magic-link"
            title="Email sign-in link"
            blurb="Single-use link sent to the sign-in email."
            envFlag={MAGIC_LINK_ENV_FLAG}
            checked={draft.magicLinkEnabled}
            onChange={(value) => onToggle("magicLinkEnabled", value)}
          />
        </div>
      </section>

      <section
        aria-labelledby="auth-providers-heading"
        className="card grid gap-6 p-5 sm:p-6"
      >
        <div className="max-w-2xl">
          <h2
            id="auth-providers-heading"
            className="text-xl font-semibold tracking-tight"
          >
            OAuth providers
          </h2>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--color-ink-2)" }}
          >
            Single sign-on through an identity provider. Each needs its
            client credentials on the server before it can sign anyone in.
          </p>
        </div>
        <div className="grid gap-4">
          {AUTH_PROVIDERS.map((id) => (
            <MethodToggle
              key={id}
              id={`auth-provider-${id}`}
              title={AUTH_PROVIDER_META[id].label}
              blurb={`Sign in with ${AUTH_PROVIDER_META[id].label}.`}
              envFlag={AUTH_PROVIDER_META[id].envFlag}
              checked={draft.providers[id]}
              onChange={(value) => onProviderToggle(id, value)}
            />
          ))}
        </div>
      </section>

      <section
        aria-labelledby="auth-access-heading"
        className="card grid gap-6 p-5 sm:p-6"
      >
        <div className="max-w-2xl">
          <h2
            id="auth-access-heading"
            className="text-xl font-semibold tracking-tight"
          >
            Who can sign in
          </h2>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--color-ink-2)" }}
          >
            Allow lists for the workspace. {ENFORCEMENT_NOTE}
          </p>
        </div>
        <AccessListField
          id="auth-allowed-emails"
          label="Allowed emails"
          placeholder="ada@example.com, grace@example.com"
          hint={
            <>
              Exact addresses, comma-separated. Mirrors{" "}
              <span className="mono">{ALLOWED_EMAILS_ENV}</span>.
            </>
          }
          error={errors.allowedEmails}
          value={draft.allowedEmails}
          onChange={(value) => onText("allowedEmails", value)}
        />
        <AccessListField
          id="auth-allowed-domains"
          label="Allowed domains"
          placeholder="example.com, research.example.org"
          hint={
            <>
              Bare zones, comma-separated. Mirrors{" "}
              <span className="mono">{ALLOWED_DOMAINS_ENV}</span>.
            </>
          }
          error={errors.allowedDomains}
          value={draft.allowedDomains}
          onChange={(value) => onText("allowedDomains", value)}
        />
        <AccessListField
          id="auth-admin-emails"
          label="Admin emails"
          placeholder="ops@example.com"
          hint={
            <>
              Addresses with admin rights, comma-separated. Mirrors{" "}
              <span className="mono">{ADMIN_EMAILS_ENV}</span>.
            </>
          }
          error={errors.adminEmails}
          value={draft.adminEmails}
          onChange={(value) => onText("adminEmails", value)}
        />
      </section>

      <section
        aria-labelledby="auth-session-heading"
        className="card grid gap-6 p-5 sm:p-6"
      >
        <div className="max-w-2xl">
          <h2
            id="auth-session-heading"
            className="text-xl font-semibold tracking-tight"
          >
            Sessions
          </h2>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--color-ink-2)" }}
          >
            How long a sign-in stays valid. {ENFORCEMENT_NOTE}
          </p>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="auth-session-lifetime">
            Session lifetime (hours)
          </label>
          <input
            id="auth-session-lifetime"
            className="input max-w-[12rem]"
            type="number"
            inputMode="numeric"
            min={1}
            max={720}
            step={1}
            value={draft.sessionLifetimeHours}
            aria-invalid={Boolean(errors.sessionLifetimeHours)}
            aria-describedby={
              errors.sessionLifetimeHours
                ? "auth-session-lifetime-error"
                : "auth-session-lifetime-hint"
            }
            onChange={(event) => onLifetime(event.target.valueAsNumber)}
          />
          <p id="auth-session-lifetime-hint" className="hint">
            Whole hours, from 1 to 720 (30 days). The default session
            cookie lasts 12 hours.
          </p>
          {errors.sessionLifetimeHours && (
            <p id="auth-session-lifetime-error" className="form-error">
              {errors.sessionLifetimeHours}
            </p>
          )}
        </div>
      </section>
    </>
  );
}
