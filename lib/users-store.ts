// Client hook for the workspace user list. State starts empty (matching
// the server render), hydrates from localStorage after mount, and stays
// in sync across components and tabs.

import { useCallback, useEffect, useState } from "react";
import {
  USERS_STORAGE_KEY,
  inviteUser,
  parseStoredUsers,
  removeUser,
  setUserRole,
} from "./users";
import type { User, UserRole } from "./users";

export const USERS_EVENT = "byov:users-changed";

function readStored(): User[] | undefined {
  try {
    if (typeof window === "undefined") {
      return undefined;
    }
    const raw = window.localStorage.getItem(USERS_STORAGE_KEY);
    if (!raw) {
      return undefined;
    }
    return parseStoredUsers(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

/** Push stored users, then same-tab and cross-tab updates, to onChange. */
function subscribeUsers(onChange: (users: User[]) => void): () => void {
  const stored = readStored();
  if (stored) {
    onChange(stored);
  }
  const onCustom = (event: Event) => {
    onChange((event as CustomEvent<User[]>).detail);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== USERS_STORAGE_KEY) {
      return;
    }
    if (!event.newValue) {
      onChange([]);
      return;
    }
    try {
      onChange(parseStoredUsers(JSON.parse(event.newValue)));
    } catch {
      onChange([]);
    }
  };
  window.addEventListener(USERS_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(USERS_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => subscribeUsers(setUsers), []);

  const persist = useCallback((next: User[]) => {
    setUsers(next);
    try {
      window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private mode etc. — in-memory state still works for the session.
    }
    window.dispatchEvent(new CustomEvent<User[]>(USERS_EVENT, { detail: next }));
  }, []);

  /** Invite by email; returns the blocking reason or null on success. */
  const invite = useCallback(
    (email: string, role: UserRole): string | null => {
      const result = inviteUser(users, email, role);
      if (!result.ok) {
        return result.error;
      }
      persist(result.users);
      return null;
    },
    [users, persist],
  );

  /** Change a role; returns the blocking reason or null on success. */
  const changeRole = useCallback(
    (id: string, role: UserRole): string | null => {
      const result = setUserRole(users, id, role);
      if (!result.ok) {
        return result.error;
      }
      persist(result.users);
      return null;
    },
    [users, persist],
  );

  /** Remove a user; returns the blocking reason or null on success. */
  const remove = useCallback(
    (id: string): string | null => {
      const result = removeUser(users, id);
      if (!result.ok) {
        return result.error;
      }
      persist(result.users);
      return null;
    },
    [users, persist],
  );

  const resetUsers = useCallback(() => {
    setUsers([]);
    try {
      window.localStorage.removeItem(USERS_STORAGE_KEY);
    } catch {
      // Ignore; in-memory state is already back to empty.
    }
    window.dispatchEvent(new CustomEvent<User[]>(USERS_EVENT, { detail: [] }));
  }, []);

  return { users, invite, changeRole, remove, resetUsers };
}
