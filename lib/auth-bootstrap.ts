/**
 * First-login admin bootstrap: the first user to sign in after install
 * becomes admin, unless admins are already configured via AUTH_ADMIN_EMAILS.
 *
 * The claim is a small JSON record on disk (atomic exclusive create, so
 * concurrent first logins elect exactly one admin). Node-only: never import
 * this module from `middleware.ts` (Edge) or client components — only the
 * login routes call `resolveLoginRole`.
 *
 * On ephemeral filesystems (serverless) the record does not persist across
 * instances; there, designate admins with AUTH_ADMIN_EMAILS instead.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  getAdminEmails,
  isAdminEmail,
  resolveRole,
  type UserRole,
} from "./auth";

export const BOOTSTRAP_FILE_NAME = "byov-bootstrap.json";

/** Writable data dir: AUTH_DATA_DIR wins, else `<cwd>/data` (gitignored). */
export function getAuthDataDir(): string {
  const configured = (process.env.AUTH_DATA_DIR ?? "").trim();
  if (configured) {
    return configured;
  }
  return join(process.cwd(), "data");
}

export function getBootstrapFilePath(): string {
  return join(getAuthDataDir(), BOOTSTRAP_FILE_NAME);
}

/** Email holding the bootstrap claim, or null when unclaimed/unreadable. */
export function getBootstrapEmail(): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(getBootstrapFilePath(), "utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const email = (parsed as { adminEmail?: unknown }).adminEmail;
  if (typeof email !== "string" || !email.includes("@")) {
    return null;
  }
  return email.trim().toLowerCase();
}

type ClaimResult = "claimed" | "exists" | "failed";

/** Atomically claim the bootstrap record for an email. */
function tryClaimBootstrapFile(email: string): ClaimResult {
  const path = getBootstrapFilePath();
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      `${JSON.stringify({ adminEmail: email, claimedAt: new Date().toISOString() })}\n`,
      { flag: "wx" },
    );
    return "claimed";
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "EEXIST") {
      return "exists";
    }
    return "failed";
  }
}

/**
 * Role for a verified login: configured admins first, then the bootstrap
 * holder; when neither exists anywhere, this login claims the bootstrap
 * and becomes admin. Fails closed (member) when the record is unwritable.
 */
export function resolveLoginRole(email: string): UserRole {
  const normalized = email.trim().toLowerCase();
  const adminEmails = getAdminEmails();
  if (isAdminEmail(normalized, adminEmails)) {
    return "admin";
  }
  const bootstrap = getBootstrapEmail();
  if (bootstrap) {
    return resolveRole(normalized, { adminEmails, bootstrapEmail: bootstrap });
  }
  if (adminEmails.length > 0) {
    return "member";
  }
  const claim = tryClaimBootstrapFile(normalized);
  if (claim === "claimed") {
    return "admin";
  }
  if (claim === "exists") {
    return resolveRole(normalized, {
      adminEmails,
      bootstrapEmail: getBootstrapEmail(),
    });
  }
  console.error(
    "[auth] Could not write the bootstrap admin record; signing in as member.",
  );
  return "member";
}
