// Client hooks for workspace settings and managed nodes. State starts from
// the sample dataset (matching the server render), hydrates from
// localStorage after mount, and stays in sync across components and tabs.

import { useCallback, useEffect, useState } from "react";
import type { Node } from "./control-plane";
import { listNodes, listApps } from "./control-plane";
import {
  NODES_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  buildNode,
  defaultWorkspaceSettings,
  parseStoredNodes,
  parseStoredSettings,
  removeNodeGuarded,
  replaceNode,
  validateNodeDraft,
  validateWorkspaceSettings,
} from "./settings";
import type {
  NodeDraft,
  NodeFieldErrors,
  WorkspaceFieldErrors,
  WorkspaceSettings,
} from "./settings";

const NODES_EVENT = "byov:nodes-changed";
const SETTINGS_EVENT = "byov:settings-changed";

function readStored<T>(
  key: string,
  parse: (value: unknown) => T | undefined,
): T | undefined {
  try {
    if (typeof window === "undefined") {
      return undefined;
    }
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return undefined;
    }
    return parse(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

/** Push stored nodes, then same-tab and cross-tab updates, to onChange. */
function subscribeNodes(onChange: (nodes: Node[]) => void): () => void {
  const stored = readStored(NODES_STORAGE_KEY, parseStoredNodes);
  if (stored) {
    onChange(stored);
  }
  const onCustom = (event: Event) => {
    onChange((event as CustomEvent<Node[]>).detail);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== NODES_STORAGE_KEY) {
      return;
    }
    if (!event.newValue) {
      onChange(listNodes());
      return;
    }
    try {
      onChange(parseStoredNodes(JSON.parse(event.newValue)) ?? listNodes());
    } catch {
      onChange(listNodes());
    }
  };
  window.addEventListener(NODES_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(NODES_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

/** Push stored settings, then same-tab and cross-tab updates, to onChange. */
function subscribeSettings(
  onChange: (settings: WorkspaceSettings) => void,
): () => void {
  const stored = readStored(SETTINGS_STORAGE_KEY, parseStoredSettings);
  if (stored) {
    onChange(stored);
  }
  const onCustom = (event: Event) => {
    onChange((event as CustomEvent<WorkspaceSettings>).detail);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SETTINGS_STORAGE_KEY) {
      return;
    }
    if (!event.newValue) {
      onChange(defaultWorkspaceSettings());
      return;
    }
    try {
      onChange(
        parseStoredSettings(JSON.parse(event.newValue)) ??
          defaultWorkspaceSettings(),
      );
    } catch {
      onChange(defaultWorkspaceSettings());
    }
  };
  window.addEventListener(SETTINGS_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(SETTINGS_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

export function useManagedNodes() {
  const [nodes, setNodes] = useState<Node[]>(() => listNodes());

  useEffect(() => subscribeNodes(setNodes), []);

  const persist = useCallback((next: Node[]) => {
    setNodes(next);
    try {
      window.localStorage.setItem(NODES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private mode etc. — in-memory state still works for the session.
    }
    window.dispatchEvent(new CustomEvent<Node[]>(NODES_EVENT, { detail: next }));
  }, []);

  /** Validate and append; returns field errors or null on success. */
  const createNode = useCallback(
    (draft: NodeDraft): NodeFieldErrors | null => {
      const errors = validateNodeDraft(draft, nodes);
      if (Object.keys(errors).length > 0) {
        return errors;
      }
      persist([...nodes, buildNode(draft, nodes)]);
      return null;
    },
    [nodes, persist],
  );

  /** Validate and replace by slug; the slug never changes. */
  const updateNode = useCallback(
    (slug: string, draft: NodeDraft): NodeFieldErrors | null => {
      const errors = validateNodeDraft(draft, nodes, slug);
      if (Object.keys(errors).length > 0) {
        return errors;
      }
      const target = nodes.find((node) => node.slug === slug);
      if (!target) {
        return null;
      }
      const endpoint = draft.endpoint.trim();
      const domainZone = draft.domainZone.trim().toLowerCase();
      const updated: Node = {
        ...target,
        name: draft.name.trim(),
        kind: draft.kind,
        location: draft.location.trim(),
      };
      if (endpoint) {
        updated.endpoint = endpoint;
      } else {
        delete updated.endpoint;
      }
      if (domainZone) {
        updated.domainZone = domainZone;
      } else {
        delete updated.domainZone;
      }
      persist(replaceNode(nodes, slug, updated));
      return null;
    },
    [nodes, persist],
  );

  /** Remove unless pinned; returns the blocking reason or null. */
  const deleteNode = useCallback(
    (slug: string): string | null => {
      const result = removeNodeGuarded(nodes, slug, listApps());
      if (!result.ok) {
        return result.reason;
      }
      persist(result.nodes);
      return null;
    },
    [nodes, persist],
  );

  const resetNodes = useCallback(() => {
    const sample = listNodes();
    setNodes(sample);
    try {
      window.localStorage.removeItem(NODES_STORAGE_KEY);
    } catch {
      // Ignore; in-memory state is already back to sample data.
    }
    window.dispatchEvent(new CustomEvent<Node[]>(NODES_EVENT, { detail: sample }));
  }, []);

  return { nodes, createNode, updateNode, deleteNode, resetNodes };
}

export function useWorkspaceSettings() {
  const [settings, setSettings] = useState<WorkspaceSettings>(() =>
    defaultWorkspaceSettings(),
  );
  const { nodes } = useManagedNodes();

  useEffect(() => subscribeSettings(setSettings), []);

  /** Validate and save; returns field errors or null on success. */
  const saveSettings = useCallback(
    (draft: WorkspaceSettings): WorkspaceFieldErrors | null => {
      const errors = validateWorkspaceSettings(draft, nodes);
      if (Object.keys(errors).length > 0) {
        return errors;
      }
      const next = {
        workspaceName: draft.workspaceName.trim(),
        defaultNode: draft.defaultNode,
        devZone: draft.devZone.trim().toLowerCase(),
      };
      setSettings(next);
      try {
        window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Private mode etc. — in-memory state still works for the session.
      }
      window.dispatchEvent(
        new CustomEvent<WorkspaceSettings>(SETTINGS_EVENT, { detail: next }),
      );
      return null;
    },
    [nodes],
  );

  const resetSettings = useCallback(() => {
    const defaults = defaultWorkspaceSettings();
    setSettings(defaults);
    try {
      window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
    } catch {
      // Ignore; in-memory state is already back to defaults.
    }
    window.dispatchEvent(
      new CustomEvent<WorkspaceSettings>(SETTINGS_EVENT, { detail: defaults }),
    );
  }, []);

  return { settings, nodes, saveSettings, resetSettings };
}
