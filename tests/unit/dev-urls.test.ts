import type { App, AppEnvironment, Node } from "@/lib/control-plane";
import { listApps, listNodes } from "@/lib/control-plane";
import { defaultWorkspaceSettings } from "@/lib/settings";
import {
  MAX_DNS_LABEL,
  TAILNET_PORT_MIN,
  TAILNET_PORT_RANGE,
  isDomainZone,
  isHostname,
  resolveEnvUrl,
  tailnetPort,
  toDnsLabel,
  type ResolveContext,
} from "@/lib/dev-urls";

const publicNode: Node = {
  slug: "coolify-frankfurt",
  name: "frankfurt-01",
  kind: "Coolify",
  location: "Frankfurt",
  status: "healthy",
  domainZone: "frankfurt-01.byov.xexo.io",
  dnsScenario: "public",
};

const qaNode: Node = {
  slug: "coolify-qa-lab",
  name: "qa-lab-01",
  kind: "Coolify",
  location: "QA lab",
  status: "healthy",
  domainZone: "qa-lab-01.byov.xexo.io",
  dnsScenario: "public",
};

const bareNode: Node = {
  slug: "bare-01",
  name: "bare-01",
  kind: "Coolify",
  location: "Nowhere",
  status: "healthy",
  dnsScenario: "public",
};

const devZoneNode: Node = {
  ...qaNode,
  domainZone: "dev.byov.xexo.io",
};

const localNode: Node = {
  ...qaNode,
  domainZone: "qa-lab-01.byov.internal",
  dnsScenario: "local",
};

const tailnetNode: Node = {
  slug: "coolify-tailnet",
  name: "tail-01",
  kind: "Coolify",
  location: "Branch office",
  status: "healthy",
  dnsScenario: "tailnet",
  tailnetHost: "tail-01",
};

function env(name: string, node: string, url?: string): AppEnvironment {
  return { name, node, status: "healthy", ...(url ? { url } : {}) };
}

function appOn(slug: string, envName: string, node: string): App {
  return {
    slug,
    name: slug,
    stack: "Next.js App",
    description: "",
    checks: [],
    envs: [env(envName, node)],
    deployments: [],
  };
}

function ctx(partial: Partial<ResolveContext> = {}): ResolveContext {
  return {
    nodes: [],
    apps: [],
    devZone: "",
    tailnetDomain: "",
    ...partial,
  };
}

describe("toDnsLabel", () => {
  it("lowercases, dashes and trims free text", () => {
    expect(toDnsLabel("Shopfloor Tickets")).toBe("shopfloor-tickets");
    expect(toDnsLabel("  QA_Lab! ")).toBe("qa-lab");
  });

  it("returns an empty label for symbol-only text", () => {
    expect(toDnsLabel("!!!")).toBe("");
  });

  it("truncates to the DNS label limit without a trailing dash", () => {
    const label = toDnsLabel(`${"a".repeat(60)}-suffix`);
    expect(label.length).toBeLessThanOrEqual(MAX_DNS_LABEL);
    expect(label).not.toMatch(/-$/);
    expect(label).toBe(`${"a".repeat(60)}-su`);
  });
});

describe("isHostname", () => {
  it("accepts a single label", () => {
    expect(isHostname("qa-lab-01")).toBe(true);
    expect(isHostname("  Tail-01 ")).toBe(true);
  });

  it("rejects dots, spaces and overlong labels", () => {
    expect(isHostname("qa.lab.01")).toBe(false);
    expect(isHostname("qa lab")).toBe(false);
    expect(isHostname("")).toBe(false);
    expect(isHostname("a".repeat(64))).toBe(false);
  });
});

describe("isDomainZone", () => {
  it("accepts a plain multi-label zone", () => {
    expect(isDomainZone("qa-lab-01.byov.xexo.io")).toBe(true);
    expect(isDomainZone("  DEV.byov.xexo.io  ")).toBe(true);
  });

  it("rejects schemes, wildcards, spaces and bare hostnames", () => {
    expect(isDomainZone("https://qa-lab-01.byov.xexo.io")).toBe(false);
    expect(isDomainZone("*.qa-lab-01.byov.xexo.io")).toBe(false);
    expect(isDomainZone("qa lab.byov.xexo.io")).toBe(false);
    expect(isDomainZone("localhost")).toBe(false);
    expect(isDomainZone("")).toBe(false);
  });

  it("rejects overlong zones and labels", () => {
    expect(isDomainZone(`${"a".repeat(64)}.example.com`)).toBe(false);
    expect(isDomainZone(`a.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}.${"e".repeat(57)}.io`)).toBe(false);
  });
});

describe("tailnetPort", () => {
  it("is deterministic and stays in range", () => {
    const first = tailnetPort("shopfloor-tickets", "staging", []);
    expect(tailnetPort("shopfloor-tickets", "staging", [])).toBe(first);
    expect(first).toBeGreaterThanOrEqual(TAILNET_PORT_MIN);
    expect(first).toBeLessThan(TAILNET_PORT_MIN + TAILNET_PORT_RANGE);
  });

  it("probes past taken ports and wraps around", () => {
    const base = tailnetPort("shopfloor-tickets", "staging", []);
    expect(tailnetPort("shopfloor-tickets", "staging", [base])).toBe(
      TAILNET_PORT_MIN +
        ((base - TAILNET_PORT_MIN + 1) % TAILNET_PORT_RANGE),
    );
  });
});

describe("resolveEnvUrl", () => {
  it("renders the default app-env pattern under the node zone", () => {
    expect(
      resolveEnvUrl(
        "shopfloor-tickets",
        env("staging", qaNode.slug),
        ctx({ nodes: [qaNode] }),
      ),
    ).toEqual({
      url: "https://shopfloor-tickets-staging.qa-lab-01.byov.xexo.io",
      source: "node-zone",
      warning: undefined,
    });
  });

  it("prefers an explicit URL override, even on an unknown node", () => {
    expect(
      resolveEnvUrl(
        "shopfloor-tickets",
        env("production", "gone", "https://shopfloor.example.com"),
        ctx({ nodes: [qaNode] }),
      ),
    ).toEqual({
      url: "https://shopfloor.example.com",
      source: "override",
      warning: undefined,
    });
  });

  it("reports a missing zone for unknown nodes", () => {
    const resolved = resolveEnvUrl(
      "shopfloor-tickets",
      env("staging", "gone"),
      ctx({ nodes: [qaNode] }),
    );
    expect(resolved.url).toBeNull();
    expect(resolved.source).toBe("missing-zone");
    expect(resolved.warning).toContain("gone");
  });

  it("reports a missing zone for nodes without one", () => {
    const resolved = resolveEnvUrl(
      "shopfloor-tickets",
      env("staging", bareNode.slug),
      ctx({ nodes: [bareNode] }),
    );
    expect(resolved.url).toBeNull();
    expect(resolved.source).toBe("missing-zone");
    expect(resolved.warning).toContain("bare-01");
  });

  it("renders the short dev-zone variant on the zone-serving node", () => {
    expect(
      resolveEnvUrl(
        "invoice-triage",
        env("development", devZoneNode.slug),
        ctx({ nodes: [devZoneNode], devZone: "dev.byov.xexo.io" }),
      ),
    ).toEqual({
      url: "https://invoice-triage.dev.byov.xexo.io",
      source: "dev-zone",
      warning: undefined,
    });
  });

  it("warns when a development env sits outside the dev zone", () => {
    const resolved = resolveEnvUrl(
      "invoice-triage",
      env("development", qaNode.slug),
      ctx({ nodes: [qaNode], devZone: "dev.byov.xexo.io" }),
    );
    expect(resolved.url).toBe(
      "https://invoice-triage-development.qa-lab-01.byov.xexo.io",
    );
    expect(resolved.source).toBe("node-zone");
    expect(resolved.warning).toContain("dev.byov.xexo.io");
    expect(resolved.warning).toContain("qa-lab-01");
  });

  it("leaves other envs alone when a dev zone is set", () => {
    const resolved = resolveEnvUrl(
      "invoice-triage",
      env("staging", qaNode.slug),
      ctx({ nodes: [qaNode], devZone: "dev.byov.xexo.io" }),
    );
    expect(resolved.source).toBe("node-zone");
    expect(resolved.warning).toBeUndefined();
  });

  it("treats a blank or invalid dev zone as off", () => {
    for (const devZone of ["", "   ", "localhost", "*.dev.byov.xexo.io"]) {
      const resolved = resolveEnvUrl(
        "invoice-triage",
        env("development", devZoneNode.slug),
        ctx({ nodes: [devZoneNode], devZone }),
      );
      expect(resolved.source).toBe("node-zone");
      expect(resolved.warning).toBeUndefined();
    }
  });

  it("truncates overlong app-env labels to the DNS limit", () => {
    const resolved = resolveEnvUrl(
      "a".repeat(50),
      env("b".repeat(50), qaNode.slug),
      ctx({ nodes: [qaNode] }),
    );
    const host = new URL(resolved.url!).hostname;
    expect(host.split(".")[0].length).toBeLessThanOrEqual(MAX_DNS_LABEL);
  });

  it("slugifies display-style app and env names", () => {
    expect(
      resolveEnvUrl(
        "Shopfloor Tickets",
        env("Staging", qaNode.slug),
        ctx({ nodes: [qaNode] }),
      ).url,
    ).toBe("https://shopfloor-tickets-staging.qa-lab-01.byov.xexo.io");
  });

  it("falls back to a placeholder host for symbol-only names", () => {
    expect(
      resolveEnvUrl("!!!", env("???", qaNode.slug), ctx({ nodes: [qaNode] })).url,
    ).toBe("https://env.qa-lab-01.byov.xexo.io");
    expect(
      resolveEnvUrl(
        "!!!",
        env("development", devZoneNode.slug),
        ctx({ nodes: [devZoneNode], devZone: "dev.byov.xexo.io" }),
      ).url,
    ).toBe("https://app.dev.byov.xexo.io");
  });

  it("renders local envs under the node zone without the dev variant", () => {
    const resolved = resolveEnvUrl(
      "invoice-triage",
      env("development", localNode.slug),
      ctx({ nodes: [localNode], devZone: "dev.byov.xexo.io" }),
    );
    expect(resolved.url).toBe(
      "https://invoice-triage-development.qa-lab-01.byov.internal",
    );
    expect(resolved.source).toBe("local-zone");
    expect(resolved.warning).toBeUndefined();
  });

  it("renders tailnet envs on the node name with a stable port", () => {
    const apps = [appOn("invoice-triage", "staging", tailnetNode.slug)];
    const first = resolveEnvUrl(
      "invoice-triage",
      env("staging", tailnetNode.slug),
      ctx({ nodes: [tailnetNode], apps, tailnetDomain: "yak-bebop.ts.net" }),
    );
    expect(first.source).toBe("tailnet");
    expect(first.warning).toBeUndefined();
    expect(first.url).toMatch(
      /^https:\/\/tail-01\.yak-bebop\.ts\.net:\d+$/,
    );
    const second = resolveEnvUrl(
      "invoice-triage",
      env("staging", tailnetNode.slug),
      ctx({ nodes: [tailnetNode], apps, tailnetDomain: "yak-bebop.ts.net" }),
    );
    expect(second.url).toBe(first.url);
  });

  it("gives colliding tailnet envs distinct ports", () => {
    const apps = [
      appOn("invoice-triage", "staging", tailnetNode.slug),
      appOn("lab-inventory", "staging", tailnetNode.slug),
    ];
    const context = ctx({
      nodes: [tailnetNode],
      apps,
      tailnetDomain: "yak-bebop.ts.net",
    });
    const first = resolveEnvUrl(
      "invoice-triage",
      env("staging", tailnetNode.slug),
      context,
    );
    const second = resolveEnvUrl(
      "lab-inventory",
      env("staging", tailnetNode.slug),
      context,
    );
    expect(first.url).toBeTruthy();
    expect(second.url).toBeTruthy();
    expect(first.url).not.toBe(second.url);
  });

  it("guides tailnet setup when the host or domain is missing", () => {
    const noHost = resolveEnvUrl(
      "invoice-triage",
      env("staging", bareNode.slug),
      ctx({
        nodes: [{ ...bareNode, dnsScenario: "tailnet" }],
        tailnetDomain: "yak-bebop.ts.net",
      }),
    );
    expect(noHost.url).toBeNull();
    expect(noHost.warning).toContain("bare-01");
    const noDomain = resolveEnvUrl(
      "invoice-triage",
      env("staging", tailnetNode.slug),
      ctx({ nodes: [tailnetNode] }),
    );
    expect(noDomain.url).toBeNull();
    expect(noDomain.warning).toContain("tailnet domain");
  });

  it("resolves every sample environment to a URL", () => {
    const nodes = listNodes();
    const apps = listApps();
    const { devZone, tailnetDomain } = defaultWorkspaceSettings();
    const sources: Record<string, number> = {};
    for (const app of apps) {
      for (const appEnv of app.envs) {
        const resolved = resolveEnvUrl(app.slug, appEnv, {
          nodes,
          apps,
          devZone,
          tailnetDomain,
        });
        expect(resolved.url).toBeTruthy();
        sources[resolved.source] = (sources[resolved.source] ?? 0) + 1;
      }
    }
    expect(sources).toEqual({
      override: 1,
      "node-zone": 4,
      "local-zone": 4,
    });
  });
});
