/**
 * Outbound mail account: the default sending account for notifications.
 *
 * Effective config resolves as: account saved in Settings (on disk) wins,
 * else the SMTP_* env vars, else unconfigured (dev console fallback).
 * Node-only (reads the data dir): never import from `middleware.ts`
 * (Edge) or client components.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAuthDataDir } from "./auth-bootstrap";

export const MAIL_CONFIG_FILE_NAME = "mail.json";

export type MailSecurity = "auto" | "ssl" | "starttls";
export const MAIL_SECURITY_OPTIONS: readonly MailSecurity[] = [
  "auto",
  "ssl",
  "starttls",
];

/** Sending account as saved in Settings. Password may be "" (no auth). */
export interface StoredMailAccount {
  host: string;
  port: number;
  security: MailSecurity;
  user: string;
  pass: string;
  from: string;
}

export type MailAccountSource = "settings" | "env" | "none";

export interface EffectiveMailAccount {
  host: string;
  port: number;
  security: MailSecurity;
  user: string;
  pass: string;
  from: string;
  source: Exclude<MailAccountSource, "none">;
}

/** Public status for the Settings UI: never carries the password. */
export interface MailAccountStatus {
  configured: boolean;
  source: MailAccountSource;
  host: string;
  port: number;
  security: MailSecurity;
  user: string;
  from: string;
  hasPassword: boolean;
}

export const DEFAULT_SMTP_PORT = 587;
export const DEFAULT_FROM = "BYOV <no-reply@byov.local>";

export function getMailConfigFilePath(): string {
  return join(getAuthDataDir(), MAIL_CONFIG_FILE_NAME);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSecurity(value: unknown): value is MailSecurity {
  return (
    value === "auto" || value === "ssl" || value === "starttls"
  );
}

/** Saved Settings account, or null when never saved or corrupt. */
export function getStoredMailAccount(): StoredMailAccount | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(getMailConfigFilePath(), "utf8"));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  const { host, port, security, user, pass, from } = parsed;
  if (
    typeof host !== "string" ||
    !host.trim() ||
    typeof port !== "number" ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !isSecurity(security) ||
    typeof user !== "string" ||
    typeof pass !== "string" ||
    typeof from !== "string"
  ) {
    return null;
  }
  return {
    host: host.trim(),
    port,
    security,
    user: user.trim(),
    pass,
    from: from.trim(),
  };
}

export function saveStoredMailAccount(account: StoredMailAccount): void {
  const path = getMailConfigFilePath();
  mkdirSync(getAuthDataDir(), { recursive: true });
  // Owner-only on creation, like a credentials file (same trust as .env).
  writeFileSync(path, `${JSON.stringify(account)}\n`, { mode: 0o600 });
}

export function clearStoredMailAccount(): void {
  rmSync(getMailConfigFilePath(), { force: true });
}

function envPort(): number {
  const parsed = Number.parseInt(process.env.SMTP_PORT ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 65535
    ? parsed
    : DEFAULT_SMTP_PORT;
}

/**
 * Effective sending account: Settings-saved wins when it names a host,
 * else SMTP_* env when SMTP_HOST is set, else null.
 */
export function getEffectiveMailAccount(): EffectiveMailAccount | null {
  const stored = getStoredMailAccount();
  if (stored) {
    return { ...stored, source: "settings" };
  }
  const host = (process.env.SMTP_HOST ?? "").trim();
  if (!host) {
    return null;
  }
  return {
    host,
    port: envPort(),
    security: "auto",
    user: (process.env.SMTP_USER ?? "").trim(),
    pass: process.env.SMTP_PASS ?? "",
    from: (process.env.SMTP_FROM ?? "").trim() || DEFAULT_FROM,
    source: "env",
  };
}

export function getMailAccountStatus(): MailAccountStatus {
  const effective = getEffectiveMailAccount();
  if (!effective) {
    return {
      configured: false,
      source: "none",
      host: "",
      port: DEFAULT_SMTP_PORT,
      security: "auto",
      user: "",
      from: DEFAULT_FROM,
      hasPassword: false,
    };
  }
  return {
    configured: true,
    source: effective.source,
    host: effective.host,
    port: effective.port,
    security: effective.security,
    user: effective.user,
    from: effective.from || DEFAULT_FROM,
    hasPassword: effective.pass.length > 0,
  };
}

export type MailAccountField =
  | "host"
  | "port"
  | "security"
  | "user"
  | "pass"
  | "from";
export type MailAccountFieldErrors = Partial<Record<MailAccountField, string>>;

/** Validate a Settings form draft. Empty password means no SMTP auth. */
export function validateMailAccount(draft: {
  host: string;
  port: number;
  security: string;
  user: string;
  pass: string;
  from: string;
}): MailAccountFieldErrors {
  const errors: MailAccountFieldErrors = {};
  const host = draft.host.trim();
  if (!host) {
    errors.host = "Enter the SMTP host, e.g. smtp.example.com.";
  } else if (host.length > 253 || /[\s/]/.test(host)) {
    errors.host = "Enter a plain hostname or IP, without scheme or path.";
  }
  if (
    typeof draft.port !== "number" ||
    !Number.isInteger(draft.port) ||
    draft.port < 1 ||
    draft.port > 65535
  ) {
    errors.port = "Enter a port from 1 to 65535.";
  }
  if (!isSecurity(draft.security)) {
    errors.security = "Choose Auto, SSL, or STARTTLS.";
  }
  const user = draft.user.trim();
  if (user.length > 320) {
    errors.user = "Keep the username under 320 characters.";
  }
  if (draft.pass.length > 1000) {
    errors.pass = "Keep the password under 1000 characters.";
  }
  const from = draft.from.trim();
  if (from && !isFromAddress(from)) {
    errors.from = "Enter an address like alerts@example.com.";
  }
  return errors;
}

function isFromAddress(value: string): boolean {
  if (value.length > 320) {
    return false;
  }
  const angle = value.match(/^(.+)<([^<>]+)>$/);
  const address = (angle?.[2] ?? value).trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
}
