// Client hook for workspace apps. State starts from the sample dataset
// (matching the server render), hydrates workspace apps from
// localStorage after mount, and stays in sync across components and
// tabs. Sample apps are read-only; workspace apps are created here
// and each starts with one Sandbox environment.

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

  const apps = useMemo(() => [...listApps(), ...customs], [customs]);
  const { nodes } = useManagedNodes();
  const { stacks } = useManagedStacks();

  const persist = useCallback((next: App[]) => {
    setCustoms(next);
    try {
      window.localStorage.setItem(APPS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private mode etc. — in-memory state still works for the session.
    }
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
      return { ok: true, slug: app.slug };
    },
    [apps, customs, nodes, persist, stacks],
  );

  /** Remove a workspace app; sample apps cannot be removed. */
  const deleteApp = useCallback(
    (slug: string): boolean => {
      if (!customs.some((app) => app.slug === slug)) {
        return false;
      }
      persist(customs.filter((app) => app.slug !== slug));
      return true;
    },
    [customs, persist],
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
