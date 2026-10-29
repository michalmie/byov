import { listNodes, listApps } from "@/lib/control-plane";
import type { WorkspaceSettings } from "@/lib/settings";
import {
  NODES_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  SUPPORTED_NODE_KINDS,
  buildNode,
  defaultWorkspaceSettings,
  nodeUsage,
  parseStoredNodes,
  parseStoredSettings,
  removeNodeGuarded,
  replaceNode,
  slugifyNodeName,
  uniqueNodeSlug,
  validateNodeDraft,
  validateWorkspaceSettings,
} from "@/lib/settings";

const sampleNodes = listNodes();
const sampleApps = listApps();

describe("slugifyNodeName", () => {
  it("lowercases and dashes a display name", () => {
    expect(slugifyNodeName("Frankfurt 01")).toBe("frankfurt-01");
  });

  it("collapses punctuation and trims dashes", () => {
    expect(slugifyNodeName("  QA_Lab! ")).toBe("qa-lab");
  });

  it("falls back to an empty slug for symbol-only names", () => {
    expect(slugifyNodeName("!!!")).toBe("");
  });
});

describe("uniqueNodeSlug", () => {
  it("keeps a fresh slug untouched", () => {
    expect(uniqueNodeSlug("Berlin Edge", ["coolify-frankfurt"])).toBe(
      "berlin-edge",
    );
  });

  it("suffixes a taken slug until it is free", () => {
    expect(
      uniqueNodeSlug("Frankfurt 01", ["frankfurt-01", "frankfurt-01-2"]),
    ).toBe("frankfurt-01-3");
  });

  it("falls back to a node slug when the name has no slug text", () => {
    expect(uniqueNodeSlug("!!!", [])).toBe("node");
    expect(uniqueNodeSlug("!!!", ["node"])).toBe("node-2");
  });
});

describe("validateNodeDraft", () => {
  const valid = {
    name: "Berlin Edge",
    kind: "Coolify",
    location: "Berlin",
    endpoint: "https://coolify.example.com",
    domainZone: "",
    tailnetHost: "",
  };

  it("accepts a complete draft", () => {
    expect(validateNodeDraft(valid, sampleNodes)).toEqual({});
  });

  it("accepts a blank endpoint", () => {
    expect(validateNodeDraft({ ...valid, endpoint: "  " }, sampleNodes)).toEqual(
      {},
    );
  });

  it("accepts a blank or valid domain zone", () => {
    expect(validateNodeDraft({ ...valid, domainZone: "  " }, sampleNodes)).toEqual(
      {},
    );
    expect(
      validateNodeDraft(
        { ...valid, domainZone: "berlin-01.byov.xexo.io" },
        sampleNodes,
      ),
    ).toEqual({});
  });

  it("rejects a zone with a wildcard prefix", () => {
    const errors = validateNodeDraft(
      { ...valid, domainZone: "*.berlin-01.byov.xexo.io" },
      sampleNodes,
    );
    expect(errors.domainZone).toMatch(/without the \*\. prefix/);
  });

  it("rejects a malformed domain zone", () => {
    const errors = validateNodeDraft(
      { ...valid, domainZone: "not a zone" },
      sampleNodes,
    );
    expect(errors.domainZone).toMatch(/like .*byov/);
  });

  it("rejects reserved zone suffixes", () => {
    expect(
      validateNodeDraft({ ...valid, domainZone: "apps.corp.local" }, sampleNodes)
        .domainZone,
    ).toMatch(/mDNS/);
    expect(
      validateNodeDraft({ ...valid, domainZone: "home.arpa" }, sampleNodes)
        .domainZone,
    ).toMatch(/home networks/);
    expect(
      validateNodeDraft(
        { ...valid, domainZone: "lab.home.arpa" },
        sampleNodes,
      ).domainZone,
    ).toMatch(/home networks/);
  });

  it("accepts a blank or valid tailnet host", () => {
    expect(
      validateNodeDraft({ ...valid, tailnetHost: "  " }, sampleNodes),
    ).toEqual({});
    expect(
      validateNodeDraft({ ...valid, tailnetHost: "qa-lab-01" }, sampleNodes),
    ).toEqual({});
  });

  it("rejects a malformed tailnet host", () => {
    const errors = validateNodeDraft(
      { ...valid, tailnetHost: "qa lab 01" },
      sampleNodes,
    );
    expect(errors.tailnetHost).toMatch(/machine name/i);
  });

  it("requires a name", () => {
    const errors = validateNodeDraft({ ...valid, name: "   " }, sampleNodes);
    expect(errors.name).toMatch(/name/i);
    expect(errors.kind).toBeUndefined();
  });

  it("caps the name length", () => {
    const errors = validateNodeDraft(
      { ...valid, name: "x".repeat(41) },
      sampleNodes,
    );
    expect(errors.name).toMatch(/40/);
  });

  it("rejects a name taken by another node", () => {
    const taken = sampleNodes[0]?.name ?? "frankfurt-01";
    const errors = validateNodeDraft({ ...valid, name: taken }, sampleNodes);
    expect(errors.name).toMatch(/already/i);
  });

  it("rejects a name that slug-collides with another node", () => {
    const errors = validateNodeDraft(
      { ...valid, name: "Coolify QA Lab" },
      sampleNodes,
    );
    expect(errors.name).toMatch(/already/i);
  });

  it("lets an edit keep its own name", () => {
    const self = sampleNodes[0]!;
    const errors = validateNodeDraft(
      { ...valid, name: self.name },
      sampleNodes,
      self.slug,
    );
    expect(errors.name).toBeUndefined();
  });

  it("requires a supported node type", () => {
    expect(
      validateNodeDraft({ ...valid, kind: "" }, sampleNodes).kind,
    ).toMatch(/type/i);
    expect(
      validateNodeDraft({ ...valid, kind: "Kubernetes" }, sampleNodes).kind,
    ).toMatch(/supported/i);
  });

  it("accepts a Vercel draft", () => {
    expect(
      validateNodeDraft({ ...valid, kind: "Vercel" }, sampleNodes),
    ).toEqual({});
  });

  it("accepts a Vercel draft with every optional field", () => {
    expect(
      validateNodeDraft(
        {
          ...valid,
          kind: "Vercel",
          endpoint: "https://vercel.example.com",
          domainZone: "vercel-01.byov.xexo.io",
          tailnetHost: "vercel-01",
        },
        sampleNodes,
      ),
    ).toEqual({});
  });

  it("rejects a non-http endpoint on a Vercel draft", () => {
    const errors = validateNodeDraft(
      { ...valid, kind: "Vercel", endpoint: "not a url" },
      sampleNodes,
    );
    expect(errors.endpoint).toMatch(/http/i);
  });

  it("rejects an unknown kind and lists the supported types", () => {
    const errors = validateNodeDraft(
      { ...valid, kind: "Kubernetes" },
      sampleNodes,
    );
    expect(errors.kind).toBe(
      `Supported node types: ${SUPPORTED_NODE_KINDS.join(", ")}.`,
    );
  });

  it("requires a location", () => {
    const errors = validateNodeDraft(
      { ...valid, location: " " },
      sampleNodes,
    );
    expect(errors.location).toMatch(/location/i);
  });

  it("caps the location length", () => {
    const errors = validateNodeDraft(
      { ...valid, location: "x".repeat(61) },
      sampleNodes,
    );
    expect(errors.location).toMatch(/60/);
  });

  it("rejects a non-http endpoint", () => {
    const errors = validateNodeDraft(
      { ...valid, endpoint: "not a url" },
      sampleNodes,
    );
    expect(errors.endpoint).toMatch(/http/i);
  });

  it("rejects non-http(s) schemes", () => {
    const errors = validateNodeDraft(
      { ...valid, endpoint: "ftp://coolify.example.com" },
      sampleNodes,
    );
    expect(errors.endpoint).toMatch(/http/i);
  });

  it("exposes Coolify and Vercel as the supported kinds", () => {
    expect([...SUPPORTED_NODE_KINDS]).toEqual(["Coolify", "Vercel"]);
  });
});

describe("buildNode", () => {
  it("trims fields and starts the node as pending", () => {
    const node = buildNode(
      {
        name: "  Berlin Edge ",
        kind: "Coolify",
        location: " Berlin ",
        endpoint: "https://coolify.example.com/ ",
        domainZone: " Berlin-01.byov.xexo.io ",
        tailnetHost: " Berlin-Edge ",
      },
      sampleNodes,
    );
    expect(node).toMatchObject({
      slug: "berlin-edge",
      name: "Berlin Edge",
      kind: "Coolify",
      location: "Berlin",
      endpoint: "https://coolify.example.com/",
      domainZone: "berlin-01.byov.xexo.io",
      tailnetHost: "berlin-edge",
      status: "pending",
    });
  });

  it("omits a blank endpoint", () => {
    const node = buildNode(
      {
        name: "Berlin Edge",
        kind: "Coolify",
        location: "Berlin",
        endpoint: "",
        domainZone: "",
        tailnetHost: "",
      },
      sampleNodes,
    );
    expect(node.endpoint).toBeUndefined();
    expect(node.domainZone).toBeUndefined();
    expect(node.tailnetHost).toBeUndefined();
  });

  it("keeps a Vercel kind and starts the node as pending", () => {
    const node = buildNode(
      {
        name: "Vercel Edge",
        kind: "Vercel",
        location: "Berlin",
        endpoint: "",
        domainZone: "",
        tailnetHost: "",
      },
      sampleNodes,
    );
    expect(node).toMatchObject({
      slug: "vercel-edge",
      kind: "Vercel",
      status: "pending",
    });
  });

  it("suffixes the slug when the name is taken", () => {
    const node = buildNode(
      {
        name: "Coolify Frankfurt",
        kind: "Coolify",
        location: "Berlin",
        endpoint: "",
        domainZone: "",
        tailnetHost: "",
      },
      sampleNodes,
    );
    expect(node.slug).toBe("coolify-frankfurt-2");
  });
});

describe("nodeUsage", () => {
  it("lists the environments pinned to a node", () => {
    const usage = nodeUsage("coolify-frankfurt", sampleApps);
    expect(usage.length).toBeGreaterThan(0);
    for (const entry of usage) {
      expect(entry.appSlug.length).toBeGreaterThan(0);
      expect(entry.env.length).toBeGreaterThan(0);
    }
  });

  it("returns nothing for an unused node", () => {
    expect(nodeUsage("no-such-node", sampleApps)).toEqual([]);
  });
});

describe("replaceNode", () => {
  it("swaps the matching node and keeps the order", () => {
    const target = sampleNodes[0]!;
    const renamed = { ...target, name: "frankfurt-renamed" };
    const next = replaceNode(sampleNodes, target.slug, renamed);
    expect(next).toHaveLength(sampleNodes.length);
    expect(next[0]?.name).toBe("frankfurt-renamed");
    expect(sampleNodes[0]?.name).toBe(target.name);
  });

  it("leaves the list untouched for an unknown slug", () => {
    const next = replaceNode(sampleNodes, "no-such-node", {
      ...sampleNodes[0]!,
      slug: "no-such-node",
    });
    expect(next).toEqual(sampleNodes);
  });
});

describe("removeNodeGuarded", () => {
  it("removes a node nobody uses", () => {
    const extra = buildNode(
      {
        name: "Spare",
        kind: "Coolify",
        location: "Berlin",
        endpoint: "",
        domainZone: "",
        tailnetHost: "",
      },
      sampleNodes,
    );
    const result = removeNodeGuarded(
      [...sampleNodes, extra],
      extra.slug,
      sampleApps,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nodes.map((node) => node.slug)).not.toContain(extra.slug);
    }
  });

  it("blocks removing a node with pinned environments", () => {
    const slug = sampleNodes[0]!.slug;
    const result = removeNodeGuarded(sampleNodes, slug, sampleApps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/pinned/i);
      expect(result.usage.length).toBeGreaterThan(0);
    }
  });

  it("reports an unknown slug", () => {
    const result = removeNodeGuarded(
      sampleNodes,
      "no-such-node",
      sampleApps,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/not found/i);
      expect(result.usage).toEqual([]);
    }
  });
});

describe("validateWorkspaceSettings", () => {
  it("accepts the defaults", () => {
    expect(validateWorkspaceSettings(defaultWorkspaceSettings(), sampleNodes)).toEqual(
      {},
    );
  });

  it("requires a workspace name", () => {
    const errors = validateWorkspaceSettings(
      { workspaceName: "  ", defaultNode: "", devZone: "", tailnetDomain: "", defaultScenario: "public", appScenarios: {} },
      sampleNodes,
    );
    expect(errors.workspaceName).toMatch(/workspace.*name/i);
  });

  it("caps the workspace name length", () => {
    const errors = validateWorkspaceSettings(
      { workspaceName: "x".repeat(61), defaultNode: "", devZone: "", tailnetDomain: "", defaultScenario: "public", appScenarios: {} },
      sampleNodes,
    );
    expect(errors.workspaceName).toMatch(/60/);
  });

  it("accepts a known default node or none", () => {
    expect(
      validateWorkspaceSettings(
        {
          workspaceName: "Acme",
          defaultNode: sampleNodes[0]!.slug,
          devZone: "", tailnetDomain: "", defaultScenario: "public", appScenarios: {},
        },
        sampleNodes,
      ),
    ).toEqual({});
    expect(
      validateWorkspaceSettings(
        { workspaceName: "Acme", defaultNode: "", devZone: "", tailnetDomain: "", defaultScenario: "public", appScenarios: {} },
        sampleNodes,
      ),
    ).toEqual({});
  });

  it("rejects an unknown default node", () => {
    const errors = validateWorkspaceSettings(
      { workspaceName: "Acme", defaultNode: "no-such-node", devZone: "", tailnetDomain: "", defaultScenario: "public", appScenarios: {} },
      sampleNodes,
    );
    expect(errors.defaultNode).toMatch(/known node/i);
  });

  it("accepts a blank or valid dev zone", () => {
    expect(
      validateWorkspaceSettings(
        { workspaceName: "Acme", defaultNode: "", devZone: "  ", tailnetDomain: "", defaultScenario: "public", appScenarios: {} },
        sampleNodes,
      ),
    ).toEqual({});
    expect(
      validateWorkspaceSettings(
        {
          workspaceName: "Acme",
          defaultNode: "",
          devZone: "dev.byov.xexo.io", tailnetDomain: "", defaultScenario: "public", appScenarios: {},
        },
        sampleNodes,
      ),
    ).toEqual({});
  });

  it("rejects a malformed dev zone", () => {
    const errors = validateWorkspaceSettings(
      {
        workspaceName: "Acme",
        defaultNode: "",
        devZone: "*.dev.byov.xexo.io", tailnetDomain: "", defaultScenario: "public", appScenarios: {},
      },
      sampleNodes,
    );
    expect(errors.devZone).toMatch(/without the \*\. prefix/);
  });

  it("accepts a blank or valid tailnet domain", () => {
    expect(
      validateWorkspaceSettings(
        {
          workspaceName: "Acme",
          defaultNode: "",
          devZone: "",
          tailnetDomain: "  ", defaultScenario: "public", appScenarios: {},
        },
        sampleNodes,
      ),
    ).toEqual({});
    expect(
      validateWorkspaceSettings(
        {
          workspaceName: "Acme",
          defaultNode: "",
          devZone: "",
          tailnetDomain: "yak-bebop.ts.net", defaultScenario: "public", appScenarios: {},
        },
        sampleNodes,
      ),
    ).toEqual({});
  });

  it("rejects a non-tailnet domain", () => {
    const errors = validateWorkspaceSettings(
      {
        workspaceName: "Acme",
        defaultNode: "",
        devZone: "",
        tailnetDomain: "vpn.example.com",
        defaultScenario: "public",
        appScenarios: {},
      },
      sampleNodes,
    );
    expect(errors.tailnetDomain).toMatch(/tailnet domain/i);
  });

  it("accepts every default scenario", () => {
    for (const defaultScenario of ["public", "tailnet", "local"] as const) {
      expect(
        validateWorkspaceSettings(
          {
            workspaceName: "Acme",
            defaultNode: "",
            devZone: "",
            tailnetDomain: "",
            defaultScenario,
            appScenarios: {},
          },
          sampleNodes,
        ),
      ).toEqual({});
    }
  });

  it("rejects an unknown default scenario", () => {
    const errors = validateWorkspaceSettings(
      {
        workspaceName: "Acme",
        defaultNode: "",
        devZone: "",
        tailnetDomain: "",
        defaultScenario: "carrier-pigeon",
        appScenarios: {},
      } as unknown as WorkspaceSettings,
      sampleNodes,
    );
    expect(errors.defaultScenario).toMatch(/default DNS scenario/i);
  });

  it("accepts per-app overrides and ignores unknown slugs", () => {
    expect(
      validateWorkspaceSettings(
        {
          workspaceName: "Acme",
          defaultNode: "",
          devZone: "",
          tailnetDomain: "",
          defaultScenario: "public",
          appScenarios: {
            "lab-inventory": "local",
            "gone-app": "tailnet",
          },
        },
        sampleNodes,
      ),
    ).toEqual({});
  });

  it("rejects malformed per-app overrides", () => {
    const errors = validateWorkspaceSettings(
      {
        workspaceName: "Acme",
        defaultNode: "",
        devZone: "",
        tailnetDomain: "",
        defaultScenario: "public",
        appScenarios: { "lab-inventory": "carrier-pigeon" },
      } as unknown as WorkspaceSettings,
      sampleNodes,
    );
    expect(errors.appScenarios).toMatch(/public, tailnet, or local/);
  });
});

describe("stored settings parsing", () => {
  it("uses versioned storage keys", () => {
    expect(NODES_STORAGE_KEY).toBe("byov:nodes:v1");
    expect(SETTINGS_STORAGE_KEY).toBe("byov:settings:v1");
  });

  it("parses a stored node list", () => {
    expect(parseStoredNodes(JSON.parse(JSON.stringify(sampleNodes)))).toEqual(
      sampleNodes,
    );
  });

  it("rejects garbage instead of crashing", () => {
    expect(parseStoredNodes(null)).toBeUndefined();
    expect(parseStoredNodes("nope")).toBeUndefined();
    expect(parseStoredNodes({ nodes: [] })).toBeUndefined();
  });

  it("drops malformed nodes and keeps the rest", () => {
    const parsed = parseStoredNodes([
      ...sampleNodes,
      { slug: "broken" },
      null,
      { ...sampleNodes[0], status: "exploded" },
    ]);
    expect(parsed).toEqual(sampleNodes);
  });

  it("parses stored workspace settings", () => {
    expect(
      parseStoredSettings({ workspaceName: "Acme", defaultNode: "" }),
    ).toEqual({ workspaceName: "Acme", defaultNode: "", devZone: "", tailnetDomain: "", defaultScenario: "public", appScenarios: {} });
  });

  it("normalizes a stored dev zone and drops a bad one", () => {
    expect(
      parseStoredSettings({
        workspaceName: "Acme",
        defaultNode: "",
        devZone: " DEV.byov.xexo.io ", tailnetDomain: "", defaultScenario: "public", appScenarios: {},
      }),
    ).toEqual({
      workspaceName: "Acme",
      defaultNode: "",
      devZone: "dev.byov.xexo.io", tailnetDomain: "", defaultScenario: "public", appScenarios: {},
    });
    expect(
      parseStoredSettings({
        workspaceName: "Acme",
        defaultNode: "",
        devZone: "nope", tailnetDomain: "", defaultScenario: "public", appScenarios: {},
      }),
    ).toEqual({ workspaceName: "Acme", defaultNode: "", devZone: "", tailnetDomain: "", defaultScenario: "public", appScenarios: {} });
  });

  it("drops an invalid stored zone but keeps the node", () => {
    const parsed = parseStoredNodes([
      { ...sampleNodes[0], domainZone: "not a zone" },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed![0]!.slug).toBe(sampleNodes[0]!.slug);
    expect(parsed![0]!.domainZone).toBeUndefined();
  });

  it("ignores a legacy stored node scenario", () => {
    const parsed = parseStoredNodes([
      { ...sampleNodes[0], dnsScenario: "tailnet" },
    ]);
    expect(parsed).toEqual([sampleNodes[0]]);
  });

  it("defaults a missing or bogus stored default scenario", () => {
    const base = {
      workspaceName: "Acme",
      defaultNode: "",
      devZone: "",
      tailnetDomain: "",
      appScenarios: {},
    };
    expect(parseStoredSettings(base)!.defaultScenario).toBe("public");
    expect(
      parseStoredSettings({ ...base, defaultScenario: "carrier-pigeon" })!
        .defaultScenario,
    ).toBe("public");
    expect(
      parseStoredSettings({ ...base, defaultScenario: "local" })!
        .defaultScenario,
    ).toBe("local");
  });

  it("keeps valid stored app overrides and drops the rest", () => {
    expect(
      parseStoredSettings({
        workspaceName: "Acme",
        defaultNode: "",
        devZone: "",
        tailnetDomain: "",
        defaultScenario: "public",
        appScenarios: {
          "lab-inventory": "local",
          "gone-app": "tailnet",
          "bad-app": "carrier-pigeon",
          "": "local",
        },
      })!.appScenarios,
    ).toEqual({ "lab-inventory": "local", "gone-app": "tailnet" });
    expect(
      parseStoredSettings({
        workspaceName: "Acme",
        defaultNode: "",
        devZone: "",
        tailnetDomain: "",
        defaultScenario: "public",
        appScenarios: "nope",
      })!.appScenarios,
    ).toEqual({});
  });

  it("normalizes a stored tailnet host and drops a bad one", () => {
    expect(
      parseStoredNodes([{ ...sampleNodes[0], tailnetHost: " FrankFurt-01 " }])![0]!
        .tailnetHost,
    ).toBe("frankfurt-01");
    expect(
      parseStoredNodes([{ ...sampleNodes[0], tailnetHost: "not a host" }])![0]!
        .tailnetHost,
    ).toBeUndefined();
  });

  it("normalizes a stored tailnet domain and drops a bad one", () => {
    expect(
      parseStoredSettings({
        workspaceName: "Acme",
        defaultNode: "",
        devZone: "",
        tailnetDomain: " Yak-Bebop.ts.net ", defaultScenario: "public", appScenarios: {},
      }),
    ).toEqual({
      workspaceName: "Acme",
      defaultNode: "",
      devZone: "",
      tailnetDomain: "yak-bebop.ts.net", defaultScenario: "public", appScenarios: {},
    });
    expect(
      parseStoredSettings({
        workspaceName: "Acme",
        defaultNode: "",
        devZone: "",
        tailnetDomain: "vpn.example.com", defaultScenario: "public", appScenarios: {},
      }),
    ).toEqual({
      workspaceName: "Acme",
      defaultNode: "",
      devZone: "",
      tailnetDomain: "", defaultScenario: "public", appScenarios: {},
    });
  });

  it("rejects malformed workspace settings", () => {
    expect(parseStoredSettings(null)).toBeUndefined();
    expect(parseStoredSettings({})).toBeUndefined();
    expect(
      parseStoredSettings({ workspaceName: "  ", defaultNode: "" }),
    ).toBeUndefined();
    expect(
      parseStoredSettings({ workspaceName: "Acme" }),
    ).toBeUndefined();
  });
});
