// Client hooks for workspace tech stacks. State starts from the shipped
// catalog (matching the server render), hydrates workspace customs
// from localStorage after mount, and stays in sync across components
// and tabs. Shipped manifests are read-only; customs are editable and
// cloning a shipped stack starts an editable custom copy.

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

  const stacks = useMemo(() => [...listStacks(), ...customs], [customs]);

  const persist = useCallback((next: TechStack[]) => {
    setCustoms(next);
    try {
      window.localStorage.setItem(STACK_STORAGE_KEY, JSON.stringify(next));
      window.localStorage.removeItem(LEGACY_TEMPLATE_STORAGE_KEY);
    } catch {
      // Private mode etc. — in-memory state still works for the session.
    }
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
      return null;
    },
    [customs, persist, stacks],
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
      return null;
    },
    [customs, persist, stacks],
  );

  /** Remove a custom stack; shipped stacks cannot be removed. */
  const deleteStack = useCallback(
    (slug: string): void => {
      persist(customs.filter((stack) => stack.slug !== slug));
    },
    [customs, persist],
  );

  const resetStacks = useCallback(() => {
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
  }, []);

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
