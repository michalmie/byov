import packageJson from "@/package.json";
import { getApp } from "@/lib/control-plane";
import {
  buildStack,
  defaultStackDraft,
  draftFromStack,
  getStack,
  inferStackCategory,
  layersByCategory,
  listStacks,
  parseStoredStacks,
  primaryTechnologyOf,
  replaceStack,
  slugifyStackName,
  standardStackChecks,
  uniqueStackSlug,
  validateStackDraft,
  type StackDraft,
  type TechStack,
} from "@/lib/stacks";

describe("getStack", () => {
  it("returns the stack for a known slug", () => {
    expect(getStack("byov-stack")?.name).toBe("BYOV Stack");
  });

  it("returns undefined for an unknown slug", () => {
    expect(getStack("no-such-stack")).toBeUndefined();
  });
});

describe("listStacks", () => {
  it("lists every stack with a unique slug", () => {
    const stacks = listStacks();
    expect(stacks.length).toBeGreaterThan(0);
    const slugs = stacks.map((stack) => stack.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("ships the BYOV stack plus the popular vibe-code stacks", () => {
    const slugs = listStacks().map((stack) => stack.slug);
    expect(slugs).toEqual([
      "byov-stack",
      "ai-chatbot",
      "vite-spa",
      "fastapi-service",
    ]);
  });

  it("keeps every stack complete and shippable", () => {
    for (const stack of listStacks()) {
      expect(stack.name.length).toBeGreaterThan(0);
      expect(stack.tagline.length).toBeGreaterThan(0);
      expect(stack.stack.length).toBeGreaterThan(0);
      expect(stack.checks.length).toBeGreaterThan(0);
      expect(stack.nodes.length).toBeGreaterThan(0);
      expect(stack.scaffold.length).toBeGreaterThan(0);
      expect(stack.docs.length).toBeGreaterThan(0);
      expect(stack.starter.ref.length).toBeGreaterThan(0);
      for (const step of stack.scaffold) {
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.detail.length).toBeGreaterThan(0);
      }
    }
  });

  it("categorizes every layer with a known category", () => {
    for (const stack of listStacks()) {
      for (const layer of stack.stack) {
        expect(typeof layer.category).toBe("string");
      }
      const groups = layersByCategory(stack);
      const grouped = groups.flatMap((group) => group.layers);
      expect(grouped).toHaveLength(stack.stack.length);
    }
  });

  it("covers frontend, server and database across the catalog", () => {
    const categories = new Set<string>(
      listStacks().flatMap((stack) =>
        stack.stack.map((layer) => layer.category),
      ),
    );
    for (const category of ["frontend", "server", "database"]) {
      expect(categories.has(category)).toBe(true);
    }
  });

  it("mirrors the Control Plane required gates on every stack", () => {
    const app = getApp("shopfloor-tickets");
    expect(app).toBeDefined();
    const gateNames = app!.checks.map((check) => check.name);
    for (const stack of listStacks()) {
      expect(stack.checks.map((check) => check.name)).toEqual(gateNames);
    }
  });
});

describe("byov-stack", () => {
  const stack = getStack("byov-stack")!;

  it("is the stable default stack", () => {
    expect(stack.status).toBe("stable");
  });

  it("covers the BYOV stack layers", () => {
    const values = stack.stack.map((item) => item.value).join(" ");
    for (const layer of ["Next.js", "React", "TypeScript", "Tailwind", "Vitest"]) {
      expect(values).toContain(layer);
    }
  });

  it("tracks the package versions BYOV is built on", () => {
    const installed = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    } as Record<string, string>;
    for (const [name, version] of Object.entries(stack.packages)) {
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
      expect(stack.scripts[script]?.length).toBeGreaterThan(0);
    }
  });

  it("mirrors the Control Plane required gates", () => {
    const app = getApp("shopfloor-tickets");
    expect(app).toBeDefined();
    const gateNames = app!.checks.map((check) => check.name);
    expect(stack.checks.map((check) => check.name)).toEqual(gateNames);
  });
});

describe("ai-chatbot", () => {
  const stack = getStack("ai-chatbot")!;

  it("starts as a draft covering the AI stack layers", () => {
    expect(stack.status).toBe("draft");
    const values = stack.stack.map((item) => item.value).join(" ");
    for (const layer of ["Next.js", "AI SDK", "React", "Tailwind"]) {
      expect(values).toContain(layer);
    }
  });

  it("keeps provider keys on the server", () => {
    const text = JSON.stringify(stack);
    expect(text).toContain("server");
  });
});

describe("vite-spa", () => {
  const stack = getStack("vite-spa")!;

  it("starts as a draft covering the SPA stack layers", () => {
    expect(stack.status).toBe("draft");
    const values = stack.stack.map((item) => item.value).join(" ");
    for (const layer of ["Vite", "React", "TypeScript", "Tailwind"]) {
      expect(values).toContain(layer);
    }
  });

  it("builds a static bundle", () => {
    expect(stack.scripts.build).toContain("vite build");
  });
});

describe("fastapi-service", () => {
  const stack = getStack("fastapi-service")!;

  it("starts as a draft covering the Python stack layers", () => {
    expect(stack.status).toBe("draft");
    const values = stack.stack.map((item) => item.value).join(" ");
    for (const layer of ["FastAPI", "Python", "pytest", "Ruff"]) {
      expect(values).toContain(layer);
    }
  });

  it("runs Python-native gate commands", () => {
    const commandOf = (name: string) =>
      stack.checks.find((check) => check.name === name)?.command;
    expect(commandOf("Unit tests")).toBe("pytest");
    expect(commandOf("Lint")).toBe("ruff check .");
    expect(commandOf("Production build")).toBe("docker build .");
  });

  it("pairs the server with a database", () => {
    const byCategory = Object.fromEntries(
      layersByCategory(stack).map((group) => [group.category, group.layers]),
    );
    expect(byCategory.server?.map((layer) => layer.value).join(" ")).toContain(
      "FastAPI",
    );
    expect(
      byCategory.database?.map((layer) => layer.value).join(" "),
    ).toContain("PostgreSQL");
  });
});

describe("primaryTechnologyOf", () => {
  it("returns the framework layer value", () => {
    expect(primaryTechnologyOf(getStack("byov-stack")!)).toContain("Next.js");
  });

  it("falls back to a dash without a framework layer", () => {
    const stack = {
      ...getStack("byov-stack")!,
      stack: [{ category: "runtime" as const, label: "Runtime", value: "Node.js 20+" }],
    };
    expect(primaryTechnologyOf(stack)).toBe("—");
  });
});

describe("layersByCategory", () => {
  it("groups layers in taxonomy order and skips empty categories", () => {
    const groups = layersByCategory(getStack("fastapi-service")!);
    expect(groups.map((group) => group.category)).toEqual([
      "server",
      "database",
      "language",
      "testing",
      "quality",
      "runtime",
    ]);
  });
});

describe("stack slugs", () => {
  it("slugifies names", () => {
    expect(slugifyStackName("  My Cool Stack! ")).toBe("my-cool-stack");
  });

  it("numbers clashing slugs", () => {
    expect(uniqueStackSlug("BYOV Stack", ["byov-stack"])).toBe(
      "byov-stack-2",
    );
    expect(
      uniqueStackSlug("BYOV Stack", ["byov-stack", "byov-stack-2"]),
    ).toBe("byov-stack-3");
  });

  it("falls back for blank names", () => {
    expect(uniqueStackSlug("!!!", [])).toBe("stack");
  });
});

function validDraft(): StackDraft {
  return {
    ...defaultStackDraft(),
    name: "Data Notebook",
    tagline: "Notebook-style data apps for analysts.",
    stack: [
      { category: "frontend", label: "Framework", value: "Next.js 16 (App Router)" },
      { category: "language", label: "Language", value: "TypeScript 5 (strict)" },
    ],
  };
}

describe("validateStackDraft", () => {
  const existing = listStacks();

  it("accepts a complete draft", () => {
    expect(validateStackDraft(validDraft(), existing)).toEqual({});
  });

  it("requires a unique name", () => {
    expect(
      validateStackDraft({ ...validDraft(), name: "  " }, existing).name,
    ).toBeDefined();
    expect(
      validateStackDraft({ ...validDraft(), name: "BYOV Stack" }, existing)
        .name,
    ).toContain("already exists");
    expect(
      validateStackDraft({ ...validDraft(), name: "x".repeat(61) }, existing)
        .name,
    ).toContain("under 60");
  });

  it("allows keeping the own name while editing", () => {
    const stack = getStack("byov-stack")!;
    const draft: StackDraft = {
      ...validDraft(),
      name: stack.name,
    };
    expect(
      validateStackDraft(draft, existing, stack.slug).name,
    ).toBeUndefined();
  });

  it("requires a tagline and a known status", () => {
    expect(
      validateStackDraft({ ...validDraft(), tagline: "" }, existing)
        .tagline,
    ).toBeDefined();
    expect(
      validateStackDraft(
        { ...validDraft(), tagline: "x".repeat(141) },
        existing,
      ).tagline,
    ).toContain("under 140");
    expect(
      validateStackDraft({ ...validDraft(), status: "wip" }, existing)
        .status,
    ).toContain("draft, stable, deprecated");
  });

  it("requires at least one complete, unique stack layer", () => {
    expect(
      validateStackDraft({ ...validDraft(), stack: [] }, existing).stack,
    ).toContain("at least one");
    expect(
      validateStackDraft(
        {
          ...validDraft(),
          stack: [{ category: "frontend", label: "Framework", value: "" }],
        },
        existing,
      ).stack,
    ).toContain("at least one");
    expect(
      validateStackDraft(
        {
          ...validDraft(),
          stack: [
            { category: "frontend", label: "Framework", value: "Next.js" },
            { category: "server", label: "framework", value: "FastAPI" },
          ],
        },
        existing,
      ).stack,
    ).toContain("unique label");
  });

  it("requires a known category on every layer", () => {
    expect(
      validateStackDraft(
        {
          ...validDraft(),
          stack: [
            {
              category: "blockchain" as "frontend",
              label: "Ledger",
              value: "Solana",
            },
          ],
        },
        existing,
      ).stack,
    ).toContain("known category");
  });

  it("requires a supported node kind", () => {
    expect(
      validateStackDraft({ ...validDraft(), nodes: [] }, existing).nodes,
    ).toContain("at least one");
    expect(
      validateStackDraft({ ...validDraft(), nodes: ["kubernetes"] }, existing)
        .nodes,
    ).toContain("coolify");
  });

  it("requires test, lint and build commands", () => {
    const errors = validateStackDraft(
      { ...validDraft(), testCommand: "", lintCommand: " ", buildCommand: "" },
      existing,
    );
    expect(errors.testCommand).toBeDefined();
    expect(errors.lintCommand).toBeDefined();
    expect(errors.buildCommand).toBeDefined();
  });

  it("caps the starter ref length", () => {
    expect(
      validateStackDraft(
        { ...validDraft(), starterRef: "x".repeat(201) },
        existing,
      ).starterRef,
    ).toContain("under 200");
  });
});

describe("standardStackChecks", () => {
  it("keeps the governed gate names with per-stack commands", () => {
    const app = getApp("shopfloor-tickets");
    const checks = standardStackChecks({
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

describe("buildStack", () => {
  it("builds a complete stack with a unique slug", () => {
    const stack = buildStack(validDraft(), listStacks());
    expect(stack.slug).toBe("data-notebook");
    expect(stack.name).toBe("Data Notebook");
    expect(stack.status).toBe("draft");
    expect(stack.stack).toHaveLength(2);
    expect(stack.checks).toHaveLength(5);
    expect(stack.scaffold.length).toBeGreaterThan(0);
    expect(stack.docs.length).toBeGreaterThan(0);
    expect(stack.starter.kind).toBe("custom");
  });

  it("numbers the slug when the name clashes", () => {
    const stack = buildStack(
      { ...validDraft(), name: "BYOV Stack" },
      listStacks(),
    );
    expect(stack.slug).toBe("byov-stack-2");
  });

  it("derives the gates command from the draft", () => {
    const stack = buildStack(
      {
        ...validDraft(),
        testCommand: "pytest",
        lintCommand: "ruff check .",
        buildCommand: "docker build .",
      },
      listStacks(),
    );
    const gates = stack.scaffold.find(
      (step) => step.title === "Keep the gates green",
    );
    expect(gates?.command).toBe("pytest && ruff check . && docker build .");
  });

  it("defaults the starter ref to the custom slug", () => {
    const stack = buildStack(
      { ...validDraft(), starterRef: "" },
      listStacks(),
    );
    expect(stack.starter.ref).toBe("custom:data-notebook");
  });
});

describe("draftFromStack", () => {
  it("prefills an editable draft copy", () => {
    const source = getStack("fastapi-service")!;
    const draft = draftFromStack(source);
    expect(draft.name).toBe("Python API copy");
    expect(draft.status).toBe("draft");
    expect(draft.stack).toEqual(source.stack);
    expect(draft.testCommand).toBe("pytest");
    expect(draft.lintCommand).toBe("ruff check .");
    expect(draft.buildCommand).toBe("docker build .");
    expect(draft.starterRef).toBe(source.starter.ref);
    expect(validateStackDraft(draft, listStacks())).toEqual({});
  });
});

describe("replaceStack", () => {
  it("replaces by slug and leaves unknown slugs untouched", () => {
    const customs: TechStack[] = [buildStack(validDraft(), listStacks())];
    const updated = { ...customs[0], name: "Renamed" };
    expect(replaceStack(customs, customs[0].slug, updated)[0].name).toBe(
      "Renamed",
    );
    expect(replaceStack(customs, "no-such-slug", updated)).toEqual(customs);
  });
});

describe("inferStackCategory", () => {
  it("maps legacy labels to the taxonomy", () => {
    expect(inferStackCategory("Framework")).toBe("frontend");
    expect(inferStackCategory("UI")).toBe("frontend");
    expect(inferStackCategory("Language")).toBe("language");
    expect(inferStackCategory("Tests")).toBe("testing");
    expect(inferStackCategory("Lint")).toBe("quality");
    expect(inferStackCategory("Database")).toBe("database");
    expect(inferStackCategory("AI")).toBe("ai");
    expect(inferStackCategory("Something new")).toBe("runtime");
  });
});

describe("parseStoredStacks", () => {
  it("round-trips a stored workspace stack", () => {
    const stack = buildStack(validDraft(), listStacks());
    const parsed = parseStoredStacks(JSON.parse(JSON.stringify([stack])));
    expect(parsed).toEqual([stack]);
  });

  it("returns undefined for non-list payloads", () => {
    expect(parseStoredStacks(null)).toBeUndefined();
    expect(parseStoredStacks({})).toBeUndefined();
  });

  it("migrates layers saved before the taxonomy existed", () => {
    const stack = buildStack(validDraft(), listStacks());
    const legacy = {
      ...stack,
      stack: stack.stack.map((layer) => ({
        label: layer.label,
        value: layer.value,
      })),
    };
    const parsed = parseStoredStacks([legacy]);
    expect(parsed?.[0].stack.map((layer) => layer.category)).toEqual([
      "frontend",
      "language",
    ]);
  });

  it("skips invalid entries and keeps valid ones", () => {
    const stack = buildStack(validDraft(), listStacks());
    const parsed = parseStoredStacks([
      stack,
      { slug: "broken" },
      { ...stack, slug: "bad-status", status: "wip" },
      "not-an-object",
    ]);
    expect(parsed?.map((entry) => entry.slug)).toEqual([stack.slug]);
  });
});
