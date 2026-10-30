// Client hook for workspace source-control settings. State starts from
// the defaults (matching the server render), hydrates from the
// workspace API after mount — with localStorage as the offline cache —
// and stays in sync across components and tabs. When the API is
// unreachable or the session is not an admin (tests, offline, signed
// out), the cache and defaults stand in and every mutation still
// resolves synchronously.

import { useCallback, useEffect, useState } from "react";
import {
  SOURCE_CONTROL_STORAGE_KEY,
  defaultSourceControlSettings,
  normalizeSourceControlSettings,
  parseStoredSourceControlSettings,
  validateSourceControlSettings,
} from "./source-control";
import type {
  SourceControlFieldErrors,
  SourceControlSettings,
} from "./source-control";

export const SOURCE_CONTROL_EVENT = "byov:source-control-changed";

const SOURCE_CONTROL_URL = "/api/workspace/source-control";

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

function readStored(): SourceControlSettings | undefined {
  try {
    if (typeof window === "undefined") {
      return undefined;
    }
    const raw = window.localStorage.getItem(SOURCE_CONTROL_STORAGE_KEY);
    if (!raw) {
      return undefined;
    }
    return parseStoredSourceControlSettings(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

function cacheSettings(next: SourceControlSettings): void {
  try {
    window.localStorage.setItem(
      SOURCE_CONTROL_STORAGE_KEY,
      JSON.stringify(next),
    );
  } catch {
    // Private mode etc. — in-memory state still works for the session.
  }
}

/** Push stored settings, then same-tab and cross-tab updates, to onChange. */
function subscribeSourceControl(
  onChange: (settings: SourceControlSettings) => void,
): () => void {
  const stored = readStored();
  if (stored) {
    onChange(stored);
  }
  const onCustom = (event: Event) => {
    onChange((event as CustomEvent<SourceControlSettings>).detail);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SOURCE_CONTROL_STORAGE_KEY) {
      return;
    }
    if (!event.newValue) {
      onChange(defaultSourceControlSettings());
      return;
    }
    try {
      onChange(parseStoredSourceControlSettings(JSON.parse(event.newValue)));
    } catch {
      onChange(defaultSourceControlSettings());
    }
  };
  window.addEventListener(SOURCE_CONTROL_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(SOURCE_CONTROL_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

export function useSourceControlSettings() {
  const [settings, setSettings] = useState<SourceControlSettings>(() =>
    defaultSourceControlSettings(),
  );

  useEffect(() => subscribeSourceControl(setSettings), []);

  // Fetch-first hydration: server settings replace the cache when
  // reachable; any failure keeps the cache/defaults untouched.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await fetchJson<unknown>(SOURCE_CONTROL_URL);
      if (cancelled || data === undefined) {
        return;
      }
      const server = parseStoredSourceControlSettings(data);
      if (cancelled) {
        return;
      }
      setSettings(server);
      cacheSettings(server);
      window.dispatchEvent(
        new CustomEvent<SourceControlSettings>(SOURCE_CONTROL_EVENT, {
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
      const data = await fetchJson<unknown>(SOURCE_CONTROL_URL);
      if (data === undefined) {
        return;
      }
      const server = parseStoredSourceControlSettings(data);
      setSettings(server);
      cacheSettings(server);
      window.dispatchEvent(
        new CustomEvent<SourceControlSettings>(SOURCE_CONTROL_EVENT, {
          detail: server,
        }),
      );
    })();
  }, []);

  /** Validate and save; returns field errors or null on success. */
  const saveSettings = useCallback(
    (draft: SourceControlSettings): SourceControlFieldErrors | null => {
      const errors = validateSourceControlSettings(draft);
      if (Object.keys(errors).length > 0) {
        return errors;
      }
      const next = normalizeSourceControlSettings(draft);
      setSettings(next);
      cacheSettings(next);
      window.dispatchEvent(
        new CustomEvent<SourceControlSettings>(SOURCE_CONTROL_EVENT, {
          detail: next,
        }),
      );
      void (async () => {
        await mutateJson(SOURCE_CONTROL_URL, "PUT", next);
        refreshSettings();
      })();
      return null;
    },
    [refreshSettings],
  );

  const resetSettings = useCallback(() => {
    const defaults = defaultSourceControlSettings();
    setSettings(defaults);
    try {
      window.localStorage.removeItem(SOURCE_CONTROL_STORAGE_KEY);
    } catch {
      // Ignore; in-memory state is already back to defaults.
    }
    window.dispatchEvent(
      new CustomEvent<SourceControlSettings>(SOURCE_CONTROL_EVENT, {
        detail: defaults,
      }),
    );
    // Best-effort server reset so the defaults stick across reloads.
    void mutateJson(SOURCE_CONTROL_URL, "PUT", defaults);
  }, []);

  return { settings, saveSettings, resetSettings, refreshSettings };
}
