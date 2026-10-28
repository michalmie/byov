import {
  APPS_STORAGE_KEY,
  SANDBOX_ENV_NAME,
  buildApp,
  hasSandboxEnv,
  needsSandboxSetup,
  parseStoredApps,
  slugifyAppName,
  standardNewAppChecks,
  uniqueAppSlug,
  validateAppDraft,
  type AppDraft,
} from "@/lib/apps";
import { listApps, listNodes } from "@/lib/control-plane";
import { listStacks } from "@/lib/stacks";

const nodes = listNodes();
const stackSlugs = listStacks().map((stack) => stack.slug);

function draft(overrides: Partial<AppDraft> = {}): AppDraft {
  return {
    name: "Rota Planner",
    description: "Shift planning without the spreadsheet.",
    stack: stackSlugs[0],
    node: nodes[0].slug,
    ...overrides,
  };
}

describe("slugifyAppName", () => {
  it("collapses free text into a slug", () => {
    expect(slugifyAppName("  Rota Planner! ")).toBe("rota-planner");
  });

  it("returns an empty string when nothing slug-safe remains", () => {
    expect(slugifyAppName("!!!")).toBe("");
  });
});

describe("uniqueAppSlug", () => {
  it("keeps the base slug when it is free", () => {
    expect(uniqueAppSlug("Rota Planner", ["other-app"])).toBe("rota-planner");
  });

  it("suffixes until the slug is free", () => {
    expect(
      uniqueAppSlug("Rota Planner", ["rota-planner", "rota-planner-2"]),
    ).toBe("rota-planner-3");
  });

  it("falls back to app when the name has no slug-safe text", () => {
    expect(uniqueAppSlug("!!!", [])).toBe("app");
  });
});

describe("validateAppDraft", () => {
  it("accepts a complete draft", () => {
    expect(validateAppDraft(draft(), listApps(), nodes, stackSlugs)).toEqual(
      {},
    );
  });

  it("requires a name", () => {
    const errors = validateAppDraft(
      draft({ name: "  " }),
      listApps(),
      nodes,
      stackSlugs,
    );
    expect(errors.name).toMatch(/name/i);
  });

  it("rejects a name that clashes with an existing slug", () => {
    const errors = validateAppDraft(
      draft({ name: "Shopfloor Tickets" }),
      listApps(),
      nodes,
      stackSlugs,
    );
    expect(errors.name).toMatch(/already exists/);
  });

  it("rejects a name that clashes case-insensitively", () => {
    const errors = validateAppDraft(
      draft({ name: "shopfloor tickets" }),
      listApps(),
      nodes,
      stackSlugs,
    );
    expect(errors.name).toMatch(/already exists/);
  });

  it("requires a description", () => {
    const errors = validateAppDraft(
      draft({ description: "  " }),
      listApps(),
      nodes,
      stackSlugs,
    );
    expect(errors.description).toMatch(/description/i);
  });

  it("requires a known stack", () => {
    const errors = validateAppDraft(
      draft({ stack: "no-such-stack" }),
      listApps(),
      nodes,
      stackSlugs,
    );
    expect(errors.stack).toMatch(/stack/i);
  });

  it("requires a known node", () => {
    const errors = validateAppDraft(
      draft({ node: "no-such-node" }),
      listApps(),
      nodes,
      stackSlugs,
    );
    expect(errors.node).toMatch(/node/i);
  });
});

describe("buildApp", () => {
  it("creates one Sandbox environment on the chosen node", () => {
    const app = buildApp(draft(), listApps());
    expect(app.envs).toHaveLength(1);
    expect(app.envs[0]).toEqual({
      name: SANDBOX_ENV_NAME,
      node: nodes[0].slug,
      status: "pending",
    });
  });

  it("starts with no deployments and the governed checks", () => {
    const app = buildApp(draft(), listApps());
    expect(app.deployments).toEqual([]);
    expect(app.checks).toEqual(standardNewAppChecks());
    expect(app.checks.map((check) => check.name)).toEqual([
      "Unit tests",
      "Lint",
      "Production build",
      "DLP scan",
      "Dependency audit",
    ]);
  });

  it("derives a unique slug from the name", () => {
    const app = buildApp(draft({ name: "Shopfloor Tickets" }), listApps());
    expect(app.slug).toBe("shopfloor-tickets-2");
  });

  it("trims the name, description and stack", () => {
    const app = buildApp(
      draft({ name: "  Rota Planner ", description: "  Shifts. " }),
      listApps(),
    );
    expect(app.name).toBe("Rota Planner");
    expect(app.description).toBe("Shifts.");
  });
});

describe("sandbox helpers", () => {
  it("spots the Sandbox environment", () => {
    const app = buildApp(draft(), listApps());
    expect(hasSandboxEnv(app)).toBe(true);
    expect(hasSandboxEnv(listApps()[0])).toBe(false);
  });

  it("asks for setup until the first deployment lands", () => {
    const app = buildApp(draft(), listApps());
    expect(needsSandboxSetup(app)).toBe(true);
    expect(
      needsSandboxSetup({
        ...app,
        deployments: [
          { id: "dpl_1", env: "sandbox", status: "live", when: "now", by: "me" },
        ],
      }),
    ).toBe(false);
  });
});

describe("standardNewAppChecks", () => {
  it("passes nothing red before the first run", () => {
    for (const check of standardNewAppChecks()) {
      expect(check.status).toBe("pass");
    }
  });
});

describe("parseStoredApps", () => {
  it("round-trips a stored app", () => {
    const app = buildApp(draft(), listApps());
    expect(parseStoredApps(JSON.parse(JSON.stringify([app])))).toEqual([app]);
  });

  it("skips invalid entries but keeps the valid ones", () => {
    const app = buildApp(draft(), listApps());
    expect(parseStoredApps([{ ...app }, { slug: "broken" }])).toEqual([app]);
  });

  it("falls back to sample data for non-array values", () => {
    expect(parseStoredApps(null)).toBeUndefined();
    expect(parseStoredApps({})).toBeUndefined();
  });

  it("uses the workspace apps storage key", () => {
    expect(APPS_STORAGE_KEY).toBe("byov:apps:v1");
  });
});
