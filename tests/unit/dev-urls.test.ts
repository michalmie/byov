import type { AppEnvironment, Node } from "@/lib/control-plane";
import { listApps, listNodes } from "@/lib/control-plane";
import { defaultWorkspaceSettings } from "@/lib/settings";
import {
  MAX_DNS_LABEL,
  isDomainZone,
  resolveEnvUrl,
  toDnsLabel,
} from "@/lib/dev-urls";

const qaNode: Node = {
  slug: "coolify-qa-lab",
  name: "qa-lab-01",
  kind: "Coolify",
  location: "QA lab",
  status: "healthy",
  domainZone: "qa-lab-01.byov.xexo.io",
};

const bareNode: Node = {
  slug: "bare-01",
  name: "bare-01",
  kind: "Coolify",
  location: "Nowhere",
  status: "healthy",
};

const devZoneNode: Node = {
  ...qaNode,
  domainZone: "dev.byov.xexo.io",
};

function env(name: string, node: string, url?: string): AppEnvironment {
  return { name, node, status: "healthy", ...(url ? { url } : {}) };
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

describe("resolveEnvUrl", () => {
  it("renders the default app-env pattern under the node zone", () => {
    expect(
      resolveEnvUrl("shopfloor-tickets", env("staging", qaNode.slug), [qaNode], ""),
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
        [qaNode],
        "",
      ),
    ).toEqual({
      url: "https://shopfloor.example.com",
      source: "override",
      warning: undefined,
    });
  });

  it("reports a missing zone for unknown nodes", () => {
    expect(
      resolveEnvUrl("shopfloor-tickets", env("staging", "gone"), [qaNode], ""),
    ).toEqual({ url: null, source: "missing-zone", warning: undefined });
  });

  it("reports a missing zone for nodes without one", () => {
    expect(
      resolveEnvUrl("shopfloor-tickets", env("staging", bareNode.slug), [bareNode], ""),
    ).toEqual({ url: null, source: "missing-zone", warning: undefined });
  });

  it("renders the short dev-zone variant on the zone-serving node", () => {
    expect(
      resolveEnvUrl(
        "invoice-triage",
        env("development", devZoneNode.slug),
        [devZoneNode],
        "dev.byov.xexo.io",
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
      [qaNode],
      "dev.byov.xexo.io",
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
      [qaNode],
      "dev.byov.xexo.io",
    );
    expect(resolved.source).toBe("node-zone");
    expect(resolved.warning).toBeUndefined();
  });

  it("treats a blank or invalid dev zone as off", () => {
    for (const devZone of ["", "   ", "localhost", "*.dev.byov.xexo.io"]) {
      const resolved = resolveEnvUrl(
        "invoice-triage",
        env("development", devZoneNode.slug),
        [devZoneNode],
        devZone,
      );
      expect(resolved.source).toBe("node-zone");
      expect(resolved.warning).toBeUndefined();
    }
  });

  it("truncates overlong app-env labels to the DNS limit", () => {
    const resolved = resolveEnvUrl(
      "a".repeat(50),
      env("b".repeat(50), qaNode.slug),
      [qaNode],
      "",
    );
    const host = new URL(resolved.url!).hostname;
    expect(host.split(".")[0].length).toBeLessThanOrEqual(MAX_DNS_LABEL);
  });

  it("slugifies display-style app and env names", () => {
    expect(
      resolveEnvUrl("Shopfloor Tickets", env("Staging", qaNode.slug), [qaNode], "").url,
    ).toBe("https://shopfloor-tickets-staging.qa-lab-01.byov.xexo.io");
  });

  it("falls back to a placeholder host for symbol-only names", () => {
    expect(
      resolveEnvUrl("!!!", env("???", qaNode.slug), [qaNode], "").url,
    ).toBe("https://env.qa-lab-01.byov.xexo.io");
    expect(
      resolveEnvUrl("!!!", env("development", devZoneNode.slug), [devZoneNode], "dev.byov.xexo.io")
        .url,
    ).toBe("https://app.dev.byov.xexo.io");
  });

  it("resolves every sample environment to a URL", () => {
    const nodes = listNodes();
    const { devZone } = defaultWorkspaceSettings();
    let overrides = 0;
    for (const app of listApps()) {
      for (const appEnv of app.envs) {
        const resolved = resolveEnvUrl(app.slug, appEnv, nodes, devZone);
        expect(resolved.url).toBeTruthy();
        if (resolved.source === "override") {
          overrides += 1;
        } else {
          expect(resolved.source).toBe("node-zone");
        }
      }
    }
    expect(overrides).toBe(1);
  });
});
