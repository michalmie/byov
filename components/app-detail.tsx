"use client";

import { useState } from "react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { AgentsPromptCard } from "@/components/agents-prompt-card";
import { AppSubnav } from "@/components/app-subnav";
import { AppScenarioControl } from "@/components/app-scenario-control";
import { HealthPill, SectionHead, StatStrip, StatusPill } from "@/components/data-ui";
import { ManagedEnvironmentCard } from "@/components/managed-environment-card";
import { PageTabs } from "@/components/page-tabs";
import { SandboxSetupGuide } from "@/components/sandbox-setup-guide";
import { ArrowLeftIcon } from "@/components/icons";
import { ControlPlaneShell } from "@/components/shell";
import { needsSandboxSetup } from "@/lib/apps";
import { useManagedApps } from "@/lib/apps-store";
import { appHealth, appSections } from "@/lib/control-plane";
import { useManagedStacks } from "@/lib/stack-store";
import { useSourceControlSettings } from "@/lib/source-control-store";
import {
  canCreateRepos,
  resolveRepoFullName,
  resolveRepoUrl,
} from "@/lib/source-control";

const checkTone = { pass: "ok", fail: "bad", running: "info" } as const;
const checkLabel = { pass: "Pass", fail: "Fail", running: "Running" } as const;
const deployTone = { live: "ok", failed: "bad", running: "info" } as const;
const deployLabel = { live: "Live", failed: "Failed", running: "Running" } as const;

export function AppDetailView({ slug }: { slug: string }) {
  const { getManagedApp, isCustomApp, deleteApp, hydrated } = useManagedApps();
  const { getManagedStack } = useManagedStacks();
  const { settings: sourceControl } = useSourceControlSettings();
  const router = useRouter();
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const app = getManagedApp(slug);

  // Customs hydrate after mount; hold the loading state until then so a
  // workspace slug never flashes a 404 on first render.
  if (!app && !hydrated) {
    return (
      <ControlPlaneShell crumb="Apps">
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          Loading app…
        </p>
      </ControlPlaneShell>
    );
  }

  if (!app) {
    notFound();
  }

  const custom = isCustomApp(app.slug);
  const stackName =
    getManagedStack(app.stack)?.name || app.stack || "No stack yet";
  const health = appHealth(app);
  const passing = app.checks.filter(
    (check) => check.status === "pass",
  ).length;
  const homeNodes = new Set(app.envs.map((env) => env.node)).size;

  return (
    <ControlPlaneShell
      crumb={
        <>
          <Link href="/apps" className="hover:underline">
            Apps
          </Link>{" "}
          / {app.name}
        </>
      }
      subnav={
        <AppSubnav
          name={app.name}
          slug={app.slug}
          stack={stackName}
          health={health}
          sections={appSections}
        />
      }
    >
      <div className="grid gap-8">
        <div id="overview" className="scroll-mt-24">
          <Link
            href="/apps"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium"
            style={{ color: "var(--color-muted)" }}
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            Apps
          </Link>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold tracking-tight">
              {app.name}
            </h1>
            <HealthPill health={health} />
          </div>
          <p
            className="mt-1 text-[13px]"
            style={{ color: "var(--color-muted)" }}
          >
            {app.slug} / {stackName}
            {custom ? " · workspace app" : ""}
          </p>
          <p
            className="mt-3 max-w-[65ch] text-sm whitespace-pre-line"
            style={{ color: "var(--color-ink-2)" }}
          >
            {app.description}
          </p>
          <p className="mono mt-2 text-[13px]" style={{ color: "var(--color-muted)" }}>
            Repo:{" "}
            {app.repoUrl
              ? `${app.repoUrl}${app.branch ? ` (${app.branch})` : ""}`
              : canCreateRepos(sourceControl)
                ? `not linked — would be ${resolveRepoFullName(sourceControl, app.slug)} (${resolveRepoUrl(sourceControl, app.slug)}) · link via POST /api/v1/apps/${app.slug}/repo`
                : `not linked — POST /api/v1/apps/${app.slug}/repo · link GitHub in Settings → Source control`}
          </p>
        </div>

        <PageTabs sections={appSections} />

        <div className="rule-top pt-6">
          <StatStrip
            items={[
              {
                value: String(app.envs.length),
                qualifier: "Environments",
              },
              {
                value: String(app.deployments.length),
                qualifier: "Recent deployments",
              },
              {
                value: `${passing}/${app.checks.length}`,
                qualifier: "Checks passing",
              },
              { value: String(homeNodes), qualifier: "Home nodes" },
            ]}
          />
        </div>

        {needsSandboxSetup(app) && <SandboxSetupGuide app={app} />}

        <AgentsPromptCard app={app} />

        <section
          id="environments"
          aria-labelledby="envs-heading"
          className="grid scroll-mt-24 gap-5"
        >
          <div id="envs-heading">
            <SectionHead
              title="Environments"
              lede="Each environment pins to exactly one node."
            />
          </div>
          <AppScenarioControl appSlug={app.slug} />
          <div className="grid gap-4">
            {app.envs.map((env) => (
              <ManagedEnvironmentCard
                key={env.name}
                appSlug={app.slug}
                env={env}
                lastDeploy={app.deployments.find(
                  (deploy) => deploy.env === env.name,
                )}
                checksPassing={passing}
                checksTotal={app.checks.length}
              />
            ))}
          </div>
        </section>

        <section
          id="deployments"
          aria-labelledby="deploys-heading"
          className="grid scroll-mt-24 gap-5"
        >
          <div id="deploys-heading">
            <SectionHead
              title="Deployments"
              lede="Newest first, with who shipped each one."
            />
          </div>
          {app.deployments.length === 0 ? (
            <p className="hint">
              No deployments yet — the Sandbox guide above walks through the
              first one.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="spec-table min-w-[680px]">
                <thead>
                  <tr>
                    <th scope="col">ID</th>
                    <th scope="col">Environment</th>
                    <th scope="col">Status</th>
                    <th scope="col">When</th>
                    <th scope="col">By</th>
                  </tr>
                </thead>
                <tbody>
                  {app.deployments.map((deploy) => (
                    <tr key={deploy.id}>
                      <td className="mono text-sm">{deploy.id}</td>
                      <td>{deploy.env}</td>
                      <td>
                        <StatusPill
                          tone={deployTone[deploy.status]}
                          label={deployLabel[deploy.status]}
                        />
                      </td>
                      <td className="text-sm">{deploy.when}</td>
                      <td className="text-sm">{deploy.by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section
          id="checks"
          aria-labelledby="checks-heading"
          className="grid scroll-mt-24 gap-5"
        >
          <div id="checks-heading">
            <SectionHead
              title="Checks"
              lede="Required checks and gates, with results for each change."
            />
          </div>
          <div className="overflow-x-auto">
            <table className="spec-table min-w-[680px]">
              <thead>
                <tr>
                  <th scope="col">Check</th>
                  <th scope="col">Type</th>
                  <th scope="col">Cadence</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {app.checks.map((check) => (
                  <tr key={check.name}>
                    <td className="font-semibold">{check.name}</td>
                    <td className="mono text-sm">{check.type}</td>
                    <td className="text-sm">{check.cadence}</td>
                    <td>
                      <StatusPill
                        tone={checkTone[check.status]}
                        label={checkLabel[check.status]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {custom &&
          (confirmingRemove ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="btn-danger px-3 py-1.5 text-[13px]"
                onClick={() => {
                  if (deleteApp(app.slug)) {
                    router.push("/apps");
                  }
                }}
              >
                Confirm remove
              </button>
              <button
                type="button"
                className="btn-ghost px-3 py-1.5 text-[13px]"
                onClick={() => setConfirmingRemove(false)}
              >
                Keep
              </button>
            </div>
          ) : (
            <div>
              <button
                type="button"
                className="btn-ghost px-3 py-1.5 text-[13px]"
                onClick={() => setConfirmingRemove(true)}
              >
                Remove app
              </button>
            </div>
          ))}
      </div>
    </ControlPlaneShell>
  );
}
