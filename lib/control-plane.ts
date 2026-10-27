// Sample dataset for the Control Plane UI. Real API wiring lands
// later; every figure on screen is computed from this module so tests can
// pin the roll-up logic.

export type Health = "healthy" | "deploying" | "degraded" | "down" | "pending";

export type CheckStatus = "pass" | "fail" | "running";

export interface Check {
  name: string;
  type: string;
  cadence: string;
  status: CheckStatus;
}

export interface AppEnvironment {
  name: string;
  node: string;
  status: Health;
  /** Explicit URL; when blank the dev-URL contract generates one. */
  url?: string;
}

export interface Deployment {
  id: string;
  env: string;
  status: "live" | "failed" | "running";
  when: string;
  by: string;
}

export interface App {
  slug: string;
  name: string;
  stack: string;
  description: string;
  checks: Check[];
  envs: AppEnvironment[];
  deployments: Deployment[];
}

/** How a node serves environment URLs. */
export const DNS_SCENARIOS = ["public", "tailnet", "local"] as const;
export type DnsScenario = (typeof DNS_SCENARIOS)[number];

export function isDnsScenario(value: unknown): value is DnsScenario {
  return (
    typeof value === "string" &&
    (DNS_SCENARIOS as readonly string[]).includes(value)
  );
}

export interface Node {
  slug: string;
  name: string;
  kind: string;
  location: string;
  status: Health;
  /** Where the control plane reaches the node; blank until configured. */
  endpoint?: string;
  /** DNS zone the node serves env URLs under; blank until configured. */
  domainZone?: string;
  /** DNS scenario for this node's env URLs. */
  dnsScenario: DnsScenario;
  /** Machine name as known on the tailnet (tailnet scenario). */
  tailnetHost?: string;
}

export interface ActivityItem {
  when: string;
  actor: string;
  text: string;
}

const standardChecks: Check[] = [
  { name: "Unit tests", type: "unit", cadence: "Every change", status: "pass" },
  { name: "Lint", type: "gate", cadence: "Every change", status: "pass" },
  { name: "Production build", type: "gate", cadence: "Every change", status: "pass" },
  { name: "DLP scan", type: "gate", cadence: "Every change", status: "pass" },
  { name: "Dependency audit", type: "gate", cadence: "Nightly", status: "pass" },
];

function withCheck(name: string, status: CheckStatus): Check[] {
  return standardChecks.map((check) =>
    check.name === name ? { ...check, status } : check,
  );
}

const apps: App[] = [
  {
    slug: "shopfloor-tickets",
    name: "Shopfloor Tickets",
    stack: "Next.js App",
    description:
      "Maintenance requests from the factory floor, triaged in one queue.",
    checks: standardChecks,
    envs: [
      {
        name: "production",
        node: "coolify-frankfurt",
        status: "healthy",
        url: "https://shopfloor.apps.byov.internal",
      },
      {
        name: "staging",
        node: "coolify-frankfurt",
        status: "healthy",
      },
      {
        name: "development",
        node: "coolify-qa-lab",
        status: "healthy",
      },
    ],
    deployments: [
      { id: "dpl_8f3k2", env: "production", status: "live", when: "12 min ago", by: "Maya Okonkwo" },
      { id: "dpl_8f1q9", env: "staging", status: "live", when: "2 h ago", by: "Sam Tan" },
      { id: "dpl_8e7m4", env: "production", status: "live", when: "Yesterday", by: "Maya Okonkwo" },
    ],
  },
  {
    slug: "leave-balancer",
    name: "Leave Balancer",
    stack: "Next.js App",
    description: "Time-off planning without the spreadsheet.",
    checks: withCheck("DLP scan", "fail"),
    envs: [
      {
        name: "production",
        node: "coolify-frankfurt",
        status: "degraded",
      },
      {
        name: "staging",
        node: "coolify-frankfurt",
        status: "healthy",
      },
    ],
    deployments: [
      { id: "dpl_7z2t8", env: "production", status: "failed", when: "48 min ago", by: "Elena Ruiz" },
      { id: "dpl_7z1p5", env: "staging", status: "live", when: "3 h ago", by: "Elena Ruiz" },
    ],
  },
  {
    slug: "invoice-triage",
    name: "Invoice Triage",
    stack: "Next.js App",
    description: "Finance inbox helper that sorts supplier invoices.",
    checks: standardChecks,
    envs: [
      {
        name: "production",
        node: "coolify-frankfurt",
        status: "healthy",
      },
      {
        name: "development",
        node: "coolify-qa-lab",
        status: "healthy",
      },
    ],
    deployments: [
      { id: "dpl_6k9w1", env: "production", status: "live", when: "5 h ago", by: "Sam Tan" },
    ],
  },
  {
    slug: "lab-inventory",
    name: "Lab Inventory",
    stack: "Next.js App",
    description: "Reagent and sample tracking for the QA lab.",
    checks: withCheck("Production build", "running"),
    envs: [
      {
        name: "staging",
        node: "coolify-qa-lab",
        status: "deploying",
      },
      {
        name: "development",
        node: "coolify-qa-lab",
        status: "healthy",
      },
    ],
    deployments: [
      { id: "dpl_5p4d6", env: "staging", status: "running", when: "4 min ago", by: "Maya Okonkwo" },
    ],
  },
];

const nodes: Node[] = [
  {
    slug: "coolify-frankfurt",
    name: "frankfurt-01",
    kind: "Coolify",
    location: "Frankfurt",
    status: "healthy",
    domainZone: "frankfurt-01.byov.xexo.io",
    dnsScenario: "public",
  },
  {
    slug: "coolify-qa-lab",
    name: "qa-lab-01",
    kind: "Coolify",
    location: "QA lab",
    status: "healthy",
    domainZone: "qa-lab-01.byov.internal",
    dnsScenario: "local",
  },
];

const activity: ActivityItem[] = [
  { when: "4 min ago", actor: "Maya Okonkwo", text: "started a staging deploy of Lab Inventory" },
  { when: "12 min ago", actor: "Maya Okonkwo", text: "shipped Shopfloor Tickets to production" },
  { when: "48 min ago", actor: "BYOV", text: "blocked a Leave Balancer deploy — the DLP scan failed" },
  { when: "2 h ago", actor: "Sam Tan", text: "promoted Shopfloor Tickets to staging" },
  { when: "3 h ago", actor: "Elena Ruiz", text: "shipped Leave Balancer to staging" },
  { when: "5 h ago", actor: "Sam Tan", text: "shipped Invoice Triage to production" },
];

export function listApps(): App[] {
  return apps;
}

export function getApp(slug: string): App | undefined {
  return apps.find((app) => app.slug === slug);
}

export function listNodes(): Node[] {
  return nodes;
}

export function getNode(slug: string): Node | undefined {
  return nodes.find((node) => node.slug === slug);
}

export function recentActivity(): ActivityItem[] {
  return activity;
}

/** Roll app health up from environments and checks. */
export function appHealth(app: App): Health {
  const statuses = app.envs.map((env) => env.status);
  if (statuses.includes("down")) {
    return "down";
  }
  if (
    statuses.includes("degraded") ||
    // An env on a never-contacted node cannot serve traffic yet.
    statuses.includes("pending") ||
    app.checks.some((check) => check.status === "fail")
  ) {
    return "degraded";
  }
  if (
    statuses.includes("deploying") ||
    app.checks.some((check) => check.status === "running")
  ) {
    return "deploying";
  }
  return "healthy";
}

export interface FleetSummary {
  apps: number;
  nodes: number;
  healthy: number;
  attention: number;
  deployments: number;
}

export function fleetSummary(): FleetSummary {
  return fleetSummaryFor(apps, nodes);
}

/** Same roll-up over caller-supplied lists (e.g. managed nodes). */
export function fleetSummaryFor(
  appList: App[],
  nodeList: Node[],
): FleetSummary {
  const health = appList.map(appHealth);
  return {
    apps: appList.length,
    nodes: nodeList.length,
    healthy: health.filter((value) => value === "healthy").length,
    attention: health.filter((value) => value !== "healthy").length,
    deployments: appList.reduce(
      (total, app) => total + app.deployments.length,
      0,
    ),
  };
}

const healthLabels: Record<Health, string> = {
  healthy: "Healthy",
  deploying: "Deploying",
  degraded: "Degraded",
  down: "Down",
  pending: "Pending",
};

export function healthLabel(health: Health): string {
  return healthLabels[health];
}

export interface AppSection {
  id: string;
  label: string;
}

/** Anchor sections of the app detail page (level-2 navigation). */
export const appSections: AppSection[] = [
  { id: "overview", label: "Overview" },
  { id: "environments", label: "Environments" },
  { id: "deployments", label: "Deployments" },
  { id: "checks", label: "Checks" },
];
