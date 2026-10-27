import packageJson from "@/package.json";
import { getApp } from "@/lib/control-plane";
import {
  buildTemplate,
  defaultTemplateDraft,
  draftFromTemplate,
  frameworkOf,
  getTemplate,
  listTemplates,
  parseStoredTemplates,
  replaceTemplate,
  slugifyTemplateName,
  standardTemplateChecks,
  uniqueTemplateSlug,
  validateTemplateDraft,
  type AppTemplate,
  type TemplateDraft,
} from "@/lib/templates";

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

  it("ships the BYOV stack plus the popular vibe-code stacks", () => {
    const slugs = listTemplates().map((template) => template.slug);
    expect(slugs).toEqual([
      "byov-stack",
      "ai-chatbot",
      "vite-spa",
      "fastapi-service",
    ]);
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

  it("mirrors the Control Plane required gates on every template", () => {
    const app = getApp("shopfloor-tickets");
    expect(app).toBeDefined();
    const gateNames = app!.checks.map((check) => check.name);
    for (const template of listTemplates()) {
      expect(template.checks.map((check) => check.name)).toEqual(gateNames);
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

describe("ai-chatbot", () => {
  const template = getTemplate("ai-chatbot")!;

  it("starts as a draft covering the AI stack layers", () => {
    expect(template.status).toBe("draft");
    const values = template.stack.map((item) => item.value).join(" ");
    for (const layer of ["Next.js", "AI SDK", "React", "Tailwind"]) {
      expect(values).toContain(layer);
    }
  });

  it("keeps provider keys on the server", () => {
    const text = JSON.stringify(template);
    expect(text).toContain("server");
  });
});

describe("vite-spa", () => {
  const template = getTemplate("vite-spa")!;

  it("starts as a draft covering the SPA stack layers", () => {
    expect(template.status).toBe("draft");
    const values = template.stack.map((item) => item.value).join(" ");
    for (const layer of ["Vite", "React", "TypeScript", "Tailwind"]) {
      expect(values).toContain(layer);
    }
  });

  it("builds a static bundle", () => {
    expect(template.scripts.build).toContain("vite build");
  });
});

describe("fastapi-service", () => {
  const template = getTemplate("fastapi-service")!;

  it("starts as a draft covering the Python stack layers", () => {
    expect(template.status).toBe("draft");
    const values = template.stack.map((item) => item.value).join(" ");
    for (const layer of ["FastAPI", "Python", "pytest", "Ruff"]) {
      expect(values).toContain(layer);
    }
  });

  it("runs Python-native gate commands", () => {
    const commandOf = (name: string) =>
      template.checks.find((check) => check.name === name)?.command;
    expect(commandOf("Unit tests")).toBe("pytest");
    expect(commandOf("Lint")).toBe("ruff check .");
    expect(commandOf("Production build")).toBe("docker build .");
  });
});

describe("frameworkOf", () => {
  it("returns the framework layer value", () => {
    expect(frameworkOf(getTemplate("byov-stack")!)).toContain("Next.js");
  });

  it("falls back to a dash without a framework layer", () => {
    const template = {
      ...getTemplate("byov-stack")!,
      stack: [{ label: "Runtime", value: "Node.js 20+" }],
    };
    expect(frameworkOf(template)).toBe("—");
  });
});

describe("template slugs", () => {
  it("slugifies names", () => {
    expect(slugifyTemplateName("  My Cool Stack! ")).toBe("my-cool-stack");
  });

  it("numbers clashing slugs", () => {
    expect(uniqueTemplateSlug("BYOV Stack", ["byov-stack"])).toBe(
      "byov-stack-2",
    );
    expect(
      uniqueTemplateSlug("BYOV Stack", ["byov-stack", "byov-stack-2"]),
    ).toBe("byov-stack-3");
  });

  it("falls back for blank names", () => {
    expect(uniqueTemplateSlug("!!!", [])).toBe("template");
  });
});

function validDraft(): TemplateDraft {
  return {
    ...defaultTemplateDraft(),
    name: "Data Notebook",
    tagline: "Notebook-style data apps for analysts.",
    stack: [
      { label: "Framework", value: "Next.js 16 (App Router)" },
      { label: "Language", value: "TypeScript 5 (strict)" },
    ],
  };
}

describe("validateTemplateDraft", () => {
  const existing = listTemplates();

  it("accepts a complete draft", () => {
    expect(validateTemplateDraft(validDraft(), existing)).toEqual({});
  });

  it("requires a unique name", () => {
    expect(
      validateTemplateDraft({ ...validDraft(), name: "  " }, existing).name,
    ).toBeDefined();
    expect(
      validateTemplateDraft({ ...validDraft(), name: "BYOV Stack" }, existing)
        .name,
    ).toContain("already exists");
    expect(
      validateTemplateDraft({ ...validDraft(), name: "x".repeat(61) }, existing)
        .name,
    ).toContain("under 60");
  });

  it("allows keeping the own name while editing", () => {
    const template = getTemplate("byov-stack")!;
    const draft: TemplateDraft = {
      ...validDraft(),
      name: template.name,
    };
    expect(
      validateTemplateDraft(draft, existing, template.slug).name,
    ).toBeUndefined();
  });

  it("requires a tagline and a known status", () => {
    expect(
      validateTemplateDraft({ ...validDraft(), tagline: "" }, existing)
        .tagline,
    ).toBeDefined();
    expect(
      validateTemplateDraft(
        { ...validDraft(), tagline: "x".repeat(141) },
        existing,
      ).tagline,
    ).toContain("under 140");
    expect(
      validateTemplateDraft({ ...validDraft(), status: "wip" }, existing)
        .status,
    ).toContain("draft, stable, deprecated");
  });

  it("requires at least one complete, unique stack layer", () => {
    expect(
      validateTemplateDraft({ ...validDraft(), stack: [] }, existing).stack,
    ).toContain("at least one");
    expect(
      validateTemplateDraft(
        { ...validDraft(), stack: [{ label: "Framework", value: "" }] },
        existing,
      ).stack,
    ).toContain("at least one");
    expect(
      validateTemplateDraft(
        {
          ...validDraft(),
          stack: [
            { label: "Framework", value: "Next.js" },
            { label: "framework", value: "Remix" },
          ],
        },
        existing,
      ).stack,
    ).toContain("unique label");
  });

  it("requires a supported node kind", () => {
    expect(
      validateTemplateDraft({ ...validDraft(), nodes: [] }, existing).nodes,
    ).toContain("at least one");
    expect(
      validateTemplateDraft({ ...validDraft(), nodes: ["kubernetes"] }, existing)
        .nodes,
    ).toContain("coolify");
  });

  it("requires test, lint and build commands", () => {
    const errors = validateTemplateDraft(
      { ...validDraft(), testCommand: "", lintCommand: " ", buildCommand: "" },
      existing,
    );
    expect(errors.testCommand).toBeDefined();
    expect(errors.lintCommand).toBeDefined();
    expect(errors.buildCommand).toBeDefined();
  });

  it("caps the starter ref length", () => {
    expect(
      validateTemplateDraft(
        { ...validDraft(), starterRef: "x".repeat(201) },
        existing,
      ).starterRef,
    ).toContain("under 200");
  });
});

describe("standardTemplateChecks", () => {
  it("keeps the governed gate names with per-stack commands", () => {
    const app = getApp("shopfloor-tickets");
    const checks = standardTemplateChecks({
      ...validDraft(),
      testCommand: "pytest",
      lintCommand: "ruff check .",
      buildCommand: "docker build .",
    });
    expect(checks.map((check) => check.name)).toEqual(
      app!.checks.map((check) => check.name),
    );
    expect(checks[0].command).toBe("pytest");
    expect(checks[1].command).toBe("ruff check .");
    expect(checks[2].command).toBe("docker build .");
    expect(checks[3].command).toBe("BYOV gate");
    expect(checks[4].command).toBe("BYOV gate");
  });
});

describe("buildTemplate", () => {
  it("builds a complete template with a unique slug", () => {
    const template = buildTemplate(validDraft(), listTemplates());
    expect(template.slug).toBe("data-notebook");
    expect(template.name).toBe("Data Notebook");
    expect(template.status).toBe("draft");
    expect(template.stack).toHaveLength(2);
    expect(template.checks).toHaveLength(5);
    expect(template.scaffold.length).toBeGreaterThan(0);
    expect(template.docs.length).toBeGreaterThan(0);
    expect(template.starter.kind).toBe("custom");
  });

  it("numbers the slug when the name clashes", () => {
    const template = buildTemplate(
      { ...validDraft(), name: "BYOV Stack" },
      listTemplates(),
    );
    expect(template.slug).toBe("byov-stack-2");
  });

  it("derives the gates command from the draft", () => {
    const template = buildTemplate(
      {
        ...validDraft(),
        testCommand: "pytest",
        lintCommand: "ruff check .",
        buildCommand: "docker build .",
      },
      listTemplates(),
    );
    const gates = template.scaffold.find(
      (step) => step.title === "Keep the gates green",
    );
    expect(gates?.command).toBe("pytest && ruff check . && docker build .");
  });

  it("defaults the starter ref to the custom slug", () => {
    const template = buildTemplate(
      { ...validDraft(), starterRef: "" },
      listTemplates(),
    );
    expect(template.starter.ref).toBe("custom:data-notebook");
  });
});

describe("draftFromTemplate", () => {
  it("prefills an editable draft copy", () => {
    const source = getTemplate("fastapi-service")!;
    const draft = draftFromTemplate(source);
    expect(draft.name).toBe("Python API copy");
    expect(draft.status).toBe("draft");
    expect(draft.stack).toEqual(source.stack);
    expect(draft.testCommand).toBe("pytest");
    expect(draft.lintCommand).toBe("ruff check .");
    expect(draft.buildCommand).toBe("docker build .");
    expect(draft.starterRef).toBe(source.starter.ref);
    expect(validateTemplateDraft(draft, listTemplates())).toEqual({});
  });
});

describe("replaceTemplate", () => {
  it("replaces by slug and leaves unknown slugs untouched", () => {
    const customs: AppTemplate[] = [buildTemplate(validDraft(), listTemplates())];
    const updated = { ...customs[0], name: "Renamed" };
    expect(replaceTemplate(customs, customs[0].slug, updated)[0].name).toBe(
      "Renamed",
    );
    expect(replaceTemplate(customs, "no-such-slug", updated)).toEqual(customs);
  });
});

describe("parseStoredTemplates", () => {
  it("round-trips a stored workspace template", () => {
    const template = buildTemplate(validDraft(), listTemplates());
    const parsed = parseStoredTemplates(JSON.parse(JSON.stringify([template])));
    expect(parsed).toEqual([template]);
  });

  it("returns undefined for non-list payloads", () => {
    expect(parseStoredTemplates(null)).toBeUndefined();
    expect(parseStoredTemplates({})).toBeUndefined();
  });

  it("skips invalid entries and keeps valid ones", () => {
    const template = buildTemplate(validDraft(), listTemplates());
    const parsed = parseStoredTemplates([
      template,
      { slug: "broken" },
      { ...template, slug: "bad-status", status: "wip" },
      "not-an-object",
    ]);
    expect(parsed?.map((entry) => entry.slug)).toEqual([template.slug]);
  });
});
