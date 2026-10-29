// Client hook for the workspace user list. State starts empty (matching
// the server render), hydrates from the workspace API after mount — with
// localStorage as the offline cache — and stays in sync across
// components and tabs. When the API is unreachable or the session is not
// an admin (tests, offline, signed out), the cache stands in and every
// mutation still resolves synchronously.

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

const USERS_URL = "/api/workspace/users";

/** GET an API envelope's data; undefined on any failure (offline, 401…). */
async function fetchJson<T>(url: string): Promise<T | undefined> {
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      return undefined;
    }
    const body = (await response.json()) as { ok?: unknown; data?: T };
    if (!body || body.ok !== true || !("data" in body)) {
      return undefined;
    }
    return body.data;
  } catch {
    return undefined;
  }
}

/** Send a mutation; undefined on any failure. Never throws. */
async function mutateJson<T>(
  url: string,
  method: string,
  payload?: unknown,
): Promise<T | undefined> {
  try {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    if (!response.ok) {
      return undefined;
    }
    const body = (await response.json()) as { ok?: unknown; data?: T };
    if (!body || body.ok !== true) {
      return undefined;
    }
    return body.data;
  } catch {
    return undefined;
  }
}

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

function cacheUsers(next: User[]): void {
  try {
    window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode etc. — in-memory state still works for the session.
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

  // Fetch-first hydration: the server list replaces the cache when
  // reachable; any failure keeps the cached list untouched.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await fetchJson<unknown>(USERS_URL);
      if (cancelled || data === undefined) {
        return;
      }
      const server = parseStoredUsers(data);
      if (cancelled) {
        return;
      }
      setUsers(server);
      cacheUsers(server);
      window.dispatchEvent(
        new CustomEvent<User[]>(USERS_EVENT, { detail: server }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Re-read the server list; failures keep the current state. */
  const refreshUsers = useCallback(() => {
    void (async () => {
      const data = await fetchJson<unknown>(USERS_URL);
      if (data === undefined) {
        return;
      }
      const server = parseStoredUsers(data);
      setUsers(server);
      cacheUsers(server);
      window.dispatchEvent(
        new CustomEvent<User[]>(USERS_EVENT, { detail: server }),
      );
    })();
  }, []);

  const persist = useCallback((next: User[]) => {
    setUsers(next);
    cacheUsers(next);
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
      void (async () => {
        await mutateJson(USERS_URL, "POST", { email, role });
        refreshUsers();
      })();
      return null;
    },
    [users, persist, refreshUsers],
  );

  /** Change a role; returns the blocking reason or null on success. */
  const changeRole = useCallback(
    (id: string, role: UserRole): string | null => {
      const result = setUserRole(users, id, role);
      if (!result.ok) {
        return result.error;
      }
      persist(result.users);
      void (async () => {
        await mutateJson(`${USERS_URL}/${encodeURIComponent(id)}`, "PATCH", {
          role,
        });
        refreshUsers();
      })();
      return null;
    },
    [users, persist, refreshUsers],
  );

  /** Remove a user; returns the blocking reason or null on success. */
  const remove = useCallback(
    (id: string): string | null => {
      const result = removeUser(users, id);
      if (!result.ok) {
        return result.error;
      }
      persist(result.users);
      void (async () => {
        await mutateJson(`${USERS_URL}/${encodeURIComponent(id)}`, "DELETE");
        refreshUsers();
      })();
      return null;
    },
    [users, persist, refreshUsers],
  );

  const resetUsers = useCallback(() => {
    const stale = users;
    setUsers([]);
    try {
      window.localStorage.removeItem(USERS_STORAGE_KEY);
    } catch {
      // Ignore; in-memory state is already back to empty.
    }
    window.dispatchEvent(new CustomEvent<User[]>(USERS_EVENT, { detail: [] }));
    // Best-effort server reset so the empty list sticks across reloads.
    void Promise.allSettled(
      stale.map((user) =>
        mutateJson(`${USERS_URL}/${encodeURIComponent(user.id)}`, "DELETE"),
      ),
    );
  }, [users]);

  return { users, invite, changeRole, remove, resetUsers };
}
