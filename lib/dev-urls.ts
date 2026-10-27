// Dev URL contract: predictable environment URLs under per-node wildcard
// zones. Pure functions with no DOM access, so the future node adapter can
// reuse them when it programs Coolify. Invariant: exactly one DNS label
// varies under a wildcard zone that resolves to exactly one node.

import type { AppEnvironment, Node } from "./control-plane";

/** Longest DNS label allowed; generated labels truncate to this. */
export const MAX_DNS_LABEL = 63;

/** Longest zone string accepted (a full DNS name caps at 253). */
export const MAX_ZONE_LENGTH = 253;

/** Env name that may use the short workspace dev-zone variant. */
export const DEVELOPMENT_ENV = "development";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function truncateLabel(slug: string): string {
  return slug.slice(0, MAX_DNS_LABEL).replace(/-+$/g, "");
}

/** Collapse free text into a safe DNS label (may be empty). */
export function toDnsLabel(value: string): string {
  return truncateLabel(slugify(value));
}

/** True for a bare zone like qa-lab-01.byov.xexo.io (no scheme, no *.). */
export function isDomainZone(value: string): boolean {
  const zone = value.trim().toLowerCase();
  if (!zone || zone.length > MAX_ZONE_LENGTH || !zone.includes(".")) {
    return false;
  }
  return zone.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

function envLabel(appSlug: string, envName: string): string {
  const label = truncateLabel(
    [slugify(appSlug), slugify(envName)].filter(Boolean).join("-"),
  );
  return label || "env";
}

export type EnvUrlSource = "override" | "dev-zone" | "node-zone" | "missing-zone";

export interface ResolvedEnvUrl {
  /** Effective URL, or null when the node serves no zone. */
  url: string | null;
  source: EnvUrlSource;
  /** Set when a development env sits outside the workspace dev zone. */
  warning?: string;
}

/**
 * Resolve the effective URL for an environment. An explicit env URL always
 * wins; otherwise the URL derives from app + env + the serving node's zone,
 * or the short dev-zone variant for development envs on the dev-zone node.
 */
export function resolveEnvUrl(
  appSlug: string,
  env: AppEnvironment,
  nodes: readonly Node[],
  devZone: string,
): ResolvedEnvUrl {
  const override = env.url?.trim();
  if (override) {
    return { url: override, source: "override", warning: undefined };
  }
  const node = nodes.find((entry) => entry.slug === env.node);
  const zone = node?.domainZone?.trim().toLowerCase();
  if (!node || !zone) {
    return { url: null, source: "missing-zone", warning: undefined };
  }
  const dev = devZone.trim().toLowerCase();
  const devActive = dev && isDomainZone(dev) ? dev : "";
  if (devActive && env.name === DEVELOPMENT_ENV && zone === devActive) {
    const host = toDnsLabel(appSlug) || "app";
    return { url: `https://${host}.${devActive}`, source: "dev-zone", warning: undefined };
  }
  const url = `https://${envLabel(appSlug, env.name)}.${zone}`;
  if (devActive && env.name === DEVELOPMENT_ENV) {
    return {
      url,
      source: "node-zone",
      warning: `Development usually lives under ${devActive} — this env is pinned to ${node.name}.`,
    };
  }
  return { url, source: "node-zone", warning: undefined };
}
