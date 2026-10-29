// Client hooks for workspace tech stacks. State starts from the shipped
// catalog (matching the server render), hydrates workspace customs from
// the workspace API after mount — with localStorage as the offline
// cache — and stays in sync across components and tabs. Shipped
// manifests are read-only; customs are editable and cloning a shipped
// stack starts an editable custom copy. When the API is unreachable
// (tests, offline, signed out), the cache stands in and every mutation
// still resolves synchronously.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LEGACY_TEMPLATE_STORAGE_KEY,
  STACK_STORAGE_KEY,
  buildStack,
  getStack,
  listStacks,
  parseStoredStacks,
  replaceStack,
  validateStackDraft,
  type StackDraft,
  type StackFieldErrors,
  type TechStack,
} from "./stacks";

const STACKS_EVENT = "byov:stacks-changed";

const STACKS_URL = "/api/workspace/stacks";

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

function readStored(): TechStack[] | undefined {
  try {
    if (typeof window === "undefined") {
      return undefined;
    }
    const raw =
      window.localStorage.getItem(STACK_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_TEMPLATE_STORAGE_KEY);
    if (!raw) {
      return undefined;
    }
    return parseStoredStacks(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

function cacheCustoms(next: TechStack[]): void {
  try {
    window.localStorage.setItem(STACK_STORAGE_KEY, JSON.stringify(next));
    window.localStorage.removeItem(LEGACY_TEMPLATE_STORAGE_KEY);
  } catch {
    // Private mode etc. — in-memory state still works for the session.
  }
}

/** Push stored customs, then same-tab and cross-tab updates, to onChange. */
function subscribeCustomStacks(
  onChange: (customs: TechStack[]) => void,
): () => void {
  const stored = readStored();
  if (stored) {
    onChange(stored);
  }
  const onCustom = (event: Event) => {
    onChange((event as CustomEvent<TechStack[]>).detail);
  };
  const onStorage = (event: StorageEvent) => {
    if (
      event.key !== STACK_STORAGE_KEY &&
      event.key !== LEGACY_TEMPLATE_STORAGE_KEY
    ) {
      return;
    }
    if (!event.newValue) {
      onChange([]);
      return;
    }
    try {
      onChange(parseStoredStacks(JSON.parse(event.newValue)) ?? []);
    } catch {
      onChange([]);
    }
  };
  window.addEventListener(STACKS_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(STACKS_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

export function useManagedStacks() {
  const [customs, setCustoms] = useState<TechStack[]>([]);

  useEffect(() => subscribeCustomStacks(setCustoms), []);

  // Fetch-first hydration: the server customs replace the cache when
  // reachable; any failure keeps the cached customs untouched.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await fetchJson<unknown>(STACKS_URL);
      if (cancelled || data === undefined) {
        return;
      }
      const server = parseStoredStacks(data);
      if (cancelled || server === undefined) {
        return;
      }
      setCustoms(server);
      cacheCustoms(server);
      window.dispatchEvent(
        new CustomEvent<TechStack[]>(STACKS_EVENT, { detail: server }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stacks = useMemo(() => [...listStacks(), ...customs], [customs]);

  /** Re-read the server customs; failures keep the current state. */
  const refreshCustoms = useCallback(() => {
    void (async () => {
      const data = await fetchJson<unknown>(STACKS_URL);
      if (data === undefined) {
        return;
      }
      const server = parseStoredStacks(data);
      if (server === undefined) {
        return;
      }
      setCustoms(server);
      cacheCustoms(server);
      window.dispatchEvent(
        new CustomEvent<TechStack[]>(STACKS_EVENT, { detail: server }),
      );
    })();
  }, []);

  const persist = useCallback((next: TechStack[]) => {
    setCustoms(next);
    cacheCustoms(next);
    window.dispatchEvent(
      new CustomEvent<TechStack[]>(STACKS_EVENT, { detail: next }),
    );
  }, []);

  /** A slug is custom when it is stored, not shipped. */
  const isCustomStack = useCallback(
    (slug: string): boolean =>
      customs.some((stack) => stack.slug === slug),
    [customs],
  );

  const getManagedStack = useCallback(
    (slug: string): TechStack | undefined =>
      getStack(slug) ?? customs.find((stack) => stack.slug === slug),
    [customs],
  );

  /** Validate and append; returns field errors or null on success. */
  const createStack = useCallback(
    (draft: StackDraft): StackFieldErrors | null => {
      const errors = validateStackDraft(draft, stacks);
      if (Object.keys(errors).length > 0) {
        return errors;
      }
      persist([...customs, buildStack(draft, stacks)]);
      void (async () => {
        await mutateJson(STACKS_URL, "POST", draft);
        refreshCustoms();
      })();
      return null;
    },
    [customs, persist, refreshCustoms, stacks],
  );

  /**
   * Validate and replace a custom stack by slug; the slug never
   * changes. Shipped stacks are read-only — clone them instead.
   */
  const updateStack = useCallback(
    (slug: string, draft: StackDraft): StackFieldErrors | null => {
      const target = customs.find((stack) => stack.slug === slug);
      if (!target) {
        return null;
      }
      const errors = validateStackDraft(draft, stacks, slug);
      if (Object.keys(errors).length > 0) {
        return errors;
      }
      const rebuilt = buildStack(
        draft,
        stacks.filter((stack) => stack.slug !== slug),
      );
      const starterRef = draft.starterRef.trim() || `custom:${slug}`;
      persist(
        replaceStack(customs, slug, {
          ...rebuilt,
          slug,
          starter: { ...rebuilt.starter, ref: starterRef },
        }),
      );
      void (async () => {
        await mutateJson(
          `${STACKS_URL}/${encodeURIComponent(slug)}`,
          "PUT",
          draft,
        );
        refreshCustoms();
      })();
      return null;
    },
    [customs, persist, refreshCustoms, stacks],
  );

  /** Remove a custom stack; shipped stacks cannot be removed. */
  const deleteStack = useCallback(
    (slug: string): void => {
      persist(customs.filter((stack) => stack.slug !== slug));
      void (async () => {
        await mutateJson(
          `${STACKS_URL}/${encodeURIComponent(slug)}`,
          "DELETE",
        );
        refreshCustoms();
      })();
    },
    [customs, persist, refreshCustoms],
  );

  const resetStacks = useCallback(() => {
    const stale = customs;
    setCustoms([]);
    try {
      window.localStorage.removeItem(STACK_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_TEMPLATE_STORAGE_KEY);
    } catch {
      // Ignore; in-memory state is already back to the shipped catalog.
    }
    window.dispatchEvent(
      new CustomEvent<TechStack[]>(STACKS_EVENT, { detail: [] }),
    );
    // Best-effort server reset so the catalog sticks across reloads.
    void Promise.allSettled(
      stale.map((stack) =>
        mutateJson(`${STACKS_URL}/${encodeURIComponent(stack.slug)}`, "DELETE"),
      ),
    );
  }, [customs]);

  return {
    stacks,
    customStacks: customs,
    isCustomStack,
    getManagedStack,
    createStack,
    updateStack,
    deleteStack,
    resetStacks,
  };
}
