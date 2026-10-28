"use client";

// Segmented verification-code field for the login form, in the spirit of
// AffectUI's OTP input: one real (invisible) input lies over the boxes, so
// typing, Backspace, paste and mobile SMS autofill all work natively while
// the boxes only draw what it holds. The focus ring glides between boxes
// with pure CSS (no measurement), digits pop in, verifying shimmers, and a
// wrong code shakes red. Styled with BYOV tokens; no demo or prefilled code.

import { useEffect, useRef, useState, type CSSProperties } from "react";

export type OtpStatus = "idle" | "verifying" | "error";

interface OtpInputProps {
  /** Current code (digits only); the parent owns this state. */
  value: string;
  onChange: (code: string) => void;
  /** Called once the last box fills — typed, pasted or autofilled. */
  onComplete?: (code: string) => void;
  length?: number;
  status?: OtpStatus;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Accessible name of the field. */
  label?: string;
  /** DOM id of the real input (lets a <label> point at it). */
  id?: string;
  inputTestId?: string;
  resendTestId?: string;
  /** Shows the resend row below the boxes. */
  onResend?: () => void;
  /** Seconds until resend is allowed; 0 (or missing) means ready now. */
  resendIn?: number;
  /** Disables the resend button while a resend is in flight. */
  resendDisabled?: boolean;
}

/** Digits only, capped at length — pasted "482 913" becomes "482913". */
function cleanCode(text: string, length: number): string {
  let out = "";
  for (const ch of text) {
    if (ch >= "0" && ch <= "9" && out.length < length) out += ch;
  }
  return out;
}

/** "0:07", "0:30", "1:05". */
function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  status = "idle",
  disabled = false,
  autoFocus = false,
  label = "Verification code",
  id,
  inputTestId,
  resendTestId,
  onResend,
  resendIn = 0,
  resendDisabled = false,
}: OtpInputProps) {
  const [focused, setFocused] = useState(false);
  const [caret, setCaret] = useState(value.length);
  const inputRef = useRef<HTMLInputElement>(null);

  const code = cleanCode(value, length);
  const active = Math.max(0, Math.min(caret, code.length, length - 1));
  const readOnly = status === "verifying" || disabled;
  const showRing =
    status !== "verifying" &&
    !disabled &&
    (focused || (code.length > 0 && code.length < length));
  const resendWait = Math.max(0, Math.floor(resendIn));

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  function handleChange(el: HTMLInputElement) {
    if (readOnly) {
      el.value = code;
      return;
    }
    const next = cleanCode(el.value, length);
    setCaret(el.selectionStart ?? next.length);
    if (next === code) {
      // Rejected input (letters, overflow): keep the DOM in sync with state.
      el.value = code;
      return;
    }
    onChange(next);
    if (next.length === length) onComplete?.(next);
  }

  return (
    <div
      className="otp"
      data-status={status}
      data-error={status === "error" || undefined}
    >
      <div
        className="otp-slots"
        dir="ltr"
        style={{ "--otp-active": active, "--otp-n": length } as CSSProperties}
      >
        {Array.from({ length }, (_, i) => {
          const ch = code[i];
          return (
            <span
              key={i}
              className="otp-box"
              data-filled={ch ? "" : undefined}
              style={{ "--otp-i": i } as CSSProperties}
              aria-hidden="true"
            >
              {ch && <span key={`${i}:${ch}`} className="otp-char">{ch}</span>}
            </span>
          );
        })}
        <span
          className="otp-ring"
          data-show={showRing || undefined}
          aria-hidden="true"
        >
          <span
            className="otp-caret"
            data-show={(focused && !code[active] && !readOnly) || undefined}
          />
        </span>
        <input
          ref={inputRef}
          id={id}
          className="otp-input"
          type="text"
          value={code}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-label={`${label}, ${length} digits`}
          aria-invalid={status === "error" || undefined}
          disabled={disabled}
          readOnly={status === "verifying"}
          data-testid={inputTestId}
          onChange={(event) => handleChange(event.currentTarget)}
          onSelect={(event) =>
            setCaret(event.currentTarget.selectionStart ?? code.length)
          }
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </div>

      {onResend && (
        <div className="otp-resend">
          <span>Didn&rsquo;t get a code?</span>{" "}
          {resendWait > 0 ? (
            <span className="otp-wait">Resend in {clock(resendWait)}</span>
          ) : (
            <button
              type="button"
              data-testid={resendTestId}
              className="otp-resend-btn"
              onClick={onResend}
              disabled={disabled || resendDisabled}
            >
              {resendDisabled ? "Sending…" : "Resend code"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
