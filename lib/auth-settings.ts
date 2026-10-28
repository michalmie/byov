// Pure auth-settings logic: workspace sign-in preferences, access-list
// validation and the shape checks for browser-persisted settings. No DOM
// access here so every rule stays unit-testable;
// lib/auth-settings-store.ts owns the hook. These preferences mirror the
// server configuration (see the auth contract) but do not enforce it:
// enforcement follows server configuration until the API lands.

import { MAX_ZONE_LENGTH, isDomainZone } from "./dev-urls";

export const AUTH_SETTINGS_STORAGE_KEY = "byov:auth-settings:v1";

/** OAuth providers, matching the shared auth contract ids. */
export const AUTH_PROVIDERS = ["entra", "github", "google", "apple"] as const;
export type OAuthProviderId = (typeof AUTH_PROVIDERS)[number];

/** Display label plus the server env flag each toggle mirrors. */
export const AUTH_PROVIDER_META: Record<
  OAuthProviderId,
  { label: string; envFlag: string }
> = {
  entra: { label: "Microsoft Entra ID", envFlag: "AUTH_ENTRA_ENABLED" },
  github: { label: "GitHub", envFlag: "AUTH_GITHUB_ENABLED" },
  google: { label: "Google", envFlag: "AUTH_GOOGLE_ENABLED" },
  apple: { label: "Apple", envFlag: "AUTH_APPLE_ENABLED" },
};

export const PASSWORDLESS_ENV_FLAG = "AUTH_PASSWORDLESS_ENABLED";
export const MAGIC_LINK_ENV_FLAG = "AUTH_MAGIC_LINK_ENABLED";
export const ALLOWED_EMAILS_ENV = "AUTH_ALLOWED_EMAILS";
export const ALLOWED_DOMAINS_ENV = "AUTH_ALLOWED_DOMAINS";
export const ADMIN_EMAILS_ENV = "AUTH_ADMIN_EMAILS";

/** Shared helper line: preferences here, enforcement on the server. */
export const ENFORCEMENT_NOTE =
  "Workspace preference — enforcement follows server configuration until the API lands.";

export const MAX_EMAIL_LENGTH = 200;
export const MIN_SESSION_LIFETIME_HOURS = 1;
export const MAX_SESSION_LIFETIME_HOURS = 720;

export interface AuthSettings {
  passwordlessEnabled: boolean;
  magicLinkEnabled: boolean;
  providers: Record<OAuthProviderId, boolean>;
  /** Raw comma-separated lists, as typed. */
  allowedEmails: string;
  allowedDomains: string;
  adminEmails: string;
  sessionLifetimeHours: number;
}

export function defaultAuthSettings(): AuthSettings {
  return {
    passwordlessEnabled: true,
    magicLinkEnabled: true,
    providers: { entra: false, github: false, google: false, apple: false },
    allowedEmails: "",
    allowedDomains: "",
    adminEmails: "",
    sessionLifetimeHours: 12,
  };
}

export type AuthSettingsField =
  | "passwordlessEnabled"
  | "magicLinkEnabled"
  | "providers"
  | "allowedEmails"
  | "allowedDomains"
  | "adminEmails"
  | "sessionLifetimeHours";
export type AuthSettingsFieldErrors = Partial<
  Record<AuthSettingsField, string>
>;

/** Split a raw comma list into trimmed, non-empty entries. */
export function splitList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True for a plausibly deliverable address (single @, dotted domain). */
export function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_EMAIL_LENGTH) {
    return false;
  }
  return EMAIL_PATTERN.test(trimmed);
}

function emailListError(value: string, what: string): string | null {
  for (const entry of splitList(value)) {
    if (entry.length > MAX_EMAIL_LENGTH) {
      return `Keep each ${what} under ${MAX_EMAIL_LENGTH} characters.`;
    }
    if (!EMAIL_PATTERN.test(entry)) {
      return `"${entry}" is not a valid email address.`;
    }
  }
  return null;
}

function domainListError(value: string): string | null {
  for (const entry of splitList(value)) {
    if (entry.length > MAX_ZONE_LENGTH) {
      return `Keep each domain under ${MAX_ZONE_LENGTH} characters.`;
    }
    if (entry.startsWith("*.")) {
      return "Enter zones without the *. prefix, e.g. example.com.";
    }
    if (!isDomainZone(entry)) {
      return `"${entry}" is not a zone like example.com (no scheme, at least two labels).`;
    }
  }
  return null;
}

export function validateAuthSettings(
  draft: AuthSettings,
): AuthSettingsFieldErrors {
  const errors: AuthSettingsFieldErrors = {};
  const emails = emailListError(draft.allowedEmails, "email");
  if (emails) {
    errors.allowedEmails = emails;
  }
  const domains = domainListError(draft.allowedDomains);
  if (domains) {
    errors.allowedDomains = domains;
  }
  const admins = emailListError(draft.adminEmails, "admin email");
  if (admins) {
    errors.adminEmails = admins;
  }
  const lifetime = draft.sessionLifetimeHours;
  if (
    typeof lifetime !== "number" ||
    !Number.isInteger(lifetime) ||
    lifetime < MIN_SESSION_LIFETIME_HOURS ||
    lifetime > MAX_SESSION_LIFETIME_HOURS
  ) {
    errors.sessionLifetimeHours = `Enter a whole number of hours from ${MIN_SESSION_LIFETIME_HOURS} to ${MAX_SESSION_LIFETIME_HOURS}.`;
  }
  return errors;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Normalize one comma list for storage: trimmed entries, raw order kept. */
export function normalizeList(value: string): string {
  return splitList(value).join(", ");
}

/**
 * Parse stored auth settings with per-field fallback: every field that is
 * missing or misshapen falls back to its default, so a corrupt entry can
 * never break the form.
 */
export function parseStoredAuthSettings(value: unknown): AuthSettings {
  const defaults = defaultAuthSettings();
  if (!isRecord(value)) {
    return defaults;
  }
  const providers: Record<OAuthProviderId, boolean> = {
    ...defaults.providers,
  };
  if (isRecord(value.providers)) {
    for (const id of AUTH_PROVIDERS) {
      if (typeof value.providers[id] === "boolean") {
        providers[id] = value.providers[id];
      }
    }
  }
  const lifetime = value.sessionLifetimeHours;
  return {
    passwordlessEnabled:
      typeof value.passwordlessEnabled === "boolean"
        ? value.passwordlessEnabled
        : defaults.passwordlessEnabled,
    magicLinkEnabled:
      typeof value.magicLinkEnabled === "boolean"
        ? value.magicLinkEnabled
        : defaults.magicLinkEnabled,
    providers,
    allowedEmails:
      typeof value.allowedEmails === "string"
        ? value.allowedEmails
        : defaults.allowedEmails,
    allowedDomains:
      typeof value.allowedDomains === "string"
        ? value.allowedDomains
        : defaults.allowedDomains,
    adminEmails:
      typeof value.adminEmails === "string"
        ? value.adminEmails
        : defaults.adminEmails,
    sessionLifetimeHours:
      typeof lifetime === "number" &&
      Number.isInteger(lifetime) &&
      lifetime >= MIN_SESSION_LIFETIME_HOURS &&
      lifetime <= MAX_SESSION_LIFETIME_HOURS
        ? lifetime
        : defaults.sessionLifetimeHours,
  };
}
