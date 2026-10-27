// App template catalog. Each shipped stack keeps a manifest under
// templates/<slug>/; this module exposes the typed registry the UI
// and tests read, plus the pure draft logic for workspace templates
// defined in the browser. Adding a stack = new folder + manifest +
// entry here. Gates stay governed: every template carries the same
// five required gate names; only the test/lint/build commands adapt
// per stack.
import byovStackManifest from "@/templates/byov-stack/manifest.json";
import aiChatbotManifest from "@/templates/ai-chatbot/manifest.json";
import viteSpaManifest from "@/templates/vite-spa/manifest.json";
import fastapiServiceManifest from "@/templates/fastapi-service/manifest.json";

export type TemplateStatus = "draft" | "stable" | "deprecated";

export interface TemplateStackItem {
  label: string;
  value: string;
}

export interface TemplateCheck {
  name: string;
  command: string;
  cadence: string;
}

export interface TemplateScaffoldStep {
  title: string;
  detail: string;
  command?: string;
}

export interface TemplateStarter {
  kind: string;
  ref: string;
  note: string;
}

export interface AppTemplate {
  slug: string;
  name: string;
  tagline: string;
  status: TemplateStatus;
  stack: TemplateStackItem[];
  packages: Record<string, string>;
  scripts: Record<string, string>;
  checks: TemplateCheck[];
  nodes: string[];
  scaffold: TemplateScaffoldStep[];
  starter: TemplateStarter;
  docs: string[];
}

const templates: AppTemplate[] = [
  byovStackManifest as AppTemplate,
  aiChatbotManifest as AppTemplate,
  viteSpaManifest as AppTemplate,
  fastapiServiceManifest as AppTemplate,
];

/** Shipped catalog, in display order. Workspace customs overlay it. */
export function listTemplates(): AppTemplate[] {
  return templates;
}

export function getTemplate(slug: string): AppTemplate | undefined {
  return templates.find((template) => template.slug === slug);
}

/** Framework value for catalog display; "—" when the stack has no such layer. */
export function frameworkOf(template: AppTemplate): string {
  const framework = template.stack.find((item) => item.label === "Framework");
  return framework ? framework.value : "—";
}

// Workspace templates: pure draft logic. No DOM access here so every
// rule stays unit-testable; lib/template-store.ts owns the hooks.

export const TEMPLATE_STORAGE_KEY = "byov:templates:v1";

/** Node kinds a template may target; ids match the manifest contract. */
export const SUPPORTED_TEMPLATE_NODE_KINDS = ["coolify"] as const;

export const TEMPLATE_STATUSES: readonly TemplateStatus[] = [
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

/** Raw form values for defining or editing a workspace template. */
export interface TemplateDraft {
  name: string;
  tagline: string;
  status: string;
  stack: TemplateStackItem[];
  nodes: string[];
  testCommand: string;
  lintCommand: string;
  buildCommand: string;
  starterRef: string;
}

export type TemplateField =
  | "name"
  | "tagline"
  | "status"
  | "stack"
  | "nodes"
  | "testCommand"
  | "lintCommand"
  | "buildCommand"
  | "starterRef";
export type TemplateFieldErrors = Partial<Record<TemplateField, string>>;

export function defaultTemplateDraft(): TemplateDraft {
  return {
    name: "",
    tagline: "",
    status: "draft",
    stack: [
      { label: "Framework", value: "" },
      { label: "Language", value: "" },
      { label: "Tests", value: "" },
    ],
    nodes: ["coolify"],
    testCommand: "npm run test:unit",
    lintCommand: "npm run lint",
    buildCommand: "npm run build",
    starterRef: "",
  };
}

/** Prefill a draft from an existing template (clone flow). */
export function draftFromTemplate(template: AppTemplate): TemplateDraft {
  const commandOf = (name: string): string =>
    template.checks.find((check) => check.name === name)?.command ?? "";
  return {
    name: `${template.name} copy`,
    tagline: template.tagline,
    status: "draft",
    stack: template.stack.map((item) => ({ ...item })),
    nodes: [...template.nodes],
    testCommand: commandOf("Unit tests"),
    lintCommand: commandOf("Lint"),
    buildCommand: commandOf("Production build"),
    starterRef: template.starter.ref,
  };
}

export function slugifyTemplateName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function uniqueTemplateSlug(
  name: string,
  existingSlugs: readonly string[],
): string {
  const base = slugifyTemplateName(name) || "template";
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
  errors: TemplateFieldErrors,
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

export function validateTemplateDraft(
  draft: TemplateDraft,
  existing: readonly AppTemplate[],
  selfSlug?: string,
): TemplateFieldErrors {
  const errors: TemplateFieldErrors = {};

  const name = draft.name.trim();
  if (!name) {
    errors.name = "Give the template a name.";
  } else if (name.length > MAX_NAME) {
    errors.name = `Keep the name under ${MAX_NAME} characters.`;
  } else {
    const slug = slugifyTemplateName(name);
    const clash = existing.some(
      (template) =>
        template.slug !== selfSlug &&
        (template.slug === slug ||
          template.name.trim().toLowerCase() === name.toLowerCase()),
    );
    if (clash) {
      errors.name = "A template with this name already exists.";
    }
  }

  const tagline = draft.tagline.trim();
  if (!tagline) {
    errors.tagline = "Add a one-line tagline.";
  } else if (tagline.length > MAX_TAGLINE) {
    errors.tagline = `Keep the tagline under ${MAX_TAGLINE} characters.`;
  }

  if (!(TEMPLATE_STATUSES as readonly string[]).includes(draft.status)) {
    errors.status = `Status must be one of: ${TEMPLATE_STATUSES.join(", ")}.`;
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
        !(SUPPORTED_TEMPLATE_NODE_KINDS as readonly string[]).includes(kind),
    )
  ) {
    errors.nodes = `Supported node kinds: ${SUPPORTED_TEMPLATE_NODE_KINDS.join(", ")}.`;
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
export function standardTemplateChecks(draft: TemplateDraft): TemplateCheck[] {
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
  draft: TemplateDraft,
  starterRef: string,
): TemplateScaffoldStep[] {
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
      detail: "Use a clean install so versions match the template.",
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

/** Build a validated draft into a workspace template. */
export function buildTemplate(
  draft: TemplateDraft,
  existing: readonly AppTemplate[],
): AppTemplate {
  const slug = uniqueTemplateSlug(
    draft.name,
    existing.map((template) => template.slug),
  );
  const starterRef = draft.starterRef.trim() || `custom:${slug}`;
  return {
    slug,
    name: draft.name.trim(),
    tagline: draft.tagline.trim(),
    status: draft.status as TemplateStatus,
    stack: draft.stack
      .filter((item) => item.label.trim() && item.value.trim())
      .map((item) => ({
        label: item.label.trim(),
        value: item.value.trim(),
      })),
    packages: {},
    scripts: {
      test: draft.testCommand.trim(),
      lint: draft.lintCommand.trim(),
      build: draft.buildCommand.trim(),
    },
    checks: standardTemplateChecks(draft),
    nodes: [...draft.nodes],
    scaffold: scaffoldForDraft(draft, starterRef),
    starter: {
      kind: "custom",
      ref: starterRef,
      note: "Workspace template, defined in the Control Plane. Versioned starter repos arrive with the BYOV client.",
    },
    docs: ["templates/README.md"],
  };
}

/** Replace one template by slug; unknown slugs leave the list untouched. */
export function replaceTemplate(
  stored: readonly AppTemplate[],
  slug: string,
  template: AppTemplate,
): AppTemplate[] {
  return stored.map((entry) => (entry.slug === slug ? template : entry));
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

function parseStack(value: unknown): TemplateStackItem[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const stack: TemplateStackItem[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      return undefined;
    }
    const { label, value: itemValue } = entry;
    if (typeof label !== "string" || !label || typeof itemValue !== "string" || !itemValue) {
      return undefined;
    }
    stack.push({ label, value: itemValue });
  }
  return stack;
}

function parseChecks(value: unknown): TemplateCheck[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const checks: TemplateCheck[] = [];
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

function parseScaffold(value: unknown): TemplateScaffoldStep[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const steps: TemplateScaffoldStep[] = [];
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

/** Parse stored workspace templates; undefined means "no customs yet". */
export function parseStoredTemplates(value: unknown): AppTemplate[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const stored: AppTemplate[] = [];
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
      !(TEMPLATE_STATUSES as readonly string[]).includes(status) ||
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
      status: status as TemplateStatus,
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
