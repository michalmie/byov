import { describe, expect, it } from "vitest";
import type { App } from "@/lib/control-plane";
import type { TechStack } from "@/lib/stacks";
import { getStack } from "@/lib/stacks";
import { buildAgentsPrompt, agentsGateLine } from "@/lib/agents-prompt";

function sampleApp(overrides: Partial<App> = {}): App {
  return {
    slug: "rota-planner",
    name: "Rota Planner",
    stack: "byov-stack",
    description: "Plans weekly shop-floor rotas.",
    checks: [],
    envs: [{ name: "sandbox", node: "frankfurt-01", status: "pending" }],
    deployments: [],
    ...overrides,
  };
}

const byovStack = getStack("byov-stack") as TechStack;

describe("agentsGateLine", () => {
  it("joins the three local gate commands", () => {
    expect(agentsGateLine(byovStack)).toBe(
      "npm run test:unit && npm run lint && npm run build",
    );
  });

  it("is empty without a stack", () => {
    expect(agentsGateLine(undefined)).toBe("");
  });
});

describe("buildAgentsPrompt", () => {
  it("names the app and its BYOV identity", () => {
    const prompt = buildAgentsPrompt({
      app: sampleApp(),
      stack: byovStack,
      nodeName: "Frankfurt 01",
      sandboxUrl: "https://rota-planner.example.test",
    });
    expect(prompt).toContain("# Rota Planner — agent instructions");
    expect(prompt).toContain("`rota-planner`");
    expect(prompt).toContain("Plans weekly shop-floor rotas.");
    expect(prompt).toContain("BYOV");
  });

  it("makes the app aware of the harness and ecosystem", () => {
    const prompt = buildAgentsPrompt({
      app: sampleApp(),
      stack: byovStack,
      nodeName: "Frankfurt 01",
      sandboxUrl: "https://rota-planner.example.test",
    });
    expect(prompt).toContain("Control Plane");
    expect(prompt).toContain("Sandbox environment");
    expect(prompt).toContain("`Frankfurt 01`");
    expect(prompt).toContain("https://rota-planner.example.test");
    expect(prompt).toContain("Nodes");
    expect(prompt).toContain("Coolify");
  });

  it("keeps the Sandbox URL copy node-neutral for every node kind", () => {
    const prompt = buildAgentsPrompt({
      app: sampleApp(),
      stack: byovStack,
      nodeName: "Frankfurt 01",
      sandboxUrl: "https://rota-planner.example.test",
    });
    expect(prompt).toContain("node FQDN");
    expect(prompt).not.toMatch(/Coolify FQDN/);
  });

  it("lists the five required gates with the local gate line", () => {
    const prompt = buildAgentsPrompt({
      app: sampleApp(),
      stack: byovStack,
      sandboxUrl: null,
    });
    for (const gate of [
      "Unit tests",
      "Lint",
      "Production build",
      "DLP scan",
      "Dependency audit",
    ]) {
      expect(prompt).toContain(gate);
    }
    expect(prompt).toContain(
      "npm run test:unit && npm run lint && npm run build",
    );
  });

  it("carries the stack layers, scripts, and house rules", () => {
    const prompt = buildAgentsPrompt({
      app: sampleApp(),
      stack: byovStack,
      sandboxUrl: null,
    });
    expect(prompt).toContain("BYOV Stack");
    expect(prompt).toContain("Next.js 16 (App Router)");
    expect(prompt).toContain("`test:unit`: `vitest run`");
    expect(prompt).toContain("Never commit secrets");
    expect(prompt).toContain("`3014`");
  });

  it("degrades gracefully without a stack", () => {
    const prompt = buildAgentsPrompt({
      app: sampleApp({ stack: "" }),
      stack: undefined,
      sandboxUrl: null,
    });
    expect(prompt).toContain("none assigned yet");
    expect(prompt).toContain("whatever tests, lint, and build");
    expect(prompt).not.toContain("undefined");
  });

  it("degrades gracefully without a Sandbox URL", () => {
    const prompt = buildAgentsPrompt({
      app: sampleApp(),
      stack: byovStack,
      sandboxUrl: null,
    });
    expect(prompt).toContain("not assigned yet");
    expect(prompt).toContain("Settings → Nodes");
    expect(prompt).not.toContain("undefined");
  });

  it("falls back to the env node slug when the node name is unknown", () => {
    const prompt = buildAgentsPrompt({
      app: sampleApp(),
      stack: byovStack,
      sandboxUrl: null,
    });
    expect(prompt).toContain("`frankfurt-01`");
  });
});
