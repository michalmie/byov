import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect } from "vitest";
import {
  addApiEnv,
  createApiApp,
  findApp,
  findAppEnv,
  getApiAppsFilePath,
  listApiApps,
  readApiApps,
} from "@/lib/api-apps";

const savedEnv = { ...process.env };

beforeEach(() => {
  process.env.BYOV_DATA_DIR = mkdtempSync(join(tmpdir(), "byov-apps-test-"));
  delete process.env.AUTH_DATA_DIR;
});

afterEach(() => {
  const dataDir = process.env.BYOV_DATA_DIR;
  if (dataDir && dataDir.startsWith(tmpdir())) {
    rmSync(dataDir, { recursive: true, force: true });
  }
  process.env = { ...savedEnv };
});

const NODE = "coolify-frankfurt";

describe("createApiApp", () => {
  it("creates an app with a derived slug and a Sandbox env", () => {
    const result = createApiApp({
      name: "Rota Planner",
      slug: "",
      description: "Shift planning without the spreadsheet.",
      stack: "byov-stack",
      node: NODE,
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.app.slug).toBe("rota-planner");
    expect(result.ok && result.app.envs).toEqual([
      { name: "sandbox", node: NODE, status: "pending" },
    ]);
    expect(result.ok && result.app.checks).toHaveLength(5);
  });

  it("persists across reads and finds by slug", () => {
    expect(listApiApps()).toEqual([]);
    const created = createApiApp({
      name: "Rota Planner",
      slug: "rota",
      description: "",
      stack: "",
      node: NODE,
    });
    expect(created.ok).toBe(true);
    expect(listApiApps().map((app) => app.slug)).toEqual(["rota"]);
    expect(findApp("rota")?.name).toBe("Rota Planner");
    expect(findApp("missing")).toBeUndefined();
  });

  it("rejects duplicates, bad slugs, unknown stacks and nodes", () => {
    const first = createApiApp({
      name: "Rota Planner",
      slug: "",
      description: "",
      stack: "",
      node: NODE,
    });
    expect(first.ok).toBe(true);

    const duplicate = createApiApp({
      name: "Rota Planner",
      slug: "",
      description: "",
      stack: "",
      node: NODE,
    });
    expect(duplicate.ok).toBe(false);

    const badSlug = createApiApp({
      name: "Other",
      slug: "Bad Slug!",
      description: "",
      stack: "",
      node: NODE,
    });
    expect(badSlug.ok).toBe(false);
    expect(!badSlug.ok && badSlug.errors.slug).toContain("lowercase");

    const badStack = createApiApp({
      name: "Other",
      slug: "",
      description: "",
      stack: "cobol-mainframe",
      node: NODE,
    });
    expect(badStack.ok).toBe(false);
    expect(!badStack.ok && badStack.errors.stack).toContain(
      "known tech stacks",
    );

    const badNode = createApiApp({
      name: "Other",
      slug: "",
      description: "",
      stack: "",
      node: "mars-1",
    });
    expect(badNode.ok).toBe(false);
    expect(!badNode.ok && badNode.errors.node).toContain("known nodes");
  });
});

describe("addApiEnv", () => {
  it("adds a pending env with an optional URL override", () => {
    const created = createApiApp({
      name: "Rota Planner",
      slug: "",
      description: "",
      stack: "",
      node: NODE,
    });
    expect(created.ok).toBe(true);

    const added = addApiEnv("rota-planner", {
      name: "staging",
      node: NODE,
      url: "https://rota-staging.example.com",
    });
    expect(added.ok).toBe(true);
    expect(added.ok && added.env).toEqual({
      name: "staging",
      node: NODE,
      status: "pending",
      url: "https://rota-staging.example.com",
    });
    expect(findApp("rota-planner")?.envs.map((env) => env.name)).toEqual([
      "sandbox",
      "staging",
    ]);
  });

  it("rejects duplicates, bad names, unknown nodes and bad URLs", () => {
    createApiApp({
      name: "Rota Planner",
      slug: "",
      description: "",
      stack: "",
      node: NODE,
    });
    const duplicate = addApiEnv("rota-planner", {
      name: "sandbox",
      node: NODE,
      url: "",
    });
    expect(duplicate.ok).toBe(false);

    const badName = addApiEnv("rota-planner", {
      name: "Staging!",
      node: NODE,
      url: "",
    });
    expect(!badName.ok && badName.errors.name).toContain("lowercase");

    const badNode = addApiEnv("rota-planner", {
      name: "staging",
      node: "mars-1",
      url: "",
    });
    expect(!badNode.ok && badNode.errors.node).toContain("known nodes");

    const badUrl = addApiEnv("rota-planner", {
      name: "staging",
      node: NODE,
      url: "gopher://example.com",
    });
    expect(!badUrl.ok && badUrl.errors.url).toContain("http(s)");

    const missingApp = addApiEnv("nope", {
      name: "staging",
      node: NODE,
      url: "",
    });
    expect(missingApp.ok).toBe(false);
  });
});

describe("findAppEnv", () => {
  it("finds envs and misses cleanly", () => {
    createApiApp({
      name: "Rota Planner",
      slug: "",
      description: "",
      stack: "",
      node: NODE,
    });
    expect(findAppEnv("rota-planner", "sandbox")?.env.node).toBe(NODE);
    expect(findAppEnv("rota-planner", "staging")).toBeNull();
    expect(findAppEnv("missing", "sandbox")).toBeNull();
  });
});

describe("app store robustness", () => {
  it("reads a missing or corrupt file as empty", () => {
    expect(readApiApps()).toEqual([]);
    writeFileSync(getApiAppsFilePath(), "not json{");
    expect(readApiApps()).toEqual([]);
    writeFileSync(getApiAppsFilePath(), JSON.stringify({ apps: "nope" }));
    expect(readApiApps()).toEqual([]);
  });
});
