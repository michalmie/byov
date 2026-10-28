// Pure user-list logic: invites, role changes, removal guards and the
// shape checks for browser-persisted users. No DOM access here so every
// rule stays unit-testable; lib/users-store.ts owns the hook. This list
// mirrors workspace membership until the API lands; the last admin can
// never be removed or demoted.

import { isValidEmail } from "./auth-settings";

export const USERS_STORAGE_KEY = "byov:users:v1";

export type UserRole = "admin" | "member";

/** Sign-in methods, matching the shared auth contract ids. */
export const AUTH_METHOD_IDS = [
  "passwordless",
  "magic-link",
  "entra",
  "github",
  "google",
  "apple",
] as const;
export type AuthMethodId = (typeof AUTH_METHOD_IDS)[number];

export const AUTH_METHOD_LABELS: Record<AuthMethodId, string> = {
  passwordless: "Passwordless code",
  "magic-link": "Email sign-in link",
  entra: "Microsoft Entra ID",
  github: "GitHub",
  google: "Google",
  apple: "Apple",
};

export function authMethodLabel(provider: string): string {
  return (AUTH_METHOD_LABELS as Record<string, string>)[provider] ?? provider;
}

export interface User {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
  provider?: string;
  lastLogin?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUserRole(value: unknown): value is UserRole {
  return value === "admin" || value === "member";
}

/** Build a collision-free id over the existing users. */
export function uniqueUserId(existing: readonly User[]): string {
  let id = "";
  do {
    id = `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  } while (existing.some((user) => user.id === id));
  return id;
}

export type InviteUserResult =
  | { ok: true; users: User[]; user: User }
  | { ok: false; error: string };

/**
 * Invite a user by email. Addresses compare case-insensitively, so
 * Ada@Example.com and ada@example.com are the same invite.
 */
export function inviteUser(
  users: readonly User[],
  email: string,
  role: UserRole,
): InviteUserResult {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return { ok: false, error: "Enter an email address to invite." };
  }
  if (!isValidEmail(normalized)) {
    return { ok: false, error: `"${email.trim()}" is not a valid email address.` };
  }
  if (!isUserRole(role)) {
    return { ok: false, error: "Choose a role: admin or member." };
  }
  const taken = users.some(
    (user) => user.email.trim().toLowerCase() === normalized,
  );
  if (taken) {
    return { ok: false, error: `${normalized} is already on the list.` };
  }
  const user: User = { id: uniqueUserId(users), email: normalized, role };
  return { ok: true, users: [...users, user], user };
}

export type MutateUsersResult =
  | { ok: true; users: User[] }
  | { ok: false; error: string };

function adminCount(users: readonly User[]): number {
  return users.filter((user) => user.role === "admin").length;
}

/** Remove a user unless they are the last admin. */
export function removeUser(
  users: readonly User[],
  id: string,
): MutateUsersResult {
  const target = users.find((user) => user.id === id);
  if (!target) {
    return { ok: false, error: "User not found." };
  }
  if (target.role === "admin" && adminCount(users) <= 1) {
    return { ok: false, error: "Cannot remove the last admin." };
  }
  return { ok: true, users: users.filter((user) => user.id !== id) };
}

/** Change a role unless it demotes the last admin. */
export function setUserRole(
  users: readonly User[],
  id: string,
  role: UserRole,
): MutateUsersResult {
  const target = users.find((user) => user.id === id);
  if (!target) {
    return { ok: false, error: "User not found." };
  }
  if (!isUserRole(role)) {
    return { ok: false, error: "Choose a role: admin or member." };
  }
  if (target.role === "admin" && role !== "admin" && adminCount(users) <= 1) {
    return { ok: false, error: "Cannot demote the last admin." };
  }
  return {
    ok: true,
    users: users.map((user) =>
      user.id === id ? { ...user, role } : user,
    ),
  };
}

/**
 * Parse a stored user list; corrupt entries are dropped and anything
 * non-array reads as an empty list.
 */
export function parseStoredUsers(value: unknown): User[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const users: User[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    const { id, email, name, role, provider, lastLogin } = entry;
    if (
      typeof id !== "string" ||
      !id ||
      typeof email !== "string" ||
      !isValidEmail(email) ||
      !isUserRole(role)
    ) {
      continue;
    }
    users.push({
      id,
      email: email.trim().toLowerCase(),
      ...(typeof name === "string" && name.trim() ? { name: name.trim() } : {}),
      role,
      ...(typeof provider === "string" && provider ? { provider } : {}),
      ...(typeof lastLogin === "string" && lastLogin ? { lastLogin } : {}),
    });
  }
  return users;
}
