/**
 * Outbound mail account: the default sending account for notifications.
 *
 * Effective config resolves as: account saved in Settings (a single row
 * in the `mail_account` table) wins, else the SMTP_* env vars, else
 * unconfigured (dev console fallback). Node-only (uses the database):
 * never import from `middleware.ts` (Edge) or client components.
 */

import "../db/migrations/0002_auth_mail";
import { query, queryOne } from "./db";

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

function isSecurity(value: unknown): value is MailSecurity {
  return (
    value === "auto" || value === "ssl" || value === "starttls"
  );
}

interface MailAccountRow {
  host: unknown;
  port: unknown;
  security: unknown;
  username: unknown;
  pass: unknown;
  from_address: unknown;
}

/** Saved Settings account, or null when never saved or corrupt. */
export async function getStoredMailAccount(): Promise<StoredMailAccount | null> {
  const row = await queryOne<MailAccountRow>(
    "SELECT host, port, security, username, pass, from_address FROM mail_account WHERE id = 1",
  );
  if (!row) {
    return null;
  }
  const { host, port, security, username: user, pass, from_address: from } = row;
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

export async function saveStoredMailAccount(
  account: StoredMailAccount,
): Promise<void> {
  await query(
    "INSERT INTO mail_account (id, host, port, security, username, pass, from_address) VALUES (1, $1, $2, $3, $4, $5, $6) " +
      "ON CONFLICT (id) DO UPDATE SET host = EXCLUDED.host, port = EXCLUDED.port, " +
      "security = EXCLUDED.security, username = EXCLUDED.username, pass = EXCLUDED.pass, from_address = EXCLUDED.from_address",
    [
      account.host,
      account.port,
      account.security,
      account.user,
      account.pass,
      account.from,
    ],
  );
}

export async function clearStoredMailAccount(): Promise<void> {
  await query("DELETE FROM mail_account WHERE id = 1");
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
export async function getEffectiveMailAccount(): Promise<EffectiveMailAccount | null> {
  const stored = await getStoredMailAccount();
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

export async function getMailAccountStatus(): Promise<MailAccountStatus> {
  const effective = await getEffectiveMailAccount();
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
