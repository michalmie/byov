"use client";

import { useState } from "react";
import Link from "next/link";
import type { App } from "@/lib/control-plane";
import { SANDBOX_ENV_NAME } from "@/lib/apps";
import { useManagedApps } from "@/lib/apps-store";
import { resolveEnvUrl } from "@/lib/dev-urls";
import { useWorkspaceSettings } from "@/lib/settings-store";
import { useManagedStacks } from "@/lib/stack-store";
import { buildAgentsPrompt } from "@/lib/agents-prompt";

type GuideMode = "agent" | "mycode" | "aicode";

const MODES: Array<{ id: GuideMode; title: string; blurb: string }> = [
  {
    id: "agent",
    title: "Run a Coding Agent",
    blurb: "Give Claude, Codex, or OpenCode a workspace",
  },
  {
    id: "mycode",
    title: "Run My Code",
    blurb: "Ship code you wrote to the Sandbox",
  },
  {
    id: "aicode",
    title: "Run AI-Generated Code",
    blurb: "Safely try output from your app or agent",
  },
];

const AGENTS = [
  { id: "claude", label: "Claude", command: "claude" },
  { id: "codex", label: "Codex", command: "codex" },
  { id: "opencode", label: "OpenCode", command: "opencode" },
] as const;

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — the command stays selectable below.
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

function CommandBlock({
  title,
  command,
  extra,
  scroll,
}: {
  title: string;
  command: string;
  extra?: React.ReactNode;
  scroll?: boolean;
}) {
  return (
    <div
      className="overflow-hidden rounded-[var(--radius-well)] border"
      style={{ borderColor: "var(--color-rule)" }}
    >
      <div
        className="flex items-center justify-between gap-2 px-3 py-1.5"
        style={{ background: "var(--color-paper-2)" }}
      >
        <span className="mono text-xs" style={{ color: "var(--color-muted)" }}>
          {title}
        </span>
        <span className="flex items-center gap-2">
          {extra}
          <CopyButton text={command} label={title} />
        </span>
      </div>
      <pre
        className={
          scroll
            ? "mono max-h-96 overflow-auto px-3 py-2.5 text-[13px]"
            : "mono overflow-x-auto px-3 py-2.5 text-[13px]"
        }
      >
        {command}
      </pre>
    </div>
  );
}

function commandOf(
  stack: { checks: Array<{ name: string; command: string }> } | undefined,
  name: string,
): string {
  return stack?.checks.find((check) => check.name === name)?.command ?? "";
}

/**
 * Owner setup guide for a fresh Sandbox environment: pick what to run,
 * connect the station, then follow the steps to the first Sandbox deploy.
 */
export function SandboxSetupGuide({ app }: { app: App }) {
  const [mode, setMode] = useState<GuideMode>("agent");
  const [agent, setAgent] = useState<(typeof AGENTS)[number]["id"]>("claude");
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

  const gates = [commandOf(stack, "Unit tests"), commandOf(stack, "Lint"), commandOf(stack, "Production build")]
    .filter(Boolean)
    .join(" && ");
  const devCommand = stack?.scaffold.find((step) =>
    /dev server/i.test(step.title),
  )?.command;
  const agentCommand =
    AGENTS.find((entry) => entry.id === agent)?.command ?? "claude";
  const hasStarter = Boolean(stack || app.stack);
  const repoWords = hasStarter ? "the scaffolded repo" : "your repo";
  const agentsPrompt = buildAgentsPrompt({
    app,
    stack,
    nodeName,
    sandboxUrl: resolved.url,
  });

  return (
    <section
      aria-labelledby="sandbox-guide-heading"
      className="card grid gap-6 p-5 sm:p-6"
    >
      <div className="max-w-2xl">
        <h2
          id="sandbox-guide-heading"
          className="text-xl font-semibold tracking-tight"
        >
          Get started with the {app.name} Sandbox
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--color-ink-2)" }}>
          Every new app starts with one Sandbox environment
          {nodeName ? (
            <>
              {" "}
              on <span className="mono">{nodeName}</span>
            </>
          ) : (
            ""
          )}
          . Choose what you want to run.
        </p>
      </div>

      <div
        role="group"
        aria-label="What to run in the Sandbox"
        className="grid gap-3 sm:grid-cols-3"
      >
        {MODES.map((entry) => {
          const active = mode === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              aria-pressed={active}
              onClick={() => setMode(entry.id)}
              className="rounded-[var(--radius-well)] border p-4 text-left"
              style={{
                borderColor: active
                  ? "var(--color-accent-deep)"
                  : "var(--color-rule)",
                background: active
                  ? "var(--color-info-soft)"
                  : "var(--color-paper)",
              }}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold">{entry.title}</span>
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border"
                  style={{
                    borderColor: active
                      ? "var(--color-accent-deep)"
                      : "var(--color-rule)",
                  }}
                >
                  {active && (
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: "var(--color-accent-deep)" }}
                    />
                  )}
                </span>
              </span>
              <span
                className="mt-1 block text-[13px]"
                style={{ color: "var(--color-ink-2)" }}
              >
                {entry.blurb}
              </span>
            </button>
          );
        })}
      </div>

      <div>
        <h3 className="text-[15px] font-semibold tracking-tight">Set up</h3>
        <ol className="mt-4 grid gap-6">
          <li className="grid gap-2">
            <p className="font-semibold">
              <span
                className="mono mr-2 text-sm"
                style={{ color: "var(--color-ink-2)" }}
              >
                01
              </span>
              Connect your station to the Sandbox
            </p>
            <p
              className="max-w-[70ch] text-sm"
              style={{ color: "var(--color-ink-2)" }}
            >
              Point your station at the Sandbox URL below: it is where your
              code runs — the Coolify FQDN, your API base, and your webhook
              target all use it. There is no BYOV client, MCP endpoint, or
              connect script yet — one-command setup from your coding tool
              is on the roadmap. Until then the loop is manual: build
              locally, keep the gates green, deploy to the node.
            </p>
            <dl
              className="mono grid max-w-2xl gap-1 text-[13px]"
              style={{ color: "var(--color-ink-2)" }}
            >
              <div className="flex flex-wrap gap-x-2">
                <dt>App:</dt>
                <dd style={{ color: "var(--color-ink)" }}>{app.slug}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt>Environment:</dt>
                <dd style={{ color: "var(--color-ink)" }}>
                  {SANDBOX_ENV_NAME}
                </dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt>Node:</dt>
                <dd style={{ color: "var(--color-ink)" }}>
                  {nodeName || sandbox?.node || "—"}
                </dd>
              </div>
            </dl>
            <div className="max-w-2xl">
              {resolved.url ? (
                <CommandBlock title="Sandbox URL" command={resolved.url} />
              ) : (
                <p
                  className="max-w-[70ch] text-sm"
                  style={{ color: "var(--color-ink-2)" }}
                >
                  {resolved.warning ??
                    "Finish the node setup to get a URL."}{" "}
                  <Link
                    href="/settings/nodes"
                    className="underline underline-offset-2"
                  >
                    Open node settings
                  </Link>
                </p>
              )}
            </div>
          </li>

          <li className="grid gap-2">
            <p className="font-semibold">
              <span
                className="mono mr-2 text-sm"
                style={{ color: "var(--color-ink-2)" }}
              >
                02
              </span>
              {stack || app.stack
                ? "Scaffold the app from the starter"
                : "Start from your own code"}
            </p>
            <p
              className="max-w-[70ch] text-sm"
              style={{ color: "var(--color-ink-2)" }}
            >
              {stack ? (
                <>
                  Start from{" "}
                  <span className="mono">{stack.starter.ref}</span> — the{" "}
                  <Link
                    href={`/stacks/${stack.slug}#scaffold`}
                    className="underline underline-offset-2"
                  >
                    {stack.name} scaffold
                  </Link>{" "}
                  walks through install, environment, and the dev server.
                  Never commit secrets.
                </>
              ) : app.stack ? (
                <>
                  Scaffold the app from its tech stack starter, install
                  dependencies with a clean install, and copy the example env
                  file. Never commit secrets.
                </>
              ) : (
                <>
                  This app has no tech stack, so there is no starter: bring
                  your own repo, install its dependencies, and copy the
                  example env file. Never commit secrets.
                </>
              )}
            </p>
          </li>

          {mode === "agent" && (
            <li className="grid gap-2">
              <p className="font-semibold">
                <span
                  className="mono mr-2 text-sm"
                  style={{ color: "var(--color-ink-2)" }}
                >
                  03
                </span>
                Save the AGENTS.md starter
              </p>
              <p
                className="max-w-[70ch] text-sm"
                style={{ color: "var(--color-ink-2)" }}
              >
                Save this file as <span className="mono">AGENTS.md</span> in
                the repo root before starting the agent — it teaches the agent
                your app, the BYOV harness, the gates, and the house rules.
              </p>
              <div className="max-w-2xl">
                <CommandBlock
                  title="AGENTS.md"
                  command={agentsPrompt}
                  scroll
                />
              </div>
            </li>
          )}

          {mode === "agent" && (
            <li className="grid gap-2">
              <p className="font-semibold">
                <span
                  className="mono mr-2 text-sm"
                  style={{ color: "var(--color-ink-2)" }}
                >
                  04
                </span>
                Start the Coding Agent
              </p>
              <p
                className="max-w-[70ch] text-sm"
                style={{ color: "var(--color-ink-2)" }}
              >
                Open {repoWords} in your terminal. The agent has its own
                sign-in, separate from BYOV — log in when it asks, then send
                your first prompt.
              </p>
              <div className="max-w-2xl">
                <CommandBlock
                  title="Terminal"
                  command={agentCommand}
                  extra={
                    <span
                      role="group"
                      aria-label="Coding agent"
                      className="flex items-center gap-1"
                    >
                      {AGENTS.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          aria-pressed={agent === entry.id}
                          onClick={() => setAgent(entry.id)}
                          className="rounded-full px-2 py-0.5 text-xs"
                          style={{
                            background:
                              agent === entry.id
                                ? "var(--color-paper)"
                                : "transparent",
                            color:
                              agent === entry.id
                                ? "var(--color-ink)"
                                : "var(--color-muted)",
                            fontWeight: agent === entry.id ? 600 : 400,
                          }}
                        >
                          {entry.label}
                        </button>
                      ))}
                    </span>
                  }
                />
              </div>
            </li>
          )}

          {mode === "mycode" && (
            <li className="grid gap-2">
              <p className="font-semibold">
                <span
                  className="mono mr-2 text-sm"
                  style={{ color: "var(--color-ink-2)" }}
                >
                  03
                </span>
                Run it on your machine
              </p>
              <p
                className="max-w-[70ch] text-sm"
                style={{ color: "var(--color-ink-2)" }}
              >
                {hasStarter
                  ? "Bring your code into the scaffolded repo and confirm it runs locally before it ships."
                  : "Confirm your code runs locally before it ships."}
                {stack && (
                  <>
                    {" "}
                    <Link
                      href={`/stacks/${stack.slug}#scaffold`}
                      className="underline underline-offset-2"
                    >
                      The {stack.name} scaffold
                    </Link>{" "}
                    has the exact steps.
                  </>
                )}
              </p>
              {devCommand && (
                <div className="max-w-2xl">
                  <CommandBlock title="Terminal" command={devCommand} />
                </div>
              )}
            </li>
          )}

          {mode === "aicode" && (
            <li className="grid gap-2">
              <p className="font-semibold">
                <span
                  className="mono mr-2 text-sm"
                  style={{ color: "var(--color-ink-2)" }}
                >
                  03
                </span>
                Bring the generated code in
              </p>
              <p
                className="max-w-[70ch] text-sm"
                style={{ color: "var(--color-ink-2)" }}
              >
                Paste the output into {repoWords} and review it like your
                own change — generated code still passes every gate before
                it ships, and secrets never ship with it.
              </p>
            </li>
          )}

          <li className="grid gap-2">
            <p className="font-semibold">
              <span
                className="mono mr-2 text-sm"
                style={{ color: "var(--color-ink-2)" }}
              >
                {mode === "agent" ? "05" : "04"}
              </span>
              Ship to the Sandbox
            </p>
            <p
              className="max-w-[70ch] text-sm"
              style={{ color: "var(--color-ink-2)" }}
            >
              Keep the gates green, then point the app at its Sandbox URL.
              Set the app&apos;s Coolify FQDN to the URL below — Coolify
              provisions TLS from there. The Sandbox is yours to break:
              iterate here, then promote to staging or production.
            </p>
            {gates ? (
              <div className="max-w-2xl">
                <CommandBlock title="Terminal" command={gates} />
              </div>
            ) : (
              <p
                className="max-w-[70ch] text-sm"
                style={{ color: "var(--color-ink-2)" }}
              >
                This app has no stack commands: run whatever tests, lint,
                and build your project uses — every change passes before it
                ships.
              </p>
            )}
            <p className="max-w-[70ch] text-sm">
              <span style={{ color: "var(--color-ink-2)" }}>
                Sandbox URL:{" "}
              </span>
              {resolved.url ? (
                <a
                  href={resolved.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mono underline decoration-[var(--color-rule)] underline-offset-2 hover:decoration-[var(--color-accent-deep)]"
                >
                  {resolved.url}
                </a>
              ) : (
                <span style={{ color: "var(--color-ink-2)" }}>
                  {resolved.warning ??
                    "Finish the node setup to get a URL."}{" "}
                  <Link
                    href="/settings/nodes"
                    className="underline underline-offset-2"
                  >
                    Open node settings
                  </Link>
                </span>
              )}
            </p>
          </li>
        </ol>
      </div>
    </section>
  );
}
