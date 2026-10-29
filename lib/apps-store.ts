// Client hook for workspace apps. State starts from the sample dataset
// (matching the server render), hydrates workspace apps from the
// workspace API after mount — with localStorage as the offline cache —
// and stays in sync across components and tabs. Sample apps are
// read-only; workspace apps are created here and each starts with one
// Sandbox environment. When the API is unreachable (tests, offline,
// signed out), the cache stands in and every mutation still resolves
// synchronously.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { App } from "./control-plane";
import { listApps } from "./control-plane";
import {
  APPS_STORAGE_KEY,
  buildApp,
  parseStoredApps,
  validateAppDraft,
  type AppDraft,
  type AppFieldErrors,
} from "./apps";
import { useManagedNodes } from "./settings-store";
import { useManagedStacks } from "./stack-store";

export const APPS_EVENT = "byov:apps-changed";

const APPS_URL = "/api/workspace/apps";

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

function readStored(): App[] | undefined {
  try {
    if (typeof window === "undefined") {
      return undefined;
    }
    const raw = window.localStorage.getItem(APPS_STORAGE_KEY);
    if (!raw) {
      return undefined;
    }
    return parseStoredApps(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

function cacheCustoms(next: App[]): void {
  try {
    window.localStorage.setItem(APPS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode etc. — in-memory state still works for the session.
  }
}

/** Push stored customs, then same-tab and cross-tab updates, to onChange. */
function subscribeCustomApps(onChange: (customs: App[]) => void): () => void {
  // Always push, even when empty: the first push marks hydration done.
  onChange(readStored() ?? []);
  const onCustom = (event: Event) => {
    onChange((event as CustomEvent<App[]>).detail);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== APPS_STORAGE_KEY) {
      return;
    }
    if (!event.newValue) {
      onChange([]);
      return;
    }
    try {
      onChange(parseStoredApps(JSON.parse(event.newValue)) ?? []);
    } catch {
      onChange([]);
    }
  };
  window.addEventListener(APPS_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(APPS_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

export type CreateAppResult =
  | { ok: true; slug: string }
  | { ok: false; errors: AppFieldErrors };

export function useManagedApps() {
  const [customs, setCustoms] = useState<App[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(
    () =>
      subscribeCustomApps((next) => {
        setCustoms(next);
        setHydrated(true);
      }),
    [],
  );

  // Fetch-first hydration: the server customs replace the cache when
  // reachable; any failure keeps the cached customs untouched.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await fetchJson<unknown>(APPS_URL);
      if (cancelled || data === undefined) {
        return;
      }
      const server = parseStoredApps(data);
      if (cancelled || server === undefined) {
        return;
      }
      setCustoms(server);
      cacheCustoms(server);
      window.dispatchEvent(
        new CustomEvent<App[]>(APPS_EVENT, { detail: server }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const apps = useMemo(() => [...listApps(), ...customs], [customs]);
  const { nodes } = useManagedNodes();
  const { stacks } = useManagedStacks();

  /** Re-read the server customs; failures keep the current state. */
  const refreshCustoms = useCallback(() => {
    void (async () => {
      const data = await fetchJson<unknown>(APPS_URL);
      if (data === undefined) {
        return;
      }
      const server = parseStoredApps(data);
      if (server === undefined) {
        return;
      }
      setCustoms(server);
      cacheCustoms(server);
      window.dispatchEvent(
        new CustomEvent<App[]>(APPS_EVENT, { detail: server }),
      );
    })();
  }, []);

  const persist = useCallback((next: App[]) => {
    setCustoms(next);
    cacheCustoms(next);
    window.dispatchEvent(new CustomEvent<App[]>(APPS_EVENT, { detail: next }));
  }, []);

  const getManagedApp = useCallback(
    (slug: string): App | undefined =>
      listApps().find((app) => app.slug === slug) ??
      customs.find((app) => app.slug === slug),
    [customs],
  );

  /** A slug is custom when it is stored, not shipped. */
  const isCustomApp = useCallback(
    (slug: string): boolean => customs.some((app) => app.slug === slug),
    [customs],
  );

  /** Validate and append; returns the new slug or field errors. */
  const createApp = useCallback(
    (draft: AppDraft): CreateAppResult => {
      const errors = validateAppDraft(
        draft,
        apps,
        nodes,
        stacks.map((stack) => stack.slug),
      );
      if (Object.keys(errors).length > 0) {
        return { ok: false, errors };
      }
      const app = buildApp(draft, apps);
      persist([...customs, app]);
      void (async () => {
        await mutateJson(APPS_URL, "POST", draft);
        refreshCustoms();
      })();
      return { ok: true, slug: app.slug };
    },
    [apps, customs, nodes, persist, refreshCustoms, stacks],
  );

  /** Remove a workspace app; sample apps cannot be removed. */
  const deleteApp = useCallback(
    (slug: string): boolean => {
      if (!customs.some((app) => app.slug === slug)) {
        return false;
      }
      persist(customs.filter((app) => app.slug !== slug));
      void (async () => {
        await mutateJson(`${APPS_URL}/${encodeURIComponent(slug)}`, "DELETE");
        refreshCustoms();
      })();
      return true;
    },
    [customs, persist, refreshCustoms],
  );

  return {
    apps,
    customApps: customs,
    hydrated,
    getManagedApp,
    isCustomApp,
    createApp,
    deleteApp,
  };
}
