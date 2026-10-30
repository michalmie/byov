"use client";

import { useState } from "react";
import { SectionHead } from "@/components/data-ui";
import { buildAgentsPrompt } from "@/lib/agents-prompt";
import { SANDBOX_ENV_NAME } from "@/lib/apps";
import { useManagedApps } from "@/lib/apps-store";
import type { App } from "@/lib/control-plane";
import { resolveEnvUrl } from "@/lib/dev-urls";
import { useWorkspaceSettings } from "@/lib/settings-store";
import { useManagedStacks } from "@/lib/stack-store";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — the prompt stays selectable below.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label}`}
      className="btn-ghost px-2 py-0.5 text-xs"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/**
 * Copyable per-app AGENTS.md prompt: the initial instructions a coding
 * agent reads when it works on this app. Always renders — a missing
 * stack or Sandbox URL degrades to guidance inside the prompt.
 */
export function AgentsPromptCard({ app }: { app: App }) {
  const { getManagedStack } = useManagedStacks();
  const { settings, nodes } = useWorkspaceSettings();
  const { apps } = useManagedApps();

  const stack = getManagedStack(app.stack);
  const sandbox = app.envs.find((env) => env.name === SANDBOX_ENV_NAME);
  const nodeName =
    nodes.find((node) => node.slug === sandbox?.node)?.name ??
    sandbox?.node ??
    "";
  const resolved = sandbox
    ? resolveEnvUrl(app.slug, sandbox, {
        nodes,
        apps,
        devZone: settings.devZone,
        tailnetDomain: settings.tailnetDomain,
        defaultScenario: settings.defaultScenario,
        appScenarios: settings.appScenarios,
      })
    : { url: null as string | null, warning: undefined as string | undefined };

  const prompt = buildAgentsPrompt({
    app,
    stack,
    nodeName: nodeName || undefined,
    sandboxUrl: resolved.url,
  });

  return (
    <section
      id="agent-prompt"
      aria-labelledby="agent-prompt-heading"
      className="card grid scroll-mt-24 gap-4 p-5 sm:p-6"
    >
      <div id="agent-prompt-heading">
        <SectionHead
          title="Agent instructions"
          lede="The AGENTS.md prompt for this app — paste it into the repo so every coding agent reads the same rules."
        />
      </div>
      <div
        className="overflow-hidden rounded-[var(--radius-well)] border"
        style={{ borderColor: "var(--color-rule)" }}
      >
        <div
          className="flex items-center justify-between gap-2 px-3 py-1.5"
          style={{ background: "var(--color-paper-2)" }}
        >
          <span className="mono text-xs" style={{ color: "var(--color-muted)" }}>
            AGENTS.md
          </span>
          <CopyButton text={prompt} label="AGENTS.md" />
        </div>
        <pre className="mono max-h-96 overflow-auto px-3 py-2.5 text-[13px]">
          {prompt}
        </pre>
      </div>
    </section>
  );
}
