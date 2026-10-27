// Client hooks for workspace templates. State starts from the shipped
// catalog (matching the server render), hydrates workspace customs
// from localStorage after mount, and stays in sync across components
// and tabs. Shipped manifests are read-only; customs are editable and
// cloning a shipped template starts an editable custom copy.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TEMPLATE_STORAGE_KEY,
  buildTemplate,
  getTemplate,
  listTemplates,
  parseStoredTemplates,
  replaceTemplate,
  validateTemplateDraft,
  type AppTemplate,
  type TemplateDraft,
  type TemplateFieldErrors,
} from "./templates";

const TEMPLATES_EVENT = "byov:templates-changed";

function readStored(): AppTemplate[] | undefined {
  try {
    if (typeof window === "undefined") {
      return undefined;
    }
    const raw = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!raw) {
      return undefined;
    }
    return parseStoredTemplates(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

/** Push stored customs, then same-tab and cross-tab updates, to onChange. */
function subscribeCustomTemplates(
  onChange: (customs: AppTemplate[]) => void,
): () => void {
  const stored = readStored();
  if (stored) {
    onChange(stored);
  }
  const onCustom = (event: Event) => {
    onChange((event as CustomEvent<AppTemplate[]>).detail);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== TEMPLATE_STORAGE_KEY) {
      return;
    }
    if (!event.newValue) {
      onChange([]);
      return;
    }
    try {
      onChange(parseStoredTemplates(JSON.parse(event.newValue)) ?? []);
    } catch {
      onChange([]);
    }
  };
  window.addEventListener(TEMPLATES_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(TEMPLATES_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

export function useManagedTemplates() {
  const [customs, setCustoms] = useState<AppTemplate[]>([]);

  useEffect(() => subscribeCustomTemplates(setCustoms), []);

  const templates = useMemo(
    () => [...listTemplates(), ...customs],
    [customs],
  );

  const persist = useCallback((next: AppTemplate[]) => {
    setCustoms(next);
    try {
      window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private mode etc. — in-memory state still works for the session.
    }
    window.dispatchEvent(
      new CustomEvent<AppTemplate[]>(TEMPLATES_EVENT, { detail: next }),
    );
  }, []);

  /** A slug is custom when it is stored, not shipped. */
  const isCustom = useCallback(
    (slug: string): boolean =>
      customs.some((template) => template.slug === slug),
    [customs],
  );

  const getManagedTemplate = useCallback(
    (slug: string): AppTemplate | undefined =>
      getTemplate(slug) ?? customs.find((template) => template.slug === slug),
    [customs],
  );

  /** Validate and append; returns field errors or null on success. */
  const createTemplate = useCallback(
    (draft: TemplateDraft): TemplateFieldErrors | null => {
      const errors = validateTemplateDraft(draft, templates);
      if (Object.keys(errors).length > 0) {
        return errors;
      }
      persist([...customs, buildTemplate(draft, templates)]);
      return null;
    },
    [customs, persist, templates],
  );

  /**
   * Validate and replace a custom template by slug; the slug never
   * changes. Shipped templates are read-only — clone them instead.
   */
  const updateTemplate = useCallback(
    (slug: string, draft: TemplateDraft): TemplateFieldErrors | null => {
      const target = customs.find((template) => template.slug === slug);
      if (!target) {
        return null;
      }
      const errors = validateTemplateDraft(draft, templates, slug);
      if (Object.keys(errors).length > 0) {
        return errors;
      }
      const rebuilt = buildTemplate(
        draft,
        templates.filter((template) => template.slug !== slug),
      );
      const starterRef = draft.starterRef.trim() || `custom:${slug}`;
      persist(
        replaceTemplate(customs, slug, {
          ...rebuilt,
          slug,
          starter: { ...rebuilt.starter, ref: starterRef },
        }),
      );
      return null;
    },
    [customs, persist, templates],
  );

  /** Remove a custom template; shipped templates cannot be removed. */
  const deleteTemplate = useCallback(
    (slug: string): void => {
      persist(customs.filter((template) => template.slug !== slug));
    },
    [customs, persist],
  );

  const resetTemplates = useCallback(() => {
    setCustoms([]);
    try {
      window.localStorage.removeItem(TEMPLATE_STORAGE_KEY);
    } catch {
      // Ignore; in-memory state is already back to the shipped catalog.
    }
    window.dispatchEvent(
      new CustomEvent<AppTemplate[]>(TEMPLATES_EVENT, { detail: [] }),
    );
  }, []);

  return {
    templates,
    customTemplates: customs,
    isCustom,
    getManagedTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    resetTemplates,
  };
}
