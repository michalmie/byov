// Client hooks for workspace settings and managed nodes. State starts from
// the sample dataset (matching the server render), hydrates from the
// workspace API after mount — with localStorage as the offline cache —
// and stays in sync across components and tabs. When the API is
// unreachable (tests, offline, signed out), the cache and samples stand
// in and every mutation still resolves synchronously.

import { useCallback, useEffect, useState } from "react";
import type { App, Node } from "./control-plane";
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

const NODES_URL = "/api/workspace/nodes";
const SETTINGS_URL = "/api/workspace/settings";

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

function cacheNodes(next: Node[]): void {
  try {
    window.localStorage.setItem(NODES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode etc. — in-memory state still works for the session.
  }
}

function cacheSettings(next: WorkspaceSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode etc. — in-memory state still works for the session.
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

  // Fetch-first hydration: the server list replaces the cache when
  // reachable; any failure keeps the cache/sample state untouched.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await fetchJson<unknown>(NODES_URL);
      if (cancelled || data === undefined) {
        return;
      }
      const server = parseStoredNodes(data);
      if (cancelled || server === undefined) {
        return;
      }
      setNodes(server);
      cacheNodes(server);
      window.dispatchEvent(
        new CustomEvent<Node[]>(NODES_EVENT, { detail: server }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Re-read the server list; failures keep the current state. */
  const refreshNodes = useCallback(() => {
    void (async () => {
      const data = await fetchJson<unknown>(NODES_URL);
      if (data === undefined) {
        return;
      }
      const server = parseStoredNodes(data);
      if (server === undefined) {
        return;
      }
      setNodes(server);
      cacheNodes(server);
      window.dispatchEvent(
        new CustomEvent<Node[]>(NODES_EVENT, { detail: server }),
      );
    })();
  }, []);

  const persist = useCallback((next: Node[]) => {
    setNodes(next);
    cacheNodes(next);
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
      void (async () => {
        await mutateJson(NODES_URL, "POST", draft);
        refreshNodes();
      })();
      return null;
    },
    [nodes, persist, refreshNodes],
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
      const tailnetHost = draft.tailnetHost.trim().toLowerCase();
      const updated: Node = {
        ...target,
        name: draft.name.trim(),
        kind: draft.kind,
        location: draft.location.trim(),
        hasApiToken: (draft.apiToken ?? "").trim()
          ? true
          : draft.clearApiToken
            ? false
            : target.hasApiToken,
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
      if (tailnetHost) {
        updated.tailnetHost = tailnetHost;
      } else {
        delete updated.tailnetHost;
      }
      persist(replaceNode(nodes, slug, updated));
      void (async () => {
        await mutateJson(
          `${NODES_URL}/${encodeURIComponent(slug)}`,
          "PUT",
          draft,
        );
        refreshNodes();
      })();
      return null;
    },
    [nodes, persist, refreshNodes],
  );

  /** Remove unless pinned; returns the blocking reason or null. */
  const deleteNode = useCallback(
    (slug: string, apps: readonly App[] = listApps()): string | null => {
      const result = removeNodeGuarded(nodes, slug, apps);
      if (!result.ok) {
        return result.reason;
      }
      persist(result.nodes);
      void (async () => {
        await mutateJson(
          `${NODES_URL}/${encodeURIComponent(slug)}`,
          "DELETE",
        );
        refreshNodes();
      })();
      return null;
    },
    [nodes, persist, refreshNodes],
  );

  const resetNodes = useCallback(() => {
    const sample = listNodes();
    const stale = nodes;
    setNodes(sample);
    try {
      window.localStorage.removeItem(NODES_STORAGE_KEY);
    } catch {
      // Ignore; in-memory state is already back to sample data.
    }
    window.dispatchEvent(new CustomEvent<Node[]>(NODES_EVENT, { detail: sample }));
    // Best-effort server reset so the samples stick across reloads.
    void Promise.allSettled(
      stale.map((node) =>
        mutateJson(`${NODES_URL}/${encodeURIComponent(node.slug)}`, "DELETE"),
      ),
    );
  }, [nodes]);

  return { nodes, createNode, updateNode, deleteNode, resetNodes };
}

export function useWorkspaceSettings() {
  const [settings, setSettings] = useState<WorkspaceSettings>(() =>
    defaultWorkspaceSettings(),
  );
  const { nodes } = useManagedNodes();

  useEffect(() => subscribeSettings(setSettings), []);

  // Fetch-first hydration: server settings replace the cache when
  // reachable; any failure keeps the cache/defaults untouched.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await fetchJson<unknown>(SETTINGS_URL);
      if (cancelled || data === undefined) {
        return;
      }
      const server = parseStoredSettings(data);
      if (cancelled || server === undefined) {
        return;
      }
      setSettings(server);
      cacheSettings(server);
      window.dispatchEvent(
        new CustomEvent<WorkspaceSettings>(SETTINGS_EVENT, { detail: server }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Re-read the server settings; failures keep the current state. */
  const refreshSettings = useCallback(() => {
    void (async () => {
      const data = await fetchJson<unknown>(SETTINGS_URL);
      if (data === undefined) {
        return;
      }
      const server = parseStoredSettings(data);
      if (server === undefined) {
        return;
      }
      setSettings(server);
      cacheSettings(server);
      window.dispatchEvent(
        new CustomEvent<WorkspaceSettings>(SETTINGS_EVENT, { detail: server }),
      );
    })();
  }, []);

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
        tailnetDomain: draft.tailnetDomain.trim().toLowerCase(),
        defaultScenario: draft.defaultScenario,
        appScenarios: draft.appScenarios,
      };
      setSettings(next);
      cacheSettings(next);
      window.dispatchEvent(
        new CustomEvent<WorkspaceSettings>(SETTINGS_EVENT, { detail: next }),
      );
      void (async () => {
        await mutateJson(SETTINGS_URL, "PUT", next);
        refreshSettings();
      })();
      return null;
    },
    [nodes, refreshSettings],
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
    // Best-effort server reset so the defaults stick across reloads.
    void mutateJson(SETTINGS_URL, "PUT", defaults);
  }, []);

  return { settings, nodes, saveSettings, resetSettings };
}
