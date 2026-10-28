"use client";

// Client half of the standalone public /login page. Reads ?next= and ?error=
// (passed in by the server page), fetches GET /api/auth/providers on mount,
// and composes the passwordless form, magic-link button and OAuth links.
// No shell, sidebar or topbar: this page renders for signed-out visitors.

import { useEffect, useState } from "react";
import { LogoMark } from "@/components/logo";
import { AuthLoginForm } from "@/components/auth-login-form";
import {
  AuthOAuthButtons,
  OAUTH_PROVIDER_IDS,
  type OAuthProviderInfo,
} from "@/components/auth-oauth-buttons";

export interface LoginViewProps {
  nextParam?: string;
  errorParam?: string;
}

/** Only a single-leading-slash relative target is honored; else "/". */
export function getSafeNext(value: string | null | undefined): string {
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return "/";
}

function errorCopy(errorParam: string | undefined): string | undefined {
  if (errorParam === "not-allowed") return "Your email is not on the access list.";
  if (errorParam === "oauth-failed") return "Sign-in failed, please try again.";
  return undefined;
}

/** Contract labels, used when the providers fetch fails. */
const FALLBACK_PROVIDERS: OAuthProviderInfo[] = [
  { id: "passwordless", label: "Passwordless code", enabled: true },
  { id: "magic-link", label: "Email sign-in link", enabled: true },
  { id: "entra", label: "Microsoft Entra ID", enabled: true },
  { id: "github", label: "GitHub", enabled: true },
  { id: "google", label: "Google", enabled: true },
  { id: "apple", label: "Apple", enabled: true },
];

function isProviderList(value: unknown): value is OAuthProviderInfo[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { id: unknown }).id === "string" &&
        typeof (entry as { label: unknown }).label === "string" &&
        typeof (entry as { enabled: unknown }).enabled === "boolean",
    )
  );
}

export function LoginView({ nextParam, errorParam }: LoginViewProps) {
  const next = getSafeNext(nextParam);
  const [providers, setProviders] = useState<OAuthProviderInfo[] | null>(null);
  const [providersFailed, setProvidersFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadProviders() {
      try {
        const response = await fetch("/api/auth/providers");
        if (!response.ok) throw new Error(`providers ${response.status}`);
        const body: unknown = await response.json();
        if (!isProviderList(body)) throw new Error("providers shape");
        if (!cancelled) setProviders(body);
      } catch {
        if (!cancelled) {
          setProvidersFailed(true);
          setProviders(FALLBACK_PROVIDERS);
        }
      }
    }
    void loadProviders();
    return () => {
      cancelled = true;
    };
  }, []);

  const enabled = (id: string) =>
    providers?.some((provider) => provider.id === id && provider.enabled) ?? false;
  const oauthProviders =
    providers?.filter(
      (provider) =>
        (OAUTH_PROVIDER_IDS as readonly string[]).includes(provider.id) &&
        provider.enabled,
    ) ?? [];
  const showEmailMethods =
    providers !== null && (enabled("passwordless") || enabled("magic-link"));
  const showDivider = showEmailMethods && oauthProviders.length > 0;
  const nothingEnabled =
    providers !== null &&
    !showEmailMethods &&
    oauthProviders.length === 0;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="card w-full max-w-sm p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <LogoMark className="h-12 w-12" />
          <h1 className="mt-4 text-xl font-bold tracking-tight">
            Sign in to BYOV
          </h1>
          <p className="hint mt-1">
            Secure access to your control plane.
          </p>
        </div>

        <div className="mt-6">
          {providers === null ? (
            <div
              data-testid="providers-loading"
              aria-busy="true"
              aria-label="Loading sign-in options"
              className="grid animate-pulse gap-3"
            >
              <div
                className="h-10 rounded-[6px]"
                style={{ background: "var(--color-paper-2)" }}
              />
              <div
                className="h-10 rounded-[6px]"
                style={{ background: "var(--color-paper-2)" }}
              />
              <div
                className="h-10 rounded-[6px]"
                style={{ background: "var(--color-paper-2)" }}
              />
            </div>
          ) : (
            <div className="grid gap-4">
              {providersFailed && (
                <p
                  role="status"
                  data-testid="providers-warning"
                  className="hint rounded-[6px] px-3 py-2"
                  style={{
                    background: "var(--color-warn-soft)",
                    color: "var(--color-ink)",
                  }}
                >
                  Could not load sign-in options — showing all methods.
                </p>
              )}

              {!showEmailMethods && errorCopy(errorParam) !== undefined && (
                <p role="alert" data-testid="login-error" className="form-error">
                  {errorCopy(errorParam)}
                </p>
              )}

              {nothingEnabled ? (
                <p role="status" className="hint text-center">
                  No sign-in methods are currently available. Please contact
                  your administrator.
                </p>
              ) : (
                <>
                  {showEmailMethods && (
                    <AuthLoginForm
                      next={next}
                      passwordlessEnabled={enabled("passwordless")}
                      magicLinkEnabled={enabled("magic-link")}
                      initialError={errorCopy(errorParam)}
                    />
                  )}

                  {showDivider && (
                    <div
                      className="flex items-center gap-3"
                      aria-hidden="true"
                    >
                      <span
                        className="h-px flex-1"
                        style={{ background: "var(--color-rule)" }}
                      />
                      <span className="hint">or continue with</span>
                      <span
                        className="h-px flex-1"
                        style={{ background: "var(--color-rule)" }}
                      />
                    </div>
                  )}

                  <AuthOAuthButtons providers={oauthProviders} next={next} />
                </>
              )}
            </div>
          )}
        </div>

        <p className="hint mt-6 text-center">
          Access restricted to approved members.
        </p>
      </div>
    </main>
  );
}
