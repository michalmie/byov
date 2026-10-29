import {
  appHealth,
  appSections,
  fleetSummary,
  fleetSummaryFor,
  getApp,
  getNode,
  healthLabel,
  listApps,
  listNodes,
} from "@/lib/control-plane";

describe("getApp", () => {
  it("returns the app for a known slug", () => {
    expect(getApp("shopfloor-tickets")?.name).toBe("Shopfloor Tickets");
  });

  it("returns undefined for an unknown slug", () => {
    expect(getApp("no-such-app")).toBeUndefined();
  });
});

describe("getNode", () => {
  it("returns the node for a known slug", () => {
    expect(getNode("coolify-frankfurt")?.name).toBe("frankfurt-01");
  });

  it("returns undefined for an unknown slug", () => {
    expect(getNode("no-such-node")).toBeUndefined();
  });
});

describe("appHealth", () => {
  it("reports healthy when every env and check is green", () => {
    const app = getApp("shopfloor-tickets");
    expect(app).toBeDefined();
    expect(appHealth(app!)).toBe("healthy");
  });

  it("reports degraded when a check fails", () => {
    const app = getApp("leave-balancer");
    expect(app).toBeDefined();
    expect(appHealth(app!)).toBe("degraded");
  });

  it("reports deploying while an env is rolling out", () => {
    const app = getApp("lab-inventory");
    expect(app).toBeDefined();
    expect(appHealth(app!)).toBe("deploying");
  });

  it("flags attention when an env sits on a pending node", () => {
    const app = getApp("shopfloor-tickets");
    expect(app).toBeDefined();
    const pending = {
      ...app!,
      envs: app!.envs.map((env, index) =>
        index === 0 ? { ...env, status: "pending" as const } : env,
      ),
    };
    expect(appHealth(pending)).toBe("degraded");
  });

  it("prefers down over every other status", () => {
    const app = getApp("shopfloor-tickets");
    expect(app).toBeDefined();
    const down = {
      ...app!,
      envs: app!.envs.map((env, index) =>
        index === 0 ? { ...env, status: "down" as const } : env,
      ),
    };
    expect(appHealth(down)).toBe("down");
  });
});

describe("fleetSummary", () => {
  it("counts apps, nodes and deployments", () => {
    const summary = fleetSummary();
    expect(summary.apps).toBe(listApps().length);
    expect(summary.nodes).toBe(listNodes().length);
    expect(summary.deployments).toBe(
      listApps().reduce(
        (total, app) => total + app.deployments.length,
        0,
      ),
    );
  });

  it("splits healthy from attention consistently", () => {
    const summary = fleetSummary();
    expect(summary.healthy + summary.attention).toBe(summary.apps);
    expect(summary.attention).toBeGreaterThan(0);
  });
});

describe("healthLabel", () => {
  it("labels every health state in words", () => {
    expect(healthLabel("healthy")).toBe("Healthy");
    expect(healthLabel("deploying")).toBe("Deploying");
    expect(healthLabel("degraded")).toBe("Degraded");
    expect(healthLabel("down")).toBe("Down");
    expect(healthLabel("pending")).toBe("Pending");
  });
});

describe("fleetSummaryFor", () => {
  it("matches fleetSummary over the sample dataset", () => {
    expect(fleetSummaryFor(listApps(), listNodes())).toEqual(
      fleetSummary(),
    );
  });

  it("counts a caller-supplied node list", () => {
    const summary = fleetSummaryFor(listApps(), [
      ...listNodes(),
      {
        slug: "extra",
        name: "extra",
        kind: "Coolify",
        location: "Berlin",
        status: "pending",
      },
    ]);
    expect(summary.nodes).toBe(listNodes().length + 1);
    expect(summary.apps).toBe(listApps().length);
  });
});

describe("appSections", () => {
  it("lists the five detail anchors starting with overview", () => {
    expect(appSections.map((section) => section.id)).toEqual([
      "overview",
      "agent-prompt",
      "environments",
      "deployments",
      "checks",
    ]);
  });

  it("labels every section", () => {
    for (const section of appSections) {
      expect(section.label.length).toBeGreaterThan(0);
    }
  });
});
