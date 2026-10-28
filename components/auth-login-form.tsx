"use client";

// Passwordless (email code) + magic-link sign-in forms for /login.
//
// Contracts (shared auth slice):
// - POST /api/auth/otp/request {email} -> {ok:true}
// - POST /api/auth/otp/verify {email,code} -> {ok:true,...} or 401 {ok:false,error}
// - POST /api/auth/magic-link/request {email} -> {ok:true}
// On verify success the browser navigates to `next` via window.location.assign.

import { useEffect, useState } from "react";

const RESEND_COOLDOWN_SECONDS = 30;

interface AuthLoginFormProps {
  /** Sanitized relative redirect target (single leading slash, else "/"). */
  next: string;
  passwordlessEnabled?: boolean;
  magicLinkEnabled?: boolean;
  /** Friendly copy for a ?error= query param, shown until the user acts. */
  initialError?: string;
}

function isValidEmail(value: string): boolean {
  const email = value.trim();
  return email.length > 3 && email.includes("@") && !email.includes(" ");
}

async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "error" in body) {
      const message: unknown = (body as { error: unknown }).error;
      if (typeof message === "string" && message.length > 0) return message;
    }
  } catch {
    // Non-JSON error body: fall through to the generic message.
  }
  return fallback;
}

export function AuthLoginForm({
  next,
  passwordlessEnabled = true,
  magicLinkEnabled = true,
  initialError,
}: AuthLoginFormProps) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [requestPending, setRequestPending] = useState(false);
  const [verifyPending, setVerifyPending] = useState(false);
  const [magicPending, setMagicPending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  if (!passwordlessEnabled && !magicLinkEnabled) return null;

  function emailOrError(): string | null {
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      setSuccess(null);
      return null;
    }
    return email.trim();
  }

  async function requestCode(event: React.FormEvent) {
    event.preventDefault();
    const address = emailOrError();
    if (address === null || requestPending) return;
    setRequestPending(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address }),
      });
      if (!response.ok) {
        setError(
          await readErrorMessage(
            response,
            "Could not send the code. Please try again.",
          ),
        );
        return;
      }
      setCodeSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setSuccess(`We emailed a 6-digit code to ${address}.`);
    } catch {
      setError("Could not send the code. Check your connection and try again.");
    } finally {
      setRequestPending(false);
    }
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the 6-digit code from your email.");
      setSuccess(null);
      return;
    }
    if (verifyPending) return;
    setVerifyPending(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const body: unknown = await response.json().catch(() => null);
      const ok =
        response.ok &&
        typeof body === "object" &&
        body !== null &&
        (body as { ok?: unknown }).ok === true;
      if (!ok) {
        const serverError =
          typeof body === "object" && body !== null
            ? (body as { error?: unknown }).error
            : undefined;
        setError(
          typeof serverError === "string" && serverError.length > 0
            ? serverError
            : "That code did not work. Please try again.",
        );
        return;
      }
      window.location.assign(next);
    } catch {
      setError("Could not verify the code. Check your connection and try again.");
    } finally {
      setVerifyPending(false);
    }
  }

  async function requestMagicLink() {
    const address = emailOrError();
    if (address === null || magicPending) return;
    setMagicPending(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/auth/magic-link/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address }),
      });
      if (!response.ok) {
        setError(
          await readErrorMessage(
            response,
            "Could not send the sign-in link. Please try again.",
          ),
        );
        return;
      }
      setSuccess(`Check your inbox — we sent a sign-in link to ${address}.`);
    } catch {
      setError(
        "Could not send the sign-in link. Check your connection and try again.",
      );
    } finally {
      setMagicPending(false);
    }
  }

  return (
    <div className="grid gap-4">
      {error !== null && (
        <p role="alert" data-testid="login-error" className="form-error">
          {error}
        </p>
      )}
      {success !== null && (
        <p
          role="status"
          data-testid="login-success"
          className="hint rounded-[6px] px-3 py-2"
          style={{
            background: "var(--color-ok-soft)",
            color: "var(--color-ink)",
          }}
        >
          {success}
        </p>
      )}

      {passwordlessEnabled && (
        <form onSubmit={codeSent ? verifyCode : requestCode} className="grid gap-3">
          <div className="field">
            <label htmlFor="login-email" className="field-label">
              Email address
            </label>
            <input
              id="login-email"
              data-testid="login-email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              className="input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={requestPending || verifyPending}
            />
          </div>

          {!codeSent ? (
            <button
              type="submit"
              data-testid="request-code"
              className="btn-primary w-full items-center justify-center px-3 py-2 text-sm"
              disabled={requestPending}
            >
              {requestPending ? "Sending…" : "Request code"}
            </button>
          ) : (
            <>
              <div className="field">
                <label htmlFor="login-code" className="field-label">
                  Verification code
                </label>
                <input
                  id="login-code"
                  data-testid="login-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="6-digit code"
                  className="input mono tnum"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  disabled={verifyPending}
                />
              </div>
              <button
                type="submit"
                data-testid="verify-code"
                className="btn-primary w-full items-center justify-center px-3 py-2 text-sm"
                disabled={verifyPending}
              >
                {verifyPending ? "Verifying…" : "Verify"}
              </button>
              <button
                type="button"
                data-testid="resend-code"
                className="btn-ghost w-full items-center justify-center px-3 py-2 text-sm"
                disabled={requestPending || cooldown > 0}
                onClick={requestCode}
              >
                {requestPending
                  ? "Sending…"
                  : cooldown > 0
                    ? `Resend code in ${cooldown}s`
                    : "Resend code"}
              </button>
            </>
          )}
        </form>
      )}

      {magicLinkEnabled && (
        <button
          type="button"
          data-testid="magic-link-request"
          className="btn-ghost w-full items-center justify-center px-3 py-2 text-sm"
          disabled={magicPending}
          onClick={requestMagicLink}
        >
          {magicPending ? "Sending…" : "Email me a sign-in link"}
        </button>
      )}
    </div>
  );
}
