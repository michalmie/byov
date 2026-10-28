// Client hook for workspace auth settings. State starts from the defaults
// (matching the server render), hydrates from localStorage after mount,
// and stays in sync across components and tabs.

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
      try {
        window.localStorage.setItem(
          AUTH_SETTINGS_STORAGE_KEY,
          JSON.stringify(next),
        );
      } catch {
        // Private mode etc. — in-memory state still works for the session.
      }
      window.dispatchEvent(
        new CustomEvent<AuthSettings>(AUTH_SETTINGS_EVENT, { detail: next }),
      );
      return null;
    },
    [],
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
  }, []);

  return { settings, saveAuthSettings, resetAuthSettings };
}
