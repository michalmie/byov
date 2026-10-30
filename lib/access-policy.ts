// Access policy: who may use a deployed app. Pure logic (no DOM, no
// DB) so creation validation, stored-app parsing and the future node
// proxy enforcement all share one contract. Policies are allowlist
// based: restricted denies by default, deny always wins, and a missing
// policy means the safe workspace default — never public.

import { isValidEmail } from "./auth-settings";
import {
  ACCESS_RULE_TYPES,
  ACCESS_SCOPES,
  type AccessPolicy,
  type AccessRule,
  type AccessRuleType,
  type App,
  type AppEnvironment,
} from "./control-plane";

export const MAX_ACCESS_RULES = 50;
const MAX_RULE_VALUE = 200;
export const ACCESS_NETWORKS = ["tailnet", "local", "vpn"] as const;

export function isAccessScope(value: unknown): value is AccessPolicy["scope"] {
  return (
    typeof value === "string" &&
    (ACCESS_SCOPES as readonly string[]).includes(value)
  );
}

export function isAccessRuleType(value: unknown): value is AccessRuleType {
  return (
    typeof value === "string" &&
    (ACCESS_RULE_TYPES as readonly string[]).includes(value)
  );
}

/** Safe default for new and legacy apps: signed-in workspace members. */
export function defaultAccessPolicy(): AccessPolicy {
  return { scope: "workspace", rules: [] };
}

/** App policy with env override applied; never returns undefined. */
export function effectiveAccessPolicy(
  app: Pick<App, "accessPolicy">,
  env?: Pick<AppEnvironment, "accessPolicy">,
): AccessPolicy {
  return env?.accessPolicy ?? app.accessPolicy ?? defaultAccessPolicy();
}

const SCOPE_LABELS: Record<AccessPolicy["scope"], string> = {
  public: "Public",
  workspace: "Workspace",
  restricted: "Restricted",
};

export function accessScopeLabel(scope: AccessPolicy["scope"]): string {
  return SCOPE_LABELS[scope];
}

/** One-line summary for badges and the app page. */
export function describeAccessPolicy(policy: AccessPolicy): string {
  const base =
    policy.scope === "public"
      ? "Anyone on the internet"
      : policy.scope === "workspace"
        ? "Signed-in workspace members"
        : "Only visitors matching the rules";
  const count = policy.rules.length;
  return count > 0
    ? `${base} · ${count} rule${count === 1 ? "" : "s"}`
    : base;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// --- IP helpers -----------------------------------------------------------

export function parseIp(value: string): { version: 4 | 6; bits: bigint } | null {
  const v = value.trim().toLowerCase();
  if (v.includes(":")) {
    return parseIpv6(v);
  }
  const parts = v.split(".");
  if (parts.length !== 4) return null;
  let bits = BigInt(0);
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    bits = (bits << BigInt(8)) | BigInt(n);
  }
  return { version: 4, bits };
}

function parseIpv6(value: string): { version: 6; bits: bigint } | null {
  let v = value;
  // Expand an embedded IPv4 tail (::ffff:192.0.2.1) into two groups.
  const v4Tail = v.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Tail) {
    const v4 = parseIp(v4Tail[1]);
    if (!v4) return null;
    const hi = Number((v4.bits >> BigInt(16)) & BigInt(0xffff)).toString(16);
    const lo = Number(v4.bits & BigInt(0xffff)).toString(16);
    v = `${v.slice(0, v.length - v4Tail[1].length)}${hi}:${lo}`;
  }
  const halves = v.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 && left.length !== 8) return null;
  if (left.length + right.length > 8) return null;
  const missing = 8 - left.length - right.length;
  const groups = [...left, ...Array<string>(missing).fill("0"), ...right];
  if (groups.length !== 8) return null;
  let bits = BigInt(0);
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    bits = (bits << BigInt(16)) | BigInt(parseInt(group, 16));
  }
  return { version: 6, bits };
}

export function parseCidr(
  value: string,
): { version: 4 | 6; bits: bigint; prefix: number } | null {
  const [addr, prefixRaw, ...rest] = value.trim().split("/");
  if (rest.length > 0 || prefixRaw === undefined || !/^\d+$/.test(prefixRaw)) {
    return null;
  }
  const ip = parseIp(addr);
  if (!ip) return null;
  const prefix = Number(prefixRaw);
  const max = ip.version === 4 ? 32 : 128;
  if (prefix > max) return null;
  return { ...ip, prefix };
}

function ipInCidr(ipValue: string, cidrValue: string): boolean {
  const ip = parseIp(ipValue);
  const cidr = parseCidr(cidrValue);
  if (!ip || !cidr || ip.version !== cidr.version) return false;
  const total = ip.version === 4 ? BigInt(32) : BigInt(128);
  const shift = total - BigInt(cidr.prefix);
  return ip.bits >> shift === cidr.bits >> shift;
}

// --- Validation / normalization ------------------------------------------

const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function isDomainValue(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v || v.length > 253 || !v.includes(".")) return false;
  return v.split(".").every((label) => DOMAIN_LABEL.test(label));
}

function ruleValueError(rule: AccessRule): string | null {
  const value = rule.value.trim();
  if (rule.type !== "authenticated" && !value) {
    return "Give every access rule a value.";
  }
  if (value.length > MAX_RULE_VALUE) {
    return `Keep each access rule value under ${MAX_RULE_VALUE} characters.`;
  }
  switch (rule.type) {
    case "ip":
      return parseIp(value) ? null : `"${value}" is not an IP address.`;
    case "cidr":
      return parseCidr(value)
        ? null
        : `"${value}" is not a CIDR range like 203.0.113.0/24.`;
    case "network":
      return (ACCESS_NETWORKS as readonly string[]).includes(value.toLowerCase())
        ? null
        : "Network must be tailnet, local or vpn.";
    case "email":
      return isValidEmail(value) ? null : `"${value}" is not an email address.`;
    case "emailDomain":
      return isDomainValue(value) ? null : `"${value}" is not a domain like partner.example.`;
    case "country":
      return /^[A-Za-z]{2}$/.test(value)
        ? null
        : `"${value}" is not a two-letter country code.`;
    case "schedule":
      return Number.isNaN(Date.parse(value))
        ? `"${value}" is not a date or datetime.`
        : null;
    default:
      return null;
  }
}

/** First validation error for a policy, or null when it is usable. */
export function validateAccessPolicy(policy: AccessPolicy): string | null {
  if (!isAccessScope(policy?.scope)) {
    return "Choose an access scope: public, workspace or restricted.";
  }
  if (!Array.isArray(policy.rules)) {
    return "Access rules must be a list.";
  }
  if (policy.rules.length > MAX_ACCESS_RULES) {
    return `Keep the access policy under ${MAX_ACCESS_RULES} rules.`;
  }
  for (const rule of policy.rules) {
    if (rule.effect !== "allow" && rule.effect !== "deny") {
      return "Each access rule must allow or deny.";
    }
    if (!isAccessRuleType(rule.type)) {
      return "Each access rule needs a known type.";
    }
    const error = ruleValueError(rule);
    if (error) return error;
  }
  if (
    policy.scope === "restricted" &&
    !policy.rules.some((rule) => rule.effect === "allow")
  ) {
    return "A restricted app needs at least one allow rule — otherwise nobody can reach it.";
  }
  return null;
}

/** Trim/case-normalize values, assign missing ids and drop duplicates. */
export function normalizeAccessPolicy(input: unknown): AccessPolicy {
  if (!isRecord(input) || !isAccessScope(input.scope)) {
    return defaultAccessPolicy();
  }
  const seen = new Set<string>();
  const rules: AccessRule[] = [];
  const rawRules = Array.isArray(input.rules) ? input.rules : [];
  for (const entry of rawRules) {
    if (!isRecord(entry) || !isAccessRuleType(entry.type)) continue;
    if (entry.effect !== "allow" && entry.effect !== "deny") continue;
    let value = typeof entry.value === "string" ? entry.value.trim() : "";
    if (
      entry.type === "email" ||
      entry.type === "emailDomain" ||
      entry.type === "network"
    ) {
      value = value.toLowerCase();
    }
    if (entry.type === "country") value = value.toUpperCase();
    const key = `${entry.effect}:${entry.type}:${value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rules.push({
      id:
        typeof entry.id === "string" && entry.id.trim()
          ? entry.id.trim()
          : `rule-${rules.length + 1}`,
      effect: entry.effect,
      type: entry.type,
      value,
    });
  }
  return {
    scope: input.scope,
    ...(input.requireAuth === true ? { requireAuth: true } : {}),
    rules,
  };
}

/** Parse a stored policy; undefined when absent or invalid (fail safe). */
export function parseAccessPolicy(value: unknown): AccessPolicy | undefined {
  if (!isRecord(value) || !isAccessScope(value.scope)) return undefined;
  const normalized = normalizeAccessPolicy(value);
  return validateAccessPolicy(normalized) === null ? normalized : undefined;
}

// --- Evaluation (proxy contract; enforcement lands with the adapter) ----

export interface AccessVisitor {
  ip?: string;
  email?: string;
  groups?: readonly string[];
  country?: string;
  /** Named network the request arrived from: tailnet, local or vpn. */
  network?: string;
  authenticated?: boolean;
  isWorkspaceMember?: boolean;
  apiKeyId?: string;
  clientCertSubject?: string;
  hasSignedLink?: boolean;
  now?: Date;
}

function ruleMatches(rule: AccessRule, visitor: AccessVisitor): boolean {
  const value = rule.value.trim();
  switch (rule.type) {
    case "ip":
      return Boolean(visitor.ip && parseIp(visitor.ip) && ipInCidr(visitor.ip, `${value}/${parseIp(value)?.version === 6 ? 128 : 32}`));
    case "cidr":
      return Boolean(visitor.ip && ipInCidr(visitor.ip, value));
    case "network":
      return visitor.network?.toLowerCase() === value.toLowerCase();
    case "email":
      return visitor.email?.trim().toLowerCase() === value.toLowerCase();
    case "emailDomain":
      return Boolean(
        visitor.email &&
          visitor.email.trim().toLowerCase().endsWith(`@${value.toLowerCase()}`),
      );
    case "group":
      return Boolean(
        visitor.groups?.some(
          (group) => group.trim().toLowerCase() === value.toLowerCase(),
        ),
      );
    case "authenticated":
      return visitor.authenticated === true;
    case "apiKey":
      // Value names the key id/label, never the secret itself.
      return visitor.apiKeyId === value;
    case "clientCert":
      return visitor.clientCertSubject === value;
    case "signedLink":
      return visitor.hasSignedLink === true;
    case "country":
      return visitor.country?.trim().toUpperCase() === value.toUpperCase();
    case "schedule": {
      const until = Date.parse(value);
      const now = (visitor.now ?? new Date()).getTime();
      return !Number.isNaN(until) && now <= until;
    }
    default:
      return false;
  }
}

export interface AccessDecision {
  allowed: boolean;
  reason: string;
}

/** Allow when no deny matches and the scope/allow rules are satisfied. */
export function evaluateAccess(
  policy: AccessPolicy,
  visitor: AccessVisitor,
): AccessDecision {
  const deny = policy.rules.find(
    (rule) => rule.effect === "deny" && ruleMatches(rule, visitor),
  );
  if (deny) return { allowed: false, reason: `Blocked by deny rule (${deny.type}).` };
  if (policy.scope === "public") return { allowed: true, reason: "Public app." };
  if (policy.requireAuth && !visitor.authenticated) {
    return { allowed: false, reason: "Sign-in required." };
  }
  if (policy.scope === "workspace") {
    return visitor.authenticated && visitor.isWorkspaceMember
      ? { allowed: true, reason: "Workspace member." }
      : { allowed: false, reason: "Workspace members only." };
  }
  const allow = policy.rules.find(
    (rule) => rule.effect === "allow" && ruleMatches(rule, visitor),
  );
  return allow
    ? { allowed: true, reason: `Allowed by ${allow.type} rule.` }
    : { allowed: false, reason: "No allow rule matched." };
}
