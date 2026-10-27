import { listNodes, listApps } from "@/lib/control-plane";
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
  };

  it("accepts a complete draft", () => {
    expect(validateNodeDraft(valid, sampleNodes)).toEqual({});
  });

  it("accepts a blank endpoint", () => {
    expect(validateNodeDraft({ ...valid, endpoint: "  " }, sampleNodes)).toEqual(
      {},
    );
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

  it("exposes Coolify as the only supported kind for now", () => {
    expect([...SUPPORTED_NODE_KINDS]).toEqual(["Coolify"]);
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
      },
      sampleNodes,
    );
    expect(node).toMatchObject({
      slug: "berlin-edge",
      name: "Berlin Edge",
      kind: "Coolify",
      location: "Berlin",
      endpoint: "https://coolify.example.com/",
      status: "pending",
    });
  });

  it("omits a blank endpoint", () => {
    const node = buildNode(
      { name: "Berlin Edge", kind: "Coolify", location: "Berlin", endpoint: "" },
      sampleNodes,
    );
    expect(node.endpoint).toBeUndefined();
  });

  it("suffixes the slug when the name is taken", () => {
    const node = buildNode(
      {
        name: "Coolify Frankfurt",
        kind: "Coolify",
        location: "Berlin",
        endpoint: "",
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
      { name: "Spare", kind: "Coolify", location: "Berlin", endpoint: "" },
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
      { workspaceName: "  ", defaultNode: "" },
      sampleNodes,
    );
    expect(errors.workspaceName).toMatch(/workspace.*name/i);
  });

  it("caps the workspace name length", () => {
    const errors = validateWorkspaceSettings(
      { workspaceName: "x".repeat(61), defaultNode: "" },
      sampleNodes,
    );
    expect(errors.workspaceName).toMatch(/60/);
  });

  it("accepts a known default node or none", () => {
    expect(
      validateWorkspaceSettings(
        { workspaceName: "Acme", defaultNode: sampleNodes[0]!.slug },
        sampleNodes,
      ),
    ).toEqual({});
    expect(
      validateWorkspaceSettings(
        { workspaceName: "Acme", defaultNode: "" },
        sampleNodes,
      ),
    ).toEqual({});
  });

  it("rejects an unknown default node", () => {
    const errors = validateWorkspaceSettings(
      { workspaceName: "Acme", defaultNode: "no-such-node" },
      sampleNodes,
    );
    expect(errors.defaultNode).toMatch(/known node/i);
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
    ).toEqual({ workspaceName: "Acme", defaultNode: "" });
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
