// Tech stack catalog. Each shipped stack keeps a manifest under
// stacks/<slug>/; this module exposes the typed registry the UI
// and tests read, plus the pure draft logic for workspace stacks
// defined in the browser. Adding a stack = new folder + manifest +
// entry here. Gates stay governed: every stack carries the same
// five required gate names; only the test/lint/build commands adapt
// per stack.
import byovStackManifest from "@/stacks/byov-stack/manifest.json";
import aiChatbotManifest from "@/stacks/ai-chatbot/manifest.json";
import viteSpaManifest from "@/stacks/vite-spa/manifest.json";
import fastapiServiceManifest from "@/stacks/fastapi-service/manifest.json";

export type StackStatus = "draft" | "stable" | "deprecated";

/** Layer taxonomy: where in the system a technology sits. */
export const STACK_CATEGORIES = [
  "frontend",
  "server",
  "database",
  "language",
  "testing",
  "quality",
  "runtime",
  "ai",
] as const;

export type StackCategory = (typeof STACK_CATEGORIES)[number];

export const STACK_CATEGORY_LABELS: Record<StackCategory, string> = {
  frontend: "Frontend",
  server: "Server",
  database: "Database",
  language: "Language",
  testing: "Testing",
  quality: "Quality",
  runtime: "Runtime",
  ai: "AI",
};

export interface StackLayer {
  category: StackCategory;
  label: string;
  value: string;
}

export interface StackCheck {
  name: string;
  command: string;
  cadence: string;
}

export interface ScaffoldStep {
  title: string;
  detail: string;
  command?: string;
}

export interface StackStarter {
  kind: string;
  ref: string;
  note: string;
}

export interface TechStack {
  slug: string;
  name: string;
  tagline: string;
  status: StackStatus;
  stack: StackLayer[];
  packages: Record<string, string>;
  scripts: Record<string, string>;
  checks: StackCheck[];
  nodes: string[];
  scaffold: ScaffoldStep[];
  starter: StackStarter;
  docs: string[];
}

const stacks: TechStack[] = [
  byovStackManifest as TechStack,
  aiChatbotManifest as TechStack,
  viteSpaManifest as TechStack,
  fastapiServiceManifest as TechStack,
];

/** Shipped catalog, in display order. Workspace customs overlay it. */
export function listStacks(): TechStack[] {
  return stacks;
}

export function getStack(slug: string): TechStack | undefined {
  return stacks.find((stack) => stack.slug === slug);
}

/** Headline technology for catalog display: the Framework layer value. */
export function primaryTechnologyOf(stack: TechStack): string {
  const framework = stack.stack.find((item) => item.label === "Framework");
  return framework ? framework.value : "—";
}

/** Layers grouped by category, in taxonomy order, skipping empties. */
export function layersByCategory(
  stack: TechStack,
): { category: StackCategory; layers: StackLayer[] }[] {
  return STACK_CATEGORIES.map((category) => ({
    category,
    layers: stack.stack.filter((item) => item.category === category),
  })).filter((group) => group.layers.length > 0);
}

// Workspace stacks: pure draft logic. No DOM access here so every
// rule stays unit-testable; lib/stack-store.ts owns the hooks.

export const STACK_STORAGE_KEY = "byov:stacks:v1";
/** Previous key, read once to migrate customs saved as templates. */
export const LEGACY_TEMPLATE_STORAGE_KEY = "byov:templates:v1";

/** Node kinds a stack may target; ids match the manifest contract. */
export const SUPPORTED_STACK_NODE_KINDS = ["coolify", "vercel"] as const;

export const STACK_STATUSES: readonly StackStatus[] = [
  "draft",
  "stable",
  "deprecated",
];

const MAX_NAME = 60;
const MAX_TAGLINE = 140;
const MAX_STACK_LABEL = 40;
const MAX_STACK_VALUE = 80;
const MAX_STACK_LAYERS = 8;
const MAX_COMMAND = 120;
const MAX_STARTER_REF = 200;

/** Raw form values for defining or editing a workspace stack. */
export interface StackDraft {
  name: string;
  tagline: string;
  status: string;
  stack: StackLayer[];
  nodes: string[];
  testCommand: string;
  lintCommand: string;
  buildCommand: string;
  starterRef: string;
}

export type StackField =
  | "name"
  | "tagline"
  | "status"
  | "stack"
  | "nodes"
  | "testCommand"
  | "lintCommand"
  | "buildCommand"
  | "starterRef";
export type StackFieldErrors = Partial<Record<StackField, string>>;

export function defaultStackDraft(): StackDraft {
  return {
    name: "",
    tagline: "",
    status: "draft",
    stack: [
      { category: "frontend", label: "Framework", value: "" },
      { category: "language", label: "Language", value: "" },
      { category: "testing", label: "Tests", value: "" },
    ],
    nodes: ["coolify"],
    testCommand: "npm run test:unit",
    lintCommand: "npm run lint",
    buildCommand: "npm run build",
    starterRef: "",
  };
}

/** Prefill a draft from an existing stack (clone flow). */
export function draftFromStack(stack: TechStack): StackDraft {
  const commandOf = (name: string): string =>
    stack.checks.find((check) => check.name === name)?.command ?? "";
  return {
    name: `${stack.name} copy`,
    tagline: stack.tagline,
    status: "draft",
    stack: stack.stack.map((item) => ({ ...item })),
    nodes: [...stack.nodes],
    testCommand: commandOf("Unit tests"),
    lintCommand: commandOf("Lint"),
    buildCommand: commandOf("Production build"),
    starterRef: stack.starter.ref,
  };
}

export function slugifyStackName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function uniqueStackSlug(
  name: string,
  existingSlugs: readonly string[],
): string {
  const base = slugifyStackName(name) || "stack";
  if (!existingSlugs.includes(base)) {
    return base;
  }
  let counter = 2;
  while (existingSlugs.includes(`${base}-${counter}`)) {
    counter += 1;
  }
  return `${base}-${counter}`;
}

function validateCommand(
  errors: StackFieldErrors,
  field: "testCommand" | "lintCommand" | "buildCommand",
  label: string,
  value: string,
): void {
  const command = value.trim();
  if (!command) {
    errors[field] = `Add a ${label} command, e.g. npm run test:unit.`;
  } else if (command.length > MAX_COMMAND) {
    errors[field] = `Keep the ${label} command under ${MAX_COMMAND} characters.`;
  }
}

export function validateStackDraft(
  draft: StackDraft,
  existing: readonly TechStack[],
  selfSlug?: string,
): StackFieldErrors {
  const errors: StackFieldErrors = {};

  const name = draft.name.trim();
  if (!name) {
    errors.name = "Give the stack a name.";
  } else if (name.length > MAX_NAME) {
    errors.name = `Keep the name under ${MAX_NAME} characters.`;
  } else {
    const slug = slugifyStackName(name);
    const clash = existing.some(
      (stack) =>
        stack.slug !== selfSlug &&
        (stack.slug === slug ||
          stack.name.trim().toLowerCase() === name.toLowerCase()),
    );
    if (clash) {
      errors.name = "A stack with this name already exists.";
    }
  }

  const tagline = draft.tagline.trim();
  if (!tagline) {
    errors.tagline = "Add a one-line tagline.";
  } else if (tagline.length > MAX_TAGLINE) {
    errors.tagline = `Keep the tagline under ${MAX_TAGLINE} characters.`;
  }

  if (!(STACK_STATUSES as readonly string[]).includes(draft.status)) {
    errors.status = `Status must be one of: ${STACK_STATUSES.join(", ")}.`;
  }

  const layers = draft.stack.filter(
    (item) => item.label.trim() && item.value.trim(),
  );
  if (layers.length === 0) {
    errors.stack = "Add at least one stack layer with a label and a value.";
  } else if (draft.stack.length > MAX_STACK_LAYERS) {
    errors.stack = `Keep the stack under ${MAX_STACK_LAYERS} layers.`;
  } else {
    const labels = layers.map((item) => item.label.trim().toLowerCase());
    if (new Set(labels).size !== labels.length) {
      errors.stack = "Give every stack layer a unique label.";
    } else if (
      layers.some(
        (item) =>
          !(STACK_CATEGORIES as readonly string[]).includes(item.category),
      )
    ) {
      errors.stack = "Give every stack layer a known category.";
    } else {
      const oversized = layers.some(
        (item) =>
          item.label.trim().length > MAX_STACK_LABEL ||
          item.value.trim().length > MAX_STACK_VALUE,
      );
      if (oversized) {
        errors.stack =
          `Keep layer labels under ${MAX_STACK_LABEL} characters and values under ${MAX_STACK_VALUE}.`;
      }
    }
  }

  if (draft.nodes.length === 0) {
    errors.nodes = "Target at least one node kind.";
  } else if (
    draft.nodes.some(
      (kind) =>
        !(SUPPORTED_STACK_NODE_KINDS as readonly string[]).includes(kind),
    )
  ) {
    errors.nodes = `Supported node kinds: ${SUPPORTED_STACK_NODE_KINDS.join(", ")}.`;
  }

  validateCommand(errors, "testCommand", "test", draft.testCommand);
  validateCommand(errors, "lintCommand", "lint", draft.lintCommand);
  validateCommand(errors, "buildCommand", "build", draft.buildCommand);

  const starterRef = draft.starterRef.trim();
  if (starterRef.length > MAX_STARTER_REF) {
    errors.starterRef = `Keep the starter ref under ${MAX_STARTER_REF} characters.`;
  }

  return errors;
}

/** The five governed gates with per-stack commands. */
export function standardStackChecks(draft: StackDraft): StackCheck[] {
  return [
    {
      name: "Unit tests",
      command: draft.testCommand.trim(),
      cadence: "Every change",
    },
    {
      name: "Lint",
      command: draft.lintCommand.trim(),
      cadence: "Every change",
    },
    {
      name: "Production build",
      command: draft.buildCommand.trim(),
      cadence: "Every change",
    },
    { name: "DLP scan", command: "BYOV gate", cadence: "Every change" },
    {
      name: "Dependency audit",
      command: "BYOV gate",
      cadence: "Nightly",
    },
  ];
}

function scaffoldForDraft(
  draft: StackDraft,
  starterRef: string,
): ScaffoldStep[] {
  const gates = [draft.testCommand.trim(), draft.lintCommand.trim(), draft.buildCommand.trim()]
    .filter(Boolean)
    .join(" && ");
  return [
    {
      title: "Create the app from the starter",
      detail:
        `Start from ${starterRef} — copy it into a new repository and ` +
        `make it yours.`,
    },
    {
      title: "Install dependencies",
      detail: "Use a clean install so versions match the stack.",
    },
    {
      title: "Configure the environment",
      detail:
        "Copy the example env file and fill in local values. Never commit secrets.",
      command: "cp .env.example .env.local",
    },
    {
      title: "Run the dev server",
      detail: "Pick a free port — the Control Plane itself uses 3014.",
    },
    {
      title: "Keep the gates green",
      detail:
        "Every change passes unit tests, lint and the production build before it ships.",
      ...(gates ? { command: gates } : {}),
    },
    {
      title: "Ship to an approved node",
      detail:
        "Register the app in BYOV and deploy only to admin-approved targets.",
    },
  ];
}

/** Build a validated draft into a workspace stack. */
export function buildStack(
  draft: StackDraft,
  existing: readonly TechStack[],
): TechStack {
  const slug = uniqueStackSlug(
    draft.name,
    existing.map((stack) => stack.slug),
  );
  const starterRef = draft.starterRef.trim() || `custom:${slug}`;
  return {
    slug,
    name: draft.name.trim(),
    tagline: draft.tagline.trim(),
    status: draft.status as StackStatus,
    stack: draft.stack
      .filter((item) => item.label.trim() && item.value.trim())
      .map((item) => ({
        category: item.category,
        label: item.label.trim(),
        value: item.value.trim(),
      })),
    packages: {},
    scripts: {
      test: draft.testCommand.trim(),
      lint: draft.lintCommand.trim(),
      build: draft.buildCommand.trim(),
    },
    checks: standardStackChecks(draft),
    nodes: [...draft.nodes],
    scaffold: scaffoldForDraft(draft, starterRef),
    starter: {
      kind: "custom",
      ref: starterRef,
      note: "Workspace stack, defined in the Control Plane. Versioned starter repos arrive with the BYOV client.",
    },
    docs: ["stacks/README.md"],
  };
}

/** Replace one stack by slug; unknown slugs leave the list untouched. */
export function replaceStack(
  stored: readonly TechStack[],
  slug: string,
  stack: TechStack,
): TechStack[] {
  return stored.map((entry) => (entry.slug === slug ? stack : entry));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string")
  );
}

function isStackCategory(value: unknown): value is StackCategory {
  return (
    typeof value === "string" &&
    (STACK_CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * Best-effort category for layers saved before the taxonomy existed.
 * New drafts always set an explicit category.
 */
export function inferStackCategory(label: string): StackCategory {
  switch (label.trim().toLowerCase()) {
    case "framework":
    case "ui":
      return "frontend";
    case "language":
      return "language";
    case "tests":
      return "testing";
    case "lint":
      return "quality";
    case "database":
      return "database";
    case "ai":
      return "ai";
    default:
      return "runtime";
  }
}

function parseStack(value: unknown): StackLayer[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const stack: StackLayer[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      return undefined;
    }
    const { category, label, value: itemValue } = entry;
    if (typeof label !== "string" || !label || typeof itemValue !== "string" || !itemValue) {
      return undefined;
    }
    stack.push({
      category: isStackCategory(category)
        ? category
        : inferStackCategory(label),
      label,
      value: itemValue,
    });
  }
  return stack;
}

function parseChecks(value: unknown): StackCheck[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const checks: StackCheck[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      return undefined;
    }
    const { name, command, cadence } = entry;
    if (
      typeof name !== "string" ||
      !name ||
      typeof command !== "string" ||
      !command ||
      typeof cadence !== "string" ||
      !cadence
    ) {
      return undefined;
    }
    checks.push({ name, command, cadence });
  }
  return checks;
}

function parseStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const record: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") {
      record[key] = entry;
    }
  }
  return record;
}

function parseScaffold(value: unknown): ScaffoldStep[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const steps: ScaffoldStep[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      return undefined;
    }
    const { title, detail, command } = entry;
    if (typeof title !== "string" || !title || typeof detail !== "string" || !detail) {
      return undefined;
    }
    steps.push({
      title,
      detail,
      ...(typeof command === "string" && command ? { command } : {}),
    });
  }
  return steps;
}

/** Parse stored workspace stacks; undefined means "no customs yet". */
export function parseStoredStacks(value: unknown): TechStack[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const stored: TechStack[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    const {
      slug,
      name,
      tagline,
      status,
      stack,
      packages,
      scripts,
      checks,
      nodes,
      scaffold,
      starter,
      docs,
    } = entry;
    const parsedStack = parseStack(stack);
    const parsedChecks = parseChecks(checks);
    const parsedScaffold = parseScaffold(scaffold);
    const parsedPackages = parseStringRecord(packages);
    const parsedScripts = parseStringRecord(scripts);
    if (
      typeof slug !== "string" ||
      !slug ||
      typeof name !== "string" ||
      !name ||
      typeof tagline !== "string" ||
      !tagline ||
      typeof status !== "string" ||
      !(STACK_STATUSES as readonly string[]).includes(status) ||
      !parsedStack ||
      !parsedPackages ||
      !parsedScripts ||
      !parsedChecks ||
      !isStringArray(nodes) ||
      nodes.length === 0 ||
      !parsedScaffold ||
      !isRecord(starter) ||
      typeof starter.kind !== "string" ||
      !starter.kind ||
      typeof starter.ref !== "string" ||
      !starter.ref ||
      typeof starter.note !== "string" ||
      !isStringArray(docs) ||
      docs.length === 0
    ) {
      continue;
    }
    stored.push({
      slug,
      name,
      tagline,
      status: status as StackStatus,
      stack: parsedStack,
      packages: parsedPackages,
      scripts: parsedScripts,
      checks: parsedChecks,
      nodes,
      scaffold: parsedScaffold,
      starter: {
        kind: starter.kind as string,
        ref: starter.ref as string,
        note: starter.note as string,
      },
      docs,
    });
  }
  return stored;
}
