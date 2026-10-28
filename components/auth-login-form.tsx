"use client";

// Email sign-in form for /login: one request sends a single email carrying
// both the 6-digit code and the sign-in link (whichever methods are on),
// and the user completes either. The code is entered here; the link works
// straight from the inbox.
//
// Contracts (shared auth slice):
// - POST /api/auth/otp/request {email,next?} -> {ok:true}
// - POST /api/auth/otp/verify {email,code} -> {ok:true,...} or 401 {ok:false,error}
// - POST /api/auth/magic-link/request {email,next?} -> {ok:true}
// On verify success the browser navigates to `next` via window.location.assign.

import { useEffect, useState } from "react";
import { OtpInput, type OtpStatus } from "./otp-input";

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

function EmailField({
  email,
  onChange,
  disabled,
}: {
  email: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
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
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

export function AuthLoginForm({
  next,
  passwordlessEnabled = true,
  magicLinkEnabled = true,
  initialError,
}: AuthLoginFormProps) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeStatus, setCodeStatus] = useState<OtpStatus>("idle");
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

  async function requestCode(event?: React.FormEvent) {
    event?.preventDefault();
    const address = emailOrError();
    if (address === null || requestPending) return;
    setRequestPending(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The API honors `next` for the emailed sign-in link; omit it when
        // it is the default so the request stays minimal.
        body: JSON.stringify(
          next === "/" ? { email: address } : { email: address, next },
        ),
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
      // A fresh code was issued: clear stale digits and the box state.
      setCode("");
      setCodeStatus("idle");
      setSuccess(
        magicLinkEnabled
          ? `We emailed a 6-digit code and a sign-in link to ${address} — use either.`
          : `We emailed a 6-digit code to ${address}.`,
      );
    } catch {
      setError("Could not send the code. Check your connection and try again.");
    } finally {
      setRequestPending(false);
    }
  }

  async function doVerify(value: string) {
    if (!/^\d{6}$/.test(value.trim())) {
      setError("Enter the 6-digit code from your email.");
      setSuccess(null);
      setCodeStatus("error");
      return;
    }
    if (verifyPending || codeStatus === "success") return;
    setVerifyPending(true);
    setCodeStatus("verifying");
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: value.trim() }),
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
        setCodeStatus("error");
        return;
      }
      // Let the boxes fold into the "Verified" chip before leaving.
      setCodeStatus("success");
      window.setTimeout(() => window.location.assign(next), 950);
    } catch {
      setError("Could not verify the code. Check your connection and try again.");
      setCodeStatus("error");
    } finally {
      setVerifyPending(false);
    }
  }

  function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    void doVerify(code);
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
        // The API honors `next` for the post-login redirect; omit it when
        // it is the default so the request stays minimal.
        body: JSON.stringify(
          next === "/" ? { email: address } : { email: address, next },
        ),
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

  // Code failures render inside the OTP boxes' own message slot (under the
  // same login-error test id); email and request failures keep the top alert.
  // The two never show together.
  const codeError = codeStatus === "error" ? error : null;

  return (
    <div className="grid gap-4">
      {error !== null && codeError === null && (
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

      {passwordlessEnabled ? (
        <form onSubmit={codeSent ? verifyCode : requestCode} className="grid gap-3">
          <EmailField
            email={email}
            onChange={setEmail}
            disabled={requestPending || verifyPending}
          />

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
                <OtpInput
                  id="login-code"
                  inputTestId="login-code"
                  resendTestId="resend-code"
                  errorTestId="login-error"
                  value={code}
                  onChange={(next) => {
                    setCode(next);
                    // Retyping after a failure starts fresh: the message folds
                    // away instead of jumping back to the top alert.
                    if (codeStatus === "error") {
                      setCodeStatus("idle");
                      setError(null);
                    }
                  }}
                  onComplete={(done) => void doVerify(done)}
                  status={codeStatus}
                  errorMessage={codeError ?? undefined}
                  disabled={verifyPending}
                  autoFocus
                  onResend={() => void requestCode()}
                  resendIn={cooldown}
                  resendDisabled={requestPending}
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
            </>
          )}
        </form>
      ) : (
        // Link-only fallback: with codes off there is nothing to enter,
        // so the single request just sends the link.
        <>
          <EmailField
            email={email}
            onChange={setEmail}
            disabled={magicPending}
          />
          <button
            type="button"
            data-testid="magic-link-request"
            className="btn-primary w-full items-center justify-center px-3 py-2 text-sm"
            disabled={magicPending}
            onClick={requestMagicLink}
          >
            {magicPending ? "Sending…" : "Email me a sign-in link"}
          </button>
        </>
      )}
    </div>
  );
}
