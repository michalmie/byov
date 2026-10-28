// Client hook for the current auth session. Fetches the session once on
// mount and exposes the signed-in user plus a logout that always lands on
// the login page.

import { useCallback, useEffect, useState } from "react";
import type { AuthUser } from "./auth";

export interface UseSessionResult {
  user: AuthUser | null;
  loading: boolean;
  logout: () => Promise<void>;
}

export function useSession(): UseSessionResult {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/auth/session");
        if (!response.ok) {
          if (!cancelled) {
            setUser(null);
          }
          return;
        }
        const data = (await response.json()) as { user: AuthUser | null };
        if (!cancelled) {
          setUser(data.user ?? null);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
    } catch {
      // The session cookie may already be gone; redirect regardless.
    } finally {
      window.location.assign("/login");
    }
  }, []);

  return { user, loading, logout };
}
