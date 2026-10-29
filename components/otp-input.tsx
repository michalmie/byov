"use client";

// Segmented verification-code field for the login form, after AffectUI's
// OTP input (clean style): one real (invisible) input lies over the boxes,
// so typing, Backspace, paste and mobile SMS autofill all work natively
// while the boxes only draw what it holds. The focus ring glides between
// boxes, digits pop in (a pasted code one after another), verifying
// shimmers, a wrong code shakes red and clears for retyping, and a right
// one folds the boxes into a green "Verified" chip. White cells with
// hairline shadows, thin blue ring, tab-style resend — all in BYOV tokens.
// Controlled only (the parent owns the code); no demo or prefilled code.

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export type OtpStatus = "idle" | "verifying" | "error" | "success";

interface OtpInputProps {
  /** Current code (digits only); the parent owns this state. */
  value: string;
  onChange: (code: string) => void;
  /** Called once the last box fills — typed, pasted or autofilled. */
  onComplete?: (code: string) => void;
  length?: number;
  status?: OtpStatus;
  /** Slides in below the boxes while the status is "error". */
  errorMessage?: ReactNode;
  /** Fades the wrong code out shortly after an error. Defaults to true. */
  clearOnError?: boolean;
  /** Text in the chip after a successful check. */
  successLabel?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Accessible name of the field. */
  label?: string;
  /** DOM id of the real input (lets a <label> point at it). */
  id?: string;
  inputTestId?: string;
  resendTestId?: string;
  errorTestId?: string;
  /** Shows the resend row below the boxes. */
  onResend?: () => void;
  /** Seconds until resend is allowed; 0 (or missing) means ready now. */
  resendIn?: number;
  /** Disables the resend button while a resend is in flight. */
  resendDisabled?: boolean;
}

/** Full-width (１２３) and Arabic-Indic digits (٤٨٢) count as digits. */
function normalizeDigits(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x6f0));
}

/** Digits only, capped at length — pasted "482 913" becomes "482913". */
function cleanCode(text: string, length: number): string {
  let out = "";
  for (const ch of normalizeDigits(String(text ?? ""))) {
    if (ch >= "0" && ch <= "9" && out.length < length) out += ch;
  }
  return out;
}

/** "0:07", "0:30", "1:05". */
function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const CHECK_PATH = "M5.5 12.5l4 4L18.5 8";
const ALERT_PATH = "M12 8v4.5M12 16h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z";

export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  status = "idle",
  errorMessage,
  clearOnError = true,
  successLabel = "Verified",
  disabled = false,
  autoFocus = false,
  label = "Verification code",
  id,
  inputTestId,
  resendTestId,
  errorTestId,
  onResend,
  resendIn = 0,
  resendDisabled = false,
}: OtpInputProps) {
  const code = cleanCode(value, length);
  const [idx, setIdx] = useState(Math.min(code.length, length - 1));
  const [focused, setFocused] = useState(false);
  const [clearing, setClearing] = useState(false); // the wrong code fades out

  const input = useRef<HTMLInputElement>(null);
  const slots = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const pillInner = useRef<HTMLSpanElement>(null);
  const boxes = useRef<(HTMLSpanElement | null)[]>([]);
  const timers = useRef<number[]>([]);
  const fieldId = useId();

  // Pop-in bookkeeping per box: the arrival count re-keys the digit so it
  // animates once, and the delay staggers pasted codes one after another.
  // Computed in commit() (event time), read during render — plain state.
  const [pop, setPop] = useState<{ count: number; delay: number }[]>([]);

  // An outside change of the value (or a shorter code) keeps the active box
  // in reach.
  const active = Math.min(idx, code.length, length - 1);

  const busy = status === "verifying" || status === "success";
  const readOnly = busy || disabled;
  // The parent flips the status back to idle on retype, so the error state
  // needs no separate shown flag. The live region covers only the states
  // with no visible text of their own: the error slot is role="alert" and
  // the chip is aria-hidden, so announcing them again would speak twice.
  const showError = status === "error";
  const announce =
    status === "verifying"
      ? "Verifying code"
      : status === "success"
        ? successLabel
        : "";
  // The ring shows where the next character goes: while focused, or midway
  // through a code.
  const showRing =
    !busy && !disabled && (focused || (code.length > 0 && code.length < length));
  const resendWait = Math.max(0, Math.floor(resendIn));

  const commit = (next: string, nextIdx: number, user = true) => {
    if (next !== code) {
      const changed = [...next].map((c, i) => c !== code[i]);
      if (changed.includes(true)) {
        const first = changed.indexOf(true);
        const bulk = changed.filter(Boolean).length > 1;
        setPop((prev) => {
          const cells = [...prev];
          changed.forEach((isNew, i) => {
            if (!isNew) return;
            cells[i] = {
              count: (cells[i]?.count ?? 0) + 1,
              delay: bulk ? (i - first) * 45 : 0,
            };
          });
          return cells;
        });
      }
      onChange(next);
    }
    setIdx(Math.max(0, Math.min(nextIdx, next.length, length - 1)));
    if (!user) return;
    // Typing during the shake-and-fade window cancels the scheduled clear
    // so fresh input is never wiped; the parent also leaves error status.
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (clearing) setClearing(false);
    if (next.length === length && next !== code) onComplete?.(next);
  };

  /* ---------- Native input ---------- */

  const handleInput = (el: HTMLInputElement) => {
    if (readOnly) return;
    const raw = el.value;
    const caretRaw = el.selectionStart ?? raw.length;
    const next = cleanCode(raw, length);
    // The caret counts the kept characters in front of it.
    const caret = cleanCode(raw.slice(0, caretRaw), length).length;
    if (next === code) {
      el.value = code;
      syncSelection();
      return;
    }
    commit(next, caret);
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (readOnly) return;
    const text = cleanCode(e.clipboardData.getData("text"), length);
    if (!text) return;
    // A whole code replaces everything; a part is written from the
    // active box on.
    if (text.length >= length) return commit(text.slice(0, length), length - 1);
    const next = (code.slice(0, active) + text + code.slice(active + text.length)).slice(
      0,
      length,
    );
    commit(next, active + text.length);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const last = Math.min(code.length, length - 1);
    const moves: Record<string, number> = {
      ArrowLeft: active - 1,
      ArrowRight: active + 1,
      Home: 0,
      End: last,
      ArrowUp: 0,
      ArrowDown: last,
    };
    if (e.key in moves && !e.shiftKey && !e.metaKey) {
      e.preventDefault();
      setIdx(Math.max(0, Math.min(moves[e.key], last)));
    }
  };

  /** A tap or click picks the box under the pointer — never beyond the
   * first empty one. The selection is set directly (never in a deferred
   * callback) so a stale closure can't stomp the caret mid-typing. */
  const pick = (x: number) => {
    let i = boxes.current.findIndex(
      (b) => b && x < b.getBoundingClientRect().right + 4,
    );
    if (i < 0) i = length - 1;
    const next = Math.min(i, code.length, length - 1);
    setIdx(next);
    const el = input.current;
    if (el && document.activeElement === el) {
      if (next < code.length) el.setSelectionRange(next, next + 1);
      else el.setSelectionRange(next, next);
    }
  };

  // The real input selects the active character, so typing replaces it and
  // Backspace removes it.
  const syncSelection = () => {
    const el = input.current;
    if (!el || document.activeElement !== el) return;
    const i = Math.min(idx, code.length, length - 1);
    if (i < code.length) el.setSelectionRange(i, i + 1);
    else el.setSelectionRange(i, i);
  };
  useLayoutEffect(syncSelection);

  useEffect(() => {
    if (autoFocus) input.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  /* ---------- The success chip ---------- */

  useLayoutEffect(() => {
    // The chip starts as wide as all the boxes and morphs down to its label.
    const p = pill.current;
    const s = slots.current;
    if (p && s && pillInner.current) {
      p.style.width =
        status === "success"
          ? `${pillInner.current.offsetWidth}px`
          : `${s.offsetWidth}px`;
    }
  });

  /* ---------- Status ---------- */

  // After an error the wrong code fades out so the next try starts fresh.
  // The shake itself is pure CSS on data-error; this effect only schedules
  // async work, never synchronous setState.
  useEffect(() => {
    if (status !== "error" || !clearOnError) return;
    timers.current.push(
      window.setTimeout(() => setClearing(true), 700),
      window.setTimeout(() => {
        setClearing(false);
        commit("", 0, false);
      }, 980),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  /* ---------- Render ---------- */

  const cells: ReactNode[] = [];
  for (let i = 0; i < length; i++) {
    const ch = code[i];
    const arrival = pop[i];
    cells.push(
      <span
        key={i}
        ref={(el) => {
          boxes.current[i] = el;
        }}
        className="otp-box"
        data-filled={ch ? "" : undefined}
        style={{ "--otp-i": i } as CSSProperties}
        aria-hidden="true"
      >
        {ch && (
          <span
            key={arrival ? `${i}:${ch}:${arrival.count}` : i}
            className="otp-char"
            style={{ animationDelay: `${arrival?.delay ?? 0}ms` }}
          >
            {ch}
          </span>
        )}
      </span>,
    );
  }

  return (
    <div
      className="otp"
      data-status={status}
      data-error={showError || undefined}
      data-disabled={disabled || undefined}
    >
      <div
        ref={slots}
        className="otp-slots"
        dir="ltr"
        data-clearing={clearing || undefined}
        style={{ "--otp-active": active, "--otp-n": length } as CSSProperties}
      >
        {cells}
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
        <span ref={pill} className="otp-pill" aria-hidden="true">
          <span ref={pillInner} className="otp-pill-inner">
            <svg viewBox="0 0 24 24" className="otp-check" aria-hidden="true">
              <path d={CHECK_PATH} pathLength={1} />
            </svg>
            <span className="otp-pill-text" title={successLabel}>
              {successLabel}
            </span>
          </span>
        </span>
        <input
          ref={input}
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
          aria-invalid={showError || undefined}
          aria-describedby={showError ? `${fieldId}-msg` : undefined}
          disabled={disabled}
          readOnly={readOnly}
          data-testid={inputTestId}
          onChange={(e) => handleInput(e.currentTarget)}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPointerUp={(e) => pick(e.clientX)}
          onSelect={(e) => {
            // A native caret move (long press, mouse drag) snaps back to a
            // single box.
            const el = e.currentTarget;
            const want =
              active < code.length ? [active, active + 1] : [active, active];
            if (el.selectionStart !== want[0] || el.selectionEnd !== want[1]) {
              syncSelection();
            }
          }}
        />
      </div>

      {/* The error message slides in below and folds away once retyping
        starts. */}
      {errorMessage != null && (
        <div className="otp-msg" data-show={showError || undefined}>
          <div className="otp-msg-inner">
            <p
              id={`${fieldId}-msg`}
              role="alert"
              data-testid={errorTestId}
              className="otp-msg-text"
            >
              <svg viewBox="0 0 24 24" className="otp-alert" aria-hidden="true">
                <path d={ALERT_PATH} />
              </svg>
              <span>{errorMessage}</span>
            </p>
          </div>
        </div>
      )}

      {onResend && (
        <div
          className="otp-resend"
          data-hidden={status === "success" || undefined}
        >
          <span className="otp-resend-q">Didn&rsquo;t get a code?</span>{" "}
          {resendWait > 0 ? (
            <span key="wait" className="otp-swap otp-wait">
              Resend in{"\u00a0"}
              <span className="otp-time">{clock(resendWait)}</span>
            </span>
          ) : (
            <button
              key="go"
              type="button"
              data-testid={resendTestId}
              className="otp-swap otp-resend-btn"
              onClick={onResend}
              disabled={disabled || resendDisabled || busy}
            >
              {resendDisabled ? "Sending…" : "Resend code"}
            </button>
          )}
        </div>
      )}

      <span className="otp-live" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}
