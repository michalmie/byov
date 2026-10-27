// Pure settings logic: node drafts, validation, list operations and the
// shape checks for browser-persisted settings. No DOM access here so every
// rule stays unit-testable; lib/settings-store.ts owns the hooks.

import type { App, DnsScenario, Health, Node } from "./control-plane";
import { isDnsScenario } from "./control-plane";
import { MAX_ZONE_LENGTH, isDomainZone, isHostname } from "./dev-urls";

export const SUPPORTED_NODE_KINDS = ["Coolify"] as const;

/** Picker copy per DNS scenario. */
export const DNS_SCENARIO_META: Record<
  DnsScenario,
  { label: string; blurb: string }
> = {
  public: {
    label: "Public subdomain",
    blurb: "Envs at app-env under this node's public zone.",
  },
  tailnet: {
    label: "Tailscale",
    blurb: "Envs on the node's tailnet name with a stable port.",
  },
  local: {
    label: "Local DNS",
    blurb: "Envs under this node's zone on your internal resolver.",
  },
};

export const NODES_STORAGE_KEY = "byov:nodes:v1";
export const SETTINGS_STORAGE_KEY = "byov:settings:v1";

const MAX_NAME = 40;
const MAX_LOCATION = 60;
const MAX_WORKSPACE_NAME = 60;
const MAX_ENDPOINT = 200;

/** Raw form values for adding or editing a node. */
export interface NodeDraft {
  name: string;
  kind: string;
  location: string;
  endpoint: string;
  domainZone: string;
  dnsScenario: string;
  tailnetHost: string;
}

export type NodeField =
  | "name"
  | "kind"
  | "location"
  | "endpoint"
  | "domainZone"
  | "dnsScenario"
  | "tailnetHost";
export type NodeFieldErrors = Partial<Record<NodeField, string>>;

export function slugifyNodeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function uniqueNodeSlug(
  name: string,
  existingSlugs: readonly string[],
): string {
  const base = slugifyNodeName(name) || "node";
  if (!existingSlugs.includes(base)) {
    return base;
  }
  let counter = 2;
  while (existingSlugs.includes(`${base}-${counter}`)) {
    counter += 1;
  }
  return `${base}-${counter}`;
}

/** Reserved-suffix rejection for operator zones, or null when fine. */
function reservedSuffixError(zone: string): string | null {
  const lower = zone.toLowerCase();
  if (lower.endsWith(".local")) {
    return "The .local suffix is reserved for mDNS — use your own zone.";
  }
  if (lower === "home.arpa" || lower.endsWith(".home.arpa")) {
    return "home.arpa is for home networks — use your own zone.";
  }
  return null;
}

export function validateNodeDraft(
  draft: NodeDraft,
  existing: readonly Node[],
  selfSlug?: string,
): NodeFieldErrors {
  const errors: NodeFieldErrors = {};
  const name = draft.name.trim();
  if (!name) {
    errors.name = "Give the node a name.";
  } else if (name.length > MAX_NAME) {
    errors.name = `Keep the name under ${MAX_NAME} characters.`;
  } else {
    const slug = slugifyNodeName(name);
    const clash = existing.some(
      (node) =>
        node.slug !== selfSlug &&
        (node.slug === slug ||
          node.name.trim().toLowerCase() === name.toLowerCase()),
    );
    if (clash) {
      errors.name = "A node with this name already exists.";
    }
  }

  if (!draft.kind.trim()) {
    errors.kind = "Choose a node type.";
  } else if (
    !(SUPPORTED_NODE_KINDS as readonly string[]).includes(draft.kind)
  ) {
    errors.kind = `Supported node types: ${SUPPORTED_NODE_KINDS.join(", ")}.`;
  }

  const location = draft.location.trim();
  if (!location) {
    errors.location = "Add a location, e.g. a city or lab.";
  } else if (location.length > MAX_LOCATION) {
    errors.location = `Keep the location under ${MAX_LOCATION} characters.`;
  }

  const endpoint = draft.endpoint.trim();
  if (endpoint) {
    if (endpoint.length > MAX_ENDPOINT) {
      errors.endpoint = `Keep the endpoint under ${MAX_ENDPOINT} characters.`;
    } else if (!isHttpUrl(endpoint)) {
      errors.endpoint =
        "Enter a valid http(s) URL, e.g. https://coolify.example.com.";
    }
  }

  const domainZone = draft.domainZone.trim();
  if (domainZone) {
    const reserved = reservedSuffixError(domainZone);
    if (domainZone.startsWith("*.")) {
      errors.domainZone =
        "Enter the zone without the *. prefix, e.g. qa-lab-01.byov.xexo.io.";
    } else if (reserved) {
      errors.domainZone = reserved;
    } else if (domainZone.length > MAX_ZONE_LENGTH) {
      errors.domainZone = `Keep the zone under ${MAX_ZONE_LENGTH} characters.`;
    } else if (!isDomainZone(domainZone)) {
      errors.domainZone =
        "Enter a zone like qa-lab-01.byov.xexo.io (no scheme, at least two labels).";
    }
  }

  if (!isDnsScenario(draft.dnsScenario)) {
    errors.dnsScenario = "Choose a DNS scenario.";
  }

  const tailnetHost = draft.tailnetHost.trim();
  if (tailnetHost && !isHostname(tailnetHost)) {
    errors.tailnetHost =
      "Enter the machine name as known on the tailnet, e.g. qa-lab-01.";
  }

  return errors;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Build a validated draft into a node. New nodes start pending. */
export function buildNode(
  draft: NodeDraft,
  existing: readonly Node[],
): Node {
  const endpoint = draft.endpoint.trim();
  const domainZone = draft.domainZone.trim().toLowerCase();
  const tailnetHost = draft.tailnetHost.trim().toLowerCase();
  return {
    slug: uniqueNodeSlug(
      draft.name,
      existing.map((node) => node.slug),
    ),
    name: draft.name.trim(),
    kind: draft.kind,
    location: draft.location.trim(),
    status: "pending",
    ...(endpoint ? { endpoint } : {}),
    ...(domainZone ? { domainZone } : {}),
    dnsScenario: isDnsScenario(draft.dnsScenario)
      ? draft.dnsScenario
      : "public",
    ...(tailnetHost ? { tailnetHost } : {}),
  };
}

export interface NodeUsageEntry {
  appSlug: string;
  appName: string;
  env: string;
}

/** Every environment pinned to a node slug. */
export function nodeUsage(
  slug: string,
  apps: readonly App[],
): NodeUsageEntry[] {
  const usage: NodeUsageEntry[] = [];
  for (const app of apps) {
    for (const env of app.envs) {
      if (env.node === slug) {
        usage.push({
          appSlug: app.slug,
          appName: app.name,
          env: env.name,
        });
      }
    }
  }
  return usage;
}

/** Replace one node by slug; unknown slugs leave the list untouched. */
export function replaceNode(
  nodes: readonly Node[],
  slug: string,
  node: Node,
): Node[] {
  return nodes.map((entry) => (entry.slug === slug ? node : entry));
}

export type RemoveNodeResult =
  | { ok: true; nodes: Node[] }
  | { ok: false; reason: string; usage: NodeUsageEntry[] };

/** Remove a node unless environments are pinned to it. */
export function removeNodeGuarded(
  nodes: readonly Node[],
  slug: string,
  apps: readonly App[],
): RemoveNodeResult {
  const target = nodes.find((node) => node.slug === slug);
  if (!target) {
    return { ok: false, reason: "Node not found.", usage: [] };
  }
  const usage = nodeUsage(slug, apps);
  if (usage.length > 0) {
    const envs = usage.length === 1 ? "1 environment is" : `${usage.length} environments are`;
    return {
      ok: false,
      reason: `Cannot remove ${target.name}: ${envs} still pinned to it.`,
      usage,
    };
  }
  return { ok: true, nodes: nodes.filter((node) => node.slug !== slug) };
}

export interface WorkspaceSettings {
  workspaceName: string;
  /** Node slug, or "" for none. */
  defaultNode: string;
  /** Zone for short development URLs, or "" to stay on node zones. */
  devZone: string;
  /** Tailnet domain for tailnet env URLs, or "" when unused. */
  tailnetDomain: string;
}

export function defaultWorkspaceSettings(): WorkspaceSettings {
  return {
    workspaceName: "BYOV workspace",
    defaultNode: "",
    devZone: "",
    tailnetDomain: "",
  };
}

export type WorkspaceField =
  | "workspaceName"
  | "defaultNode"
  | "devZone"
  | "tailnetDomain";
export type WorkspaceFieldErrors = Partial<Record<WorkspaceField, string>>;

export function validateWorkspaceSettings(
  draft: WorkspaceSettings,
  nodes: readonly Node[],
): WorkspaceFieldErrors {
  const errors: WorkspaceFieldErrors = {};
  const name = draft.workspaceName.trim();
  if (!name) {
    errors.workspaceName = "Give the workspace a name.";
  } else if (name.length > MAX_WORKSPACE_NAME) {
    errors.workspaceName = `Keep the workspace name under ${MAX_WORKSPACE_NAME} characters.`;
  }
  if (draft.defaultNode && !nodes.some((node) => node.slug === draft.defaultNode)) {
    errors.defaultNode = "Choose one of the known nodes.";
  }
  const devZone = draft.devZone.trim();
  if (devZone) {
    const reserved = reservedSuffixError(devZone);
    if (devZone.startsWith("*.")) {
      errors.devZone =
        "Enter the zone without the *. prefix, e.g. dev.byov.xexo.io.";
    } else if (reserved) {
      errors.devZone = reserved;
    } else if (!isDomainZone(devZone)) {
      errors.devZone =
        "Enter a zone like dev.byov.xexo.io (no scheme, at least two labels).";
    }
  }
  const tailnetDomain = draft.tailnetDomain.trim();
  if (tailnetDomain) {
    if (
      !isDomainZone(tailnetDomain) ||
      !tailnetDomain.toLowerCase().endsWith(".ts.net")
    ) {
      errors.tailnetDomain =
        "Enter your tailnet domain, e.g. yak-bebop.ts.net.";
    }
  }
  return errors;
}

const storedStatuses: readonly Health[] = [
  "healthy",
  "deploying",
  "degraded",
  "down",
  "pending",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parse a stored node list; undefined means "fall back to sample data". */
export function parseStoredNodes(value: unknown): Node[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const nodes: Node[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    const {
      slug,
      name,
      kind,
      location,
      status,
      endpoint,
      domainZone,
      dnsScenario,
      tailnetHost,
    } = entry;
    if (
      typeof slug !== "string" ||
      !slug ||
      typeof name !== "string" ||
      !name ||
      typeof kind !== "string" ||
      !kind ||
      typeof location !== "string" ||
      !location ||
      typeof status !== "string" ||
      !(storedStatuses as readonly string[]).includes(status)
    ) {
      continue;
    }
    nodes.push({
      slug,
      name,
      kind,
      location,
      status: status as Health,
      ...(typeof endpoint === "string" && endpoint ? { endpoint } : {}),
      ...(typeof domainZone === "string" && isDomainZone(domainZone)
        ? { domainZone: domainZone.trim().toLowerCase() }
        : {}),
      dnsScenario: isDnsScenario(dnsScenario) ? dnsScenario : "public",
      ...(typeof tailnetHost === "string" && isHostname(tailnetHost)
        ? { tailnetHost: tailnetHost.trim().toLowerCase() }
        : {}),
    });
  }
  return nodes;
}

/** Parse stored workspace settings; undefined means "fall back to defaults". */
export function parseStoredSettings(value: unknown): WorkspaceSettings | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { workspaceName, defaultNode, devZone, tailnetDomain } = value;
  if (
    typeof workspaceName !== "string" ||
    !workspaceName.trim() ||
    typeof defaultNode !== "string"
  ) {
    return undefined;
  }
  const tailnet =
    typeof tailnetDomain === "string" ? tailnetDomain.trim().toLowerCase() : "";
  return {
    workspaceName: workspaceName.trim(),
    defaultNode,
    devZone:
      typeof devZone === "string" && isDomainZone(devZone.trim())
        ? devZone.trim().toLowerCase()
        : "",
    tailnetDomain:
      tailnet && isDomainZone(tailnet) && tailnet.endsWith(".ts.net")
        ? tailnet
        : "",
  };
}
