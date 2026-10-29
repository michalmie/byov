/**
 * First-login admin bootstrap: the first user to sign in after install
 * becomes admin, unless admins are already configured via AUTH_ADMIN_EMAILS.
 *
 * The claim is a single row in the `auth_bootstrap` table (atomic
 * `INSERT ... ON CONFLICT DO NOTHING`, so concurrent first logins elect
 * exactly one admin). Node-only: never import this module from
 * `middleware.ts` (Edge) or client components — only the login routes
 * call `resolveLoginRole`.
 */

import "../db/migrations/0002_auth_mail";
import { queryOne } from "./db";
import {
  getAdminEmails,
  isAdminEmail,
  resolveRole,
  type UserRole,
} from "./auth";

/** Email holding the bootstrap claim, or null when unclaimed/unreadable. */
export async function getBootstrapEmail(): Promise<string | null> {
  let row: { admin_email: unknown } | null;
  try {
    row = await queryOne<{ admin_email: unknown }>(
      "SELECT admin_email FROM auth_bootstrap WHERE id = 1",
    );
  } catch {
    return null;
  }
  if (!row) {
    return null;
  }
  const email = row.admin_email;
  if (typeof email !== "string" || !email.includes("@")) {
    return null;
  }
  return email.trim().toLowerCase();
}

/**
 * Role for a verified login: configured admins first, then the bootstrap
 * holder; when neither exists anywhere, this login claims the bootstrap
 * and becomes admin. Fails closed (member) when the record is unwritable.
 */
export async function resolveLoginRole(email: string): Promise<UserRole> {
  const normalized = email.trim().toLowerCase();
  const adminEmails = getAdminEmails();
  if (isAdminEmail(normalized, adminEmails)) {
    return "admin";
  }
  const bootstrap = await getBootstrapEmail();
  if (bootstrap) {
    return resolveRole(normalized, { adminEmails, bootstrapEmail: bootstrap });
  }
  if (adminEmails.length > 0) {
    return "member";
  }
  try {
    const claimed = await queryOne<{ admin_email: string }>(
      "INSERT INTO auth_bootstrap (id, admin_email) VALUES (1, $1) " +
        "ON CONFLICT (id) DO NOTHING RETURNING admin_email",
      [normalized],
    );
    if (claimed) {
      return "admin";
    }
    return resolveRole(normalized, {
      adminEmails,
      bootstrapEmail: await getBootstrapEmail(),
    });
  } catch {
    console.error(
      "[auth] Could not write the bootstrap admin record; signing in as member.",
    );
    return "member";
  }
}
