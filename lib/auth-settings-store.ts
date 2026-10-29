// Client hook for workspace auth settings. State starts from the defaults
// (matching the server render), hydrates from the workspace API after
// mount — with localStorage as the offline cache — and stays in sync
// across components and tabs. When the API is unreachable or the session
// is not an admin (tests, offline, signed out), the cache and defaults
// stand in and every mutation still resolves synchronously.

import { useCallback, useEffect, useState } from "react";
import {
  AUTH_SETTINGS_STORAGE_KEY,
  defaultAuthSettings,
  normalizeList,
  parseStoredAuthSettings,
  validateAuthSettings,
} from "./auth-settings";
import type {
  AuthSettings,
  AuthSettingsFieldErrors,
} from "./auth-settings";

export const AUTH_SETTINGS_EVENT = "byov:auth-settings-changed";

const AUTH_SETTINGS_URL = "/api/workspace/auth-settings";

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

function readStored(): AuthSettings | undefined {
  try {
    if (typeof window === "undefined") {
      return undefined;
    }
    const raw = window.localStorage.getItem(AUTH_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return undefined;
    }
    return parseStoredAuthSettings(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

function cacheSettings(next: AuthSettings): void {
  try {
    window.localStorage.setItem(
      AUTH_SETTINGS_STORAGE_KEY,
      JSON.stringify(next),
    );
  } catch {
    // Private mode etc. — in-memory state still works for the session.
  }
}

/** Push stored settings, then same-tab and cross-tab updates, to onChange. */
function subscribeAuthSettings(
  onChange: (settings: AuthSettings) => void,
): () => void {
  const stored = readStored();
  if (stored) {
    onChange(stored);
  }
  const onCustom = (event: Event) => {
    onChange((event as CustomEvent<AuthSettings>).detail);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== AUTH_SETTINGS_STORAGE_KEY) {
      return;
    }
    if (!event.newValue) {
      onChange(defaultAuthSettings());
      return;
    }
    try {
      onChange(parseStoredAuthSettings(JSON.parse(event.newValue)));
    } catch {
      onChange(defaultAuthSettings());
    }
  };
  window.addEventListener(AUTH_SETTINGS_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(AUTH_SETTINGS_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

export function useAuthSettings() {
  const [settings, setSettings] = useState<AuthSettings>(() =>
    defaultAuthSettings(),
  );

  useEffect(() => subscribeAuthSettings(setSettings), []);

  // Fetch-first hydration: server settings replace the cache when
  // reachable; any failure keeps the cache/defaults untouched.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await fetchJson<unknown>(AUTH_SETTINGS_URL);
      if (cancelled || data === undefined) {
        return;
      }
      const server = parseStoredAuthSettings(data);
      if (cancelled) {
        return;
      }
      setSettings(server);
      cacheSettings(server);
      window.dispatchEvent(
        new CustomEvent<AuthSettings>(AUTH_SETTINGS_EVENT, {
          detail: server,
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Re-read the server settings; failures keep the current state. */
  const refreshSettings = useCallback(() => {
    void (async () => {
      const data = await fetchJson<unknown>(AUTH_SETTINGS_URL);
      if (data === undefined) {
        return;
      }
      const server = parseStoredAuthSettings(data);
      setSettings(server);
      cacheSettings(server);
      window.dispatchEvent(
        new CustomEvent<AuthSettings>(AUTH_SETTINGS_EVENT, {
          detail: server,
        }),
      );
    })();
  }, []);

  /** Validate and save; returns field errors or null on success. */
  const saveAuthSettings = useCallback(
    (draft: AuthSettings): AuthSettingsFieldErrors | null => {
      const errors = validateAuthSettings(draft);
      if (Object.keys(errors).length > 0) {
        return errors;
      }
      const next: AuthSettings = {
        passwordlessEnabled: draft.passwordlessEnabled,
        magicLinkEnabled: draft.magicLinkEnabled,
        providers: { ...draft.providers },
        allowedEmails: normalizeList(draft.allowedEmails),
        allowedDomains: normalizeList(draft.allowedDomains).toLowerCase(),
        adminEmails: normalizeList(draft.adminEmails),
        sessionLifetimeHours: draft.sessionLifetimeHours,
      };
      setSettings(next);
      cacheSettings(next);
      window.dispatchEvent(
        new CustomEvent<AuthSettings>(AUTH_SETTINGS_EVENT, { detail: next }),
      );
      void (async () => {
        await mutateJson(AUTH_SETTINGS_URL, "PUT", next);
        refreshSettings();
      })();
      return null;
    },
    [refreshSettings],
  );

  const resetAuthSettings = useCallback(() => {
    const defaults = defaultAuthSettings();
    setSettings(defaults);
    try {
      window.localStorage.removeItem(AUTH_SETTINGS_STORAGE_KEY);
    } catch {
      // Ignore; in-memory state is already back to defaults.
    }
    window.dispatchEvent(
      new CustomEvent<AuthSettings>(AUTH_SETTINGS_EVENT, { detail: defaults }),
    );
    // Best-effort server reset so the defaults stick across reloads.
    void mutateJson(AUTH_SETTINGS_URL, "PUT", defaults);
  }, []);

  return { settings, saveAuthSettings, resetAuthSettings };
}
