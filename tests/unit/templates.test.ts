import packageJson from "@/package.json";
import { getApp } from "@/lib/control-plane";
import { getTemplate, listTemplates } from "@/lib/templates";

describe("getTemplate", () => {
  it("returns the template for a known slug", () => {
    expect(getTemplate("byov-stack")?.name).toBe("BYOV Stack");
  });

  it("returns undefined for an unknown slug", () => {
    expect(getTemplate("no-such-stack")).toBeUndefined();
  });
});

describe("listTemplates", () => {
  it("lists every template with a unique slug", () => {
    const templates = listTemplates();
    expect(templates.length).toBeGreaterThan(0);
    const slugs = templates.map((template) => template.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("keeps every template complete and shippable", () => {
    for (const template of listTemplates()) {
      expect(template.name.length).toBeGreaterThan(0);
      expect(template.tagline.length).toBeGreaterThan(0);
      expect(template.stack.length).toBeGreaterThan(0);
      expect(template.checks.length).toBeGreaterThan(0);
      expect(template.nodes.length).toBeGreaterThan(0);
      expect(template.scaffold.length).toBeGreaterThan(0);
      expect(template.docs.length).toBeGreaterThan(0);
      expect(template.starter.ref.length).toBeGreaterThan(0);
      for (const step of template.scaffold) {
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.detail.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("byov-stack", () => {
  const template = getTemplate("byov-stack")!;

  it("is the stable default template", () => {
    expect(template.status).toBe("stable");
  });

  it("covers the BYOV stack layers", () => {
    const values = template.stack.map((item) => item.value).join(" ");
    for (const layer of ["Next.js", "React", "TypeScript", "Tailwind", "Vitest"]) {
      expect(values).toContain(layer);
    }
  });

  it("tracks the package versions BYOV is built on", () => {
    const installed = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    } as Record<string, string>;
    for (const [name, version] of Object.entries(template.packages)) {
      expect(installed[name]).toBe(version);
    }
  });

  it("declares the standard npm scripts", () => {
    for (const script of [
      "dev",
      "build",
      "lint",
      "typecheck",
      "test:unit",
    ]) {
      expect(template.scripts[script]?.length).toBeGreaterThan(0);
    }
  });

  it("mirrors the Control Plane required gates", () => {
    const app = getApp("shopfloor-tickets");
    expect(app).toBeDefined();
    const gateNames = app!.checks.map((check) => check.name);
    expect(template.checks.map((check) => check.name)).toEqual(gateNames);
  });
});
