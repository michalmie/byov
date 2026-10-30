// Per-app AGENTS.md prompt: the initial instructions a coding agent
// (Claude, Codex, OpenCode, …) reads when it works on a BYOV-managed
// app. Pure string building — no DOM access — so the UI (app detail,
// Sandbox setup guide) and tests share one source of truth.

import type { App } from "./control-plane";
import type { TechStack } from "./stacks";
import { SANDBOX_ENV_NAME } from "./apps";

export interface AgentsPromptInput {
  /** The app the prompt is generated for. */
  app: App;
  /** Resolved managed stack; undefined when the app has none (yet). */
  stack?: TechStack;
  /** Display name of the node hosting the Sandbox env. */
  nodeName?: string;
  /** Resolved Sandbox URL; null while the node setup is unfinished. */
  sandboxUrl?: string | null;
}

function checkCommandOf(
  stack: TechStack | undefined,
  name: string,
): string {
  return stack?.checks.find((check) => check.name === name)?.command ?? "";
}

/** Local gate commands joined for one terminal line, e.g. test && lint. */
export function agentsGateLine(stack: TechStack | undefined): string {
  return [
    checkCommandOf(stack, "Unit tests"),
    checkCommandOf(stack, "Lint"),
    checkCommandOf(stack, "Production build"),
  ]
    .filter(Boolean)
    .join(" && ");
}

function stackLines(stack: TechStack): string[] {
  return stack.stack.map((layer) => `- ${layer.label}: ${layer.value}`);
}

function scriptLines(stack: TechStack): string[] {
  const pick = (name: string): string | undefined => {
    const command = stack.scripts[name];
    return command ? `- \`${name}\`: \`${command}\`` : undefined;
  };
  return ["dev", "test:unit", "lint", "typecheck", "build", "start"]
    .map(pick)
    .filter((line): line is string => Boolean(line));
}

/**
 * Build the full AGENTS.md markdown for an app. Always renders —
 * missing stack or Sandbox URL degrade to guidance instead of blanks.
 */
export function buildAgentsPrompt(input: AgentsPromptInput): string {
  const { app, stack, nodeName, sandboxUrl } = input;
  const sandbox = app.envs.find((env) => env.name === SANDBOX_ENV_NAME);
  const nodeLabel = nodeName || sandbox?.node || "its assigned node";
  const gates = agentsGateLine(stack);
  const lines: string[] = [];

  lines.push(`# ${app.name} — agent instructions`);
  lines.push("");
  lines.push(
    `This app is managed by BYOV (Bring Your Own Vibe): a governed home for vibe-coded apps at work. ` +
      `You build the app; BYOV watches it. Read this file before every change.`,
  );
  lines.push("");
  lines.push("## The app");
  lines.push("");
  lines.push(`- Name: ${app.name}`);
  lines.push(`- Slug: \`${app.slug}\``);
  if (app.description.trim()) {
    lines.push(`- What it does: ${app.description.trim()}`);
  }
  if (stack) {
    lines.push(`- Tech stack: ${stack.name} (\`${stack.slug}\`)`);
  } else {
    lines.push("- Tech stack: none assigned yet — keep the repo's own setup");
  }
  lines.push("");

  lines.push("## The BYOV harness around you");
  lines.push("");
  lines.push(
    "- **Control Plane** — the central UI for this app: environments, deployments, and required checks. " +
      "Every change you ship shows up there with who shipped it and whether the gates passed.",
  );
  lines.push(
    `- **Sandbox environment** — the app's first environment, pinned to node \`${nodeLabel}\`. ` +
      "The Sandbox is yours to break: iterate here, then promote to staging or production.",
  );
  if (sandboxUrl) {
    lines.push(
      `- **Sandbox URL** — \`${sandboxUrl}\`. The app runs here: API base, webhook target, and node FQDN all use it.`,
    );
  } else {
    lines.push(
      "- **Sandbox URL** — not assigned yet; the owner finishes the node setup in BYOV Settings → Nodes, then this URL is where the app runs.",
    );
  }
  lines.push(
    "- **Nodes** — admin-approved deployment targets (self-hosted Coolify first). Deploy only to nodes BYOV knows; never invent a target.",
  );
  lines.push("");

  if (stack) {
    lines.push(`## Stack — ${stack.name}`);
    lines.push("");
    lines.push(stack.tagline);
    lines.push("");
    lines.push(...stackLines(stack));
    lines.push("");
    const scripts = scriptLines(stack);
    if (scripts.length > 0) {
      lines.push("Key scripts:");
      lines.push("");
      lines.push(...scripts);
      lines.push("");
    }
    if (stack.starter.ref) {
      lines.push(
        `Scaffolded from \`${stack.starter.ref}\` — stay close to the starter's configs and scripts so the gates keep passing.`,
      );
      lines.push("");
    }
  }

  lines.push("## Required gates — keep them green");
  lines.push("");
  lines.push(
    "Nothing ships without passing these. The first three run locally on every change; the last two run as BYOV gates:",
  );
  lines.push("");
  lines.push("1. Unit tests");
  lines.push("2. Lint");
  lines.push("3. Production build");
  lines.push("4. DLP scan (BYOV gate, every change)");
  lines.push("5. Dependency audit (BYOV gate, nightly)");
  lines.push("");
  if (gates) {
    lines.push("Run before you call a change done:");
    lines.push("");
    lines.push("```sh");
    lines.push(gates);
    lines.push("```");
    lines.push("");
  } else {
    lines.push(
      "This app has no stack commands yet: run whatever tests, lint, and build the project uses — every change passes all three before it ships.",
    );
    lines.push("");
  }

  lines.push("## House rules");
  lines.push("");
  lines.push(
    "- Never commit secrets, environment values, or real data. Copy `.env.example` to local env files and keep real values out of git.",
  );
  lines.push(
    "- Run the dev server on the app's own port. The BYOV Control Plane itself uses `3014` — never take it.",
  );
  lines.push(
    "- Keep the change small and shippable: passing gates beat clever refactors.",
  );
  lines.push(
    "- When a gate fails, fix the cause — never weaken the check to make it pass.",
  );
  lines.push(
    "- Generated code is still your change: review it like your own before it ships.",
  );
  lines.push("");

  return lines.join("\n");
}
