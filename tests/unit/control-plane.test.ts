import {
  fleetSummary,
  getNode,
  getProject,
  healthLabel,
  listNodes,
  listProjects,
  projectHealth,
} from "@/lib/control-plane";

describe("getProject", () => {
  it("returns the project for a known slug", () => {
    expect(getProject("shopfloor-tickets")?.name).toBe("Shopfloor Tickets");
  });

  it("returns undefined for an unknown slug", () => {
    expect(getProject("no-such-project")).toBeUndefined();
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

describe("projectHealth", () => {
  it("reports healthy when every env and check is green", () => {
    const project = getProject("shopfloor-tickets");
    expect(project).toBeDefined();
    expect(projectHealth(project!)).toBe("healthy");
  });

  it("reports degraded when a check fails", () => {
    const project = getProject("leave-balancer");
    expect(project).toBeDefined();
    expect(projectHealth(project!)).toBe("degraded");
  });

  it("reports deploying while an env is rolling out", () => {
    const project = getProject("lab-inventory");
    expect(project).toBeDefined();
    expect(projectHealth(project!)).toBe("deploying");
  });

  it("prefers down over every other status", () => {
    const project = getProject("shopfloor-tickets");
    expect(project).toBeDefined();
    const down = {
      ...project!,
      envs: project!.envs.map((env, index) =>
        index === 0 ? { ...env, status: "down" as const } : env,
      ),
    };
    expect(projectHealth(down)).toBe("down");
  });
});

describe("fleetSummary", () => {
  it("counts projects, nodes and deployments", () => {
    const summary = fleetSummary();
    expect(summary.projects).toBe(listProjects().length);
    expect(summary.nodes).toBe(listNodes().length);
    expect(summary.deployments).toBe(
      listProjects().reduce(
        (total, project) => total + project.deployments.length,
        0,
      ),
    );
  });

  it("splits healthy from attention consistently", () => {
    const summary = fleetSummary();
    expect(summary.healthy + summary.attention).toBe(summary.projects);
    expect(summary.attention).toBeGreaterThan(0);
  });
});

describe("healthLabel", () => {
  it("labels every health state in words", () => {
    expect(healthLabel("healthy")).toBe("Healthy");
    expect(healthLabel("deploying")).toBe("Deploying");
    expect(healthLabel("degraded")).toBe("Degraded");
    expect(healthLabel("down")).toBe("Down");
  });
});
