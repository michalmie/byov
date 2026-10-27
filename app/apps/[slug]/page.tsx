import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppSubnav } from "@/components/app-subnav";
import { HealthPill, SectionHead, StatStrip, StatusPill } from "@/components/data-ui";
import { EnvironmentCard } from "@/components/environment-card";
import { ArrowLeftIcon } from "@/components/icons";
import { ControlPlaneShell } from "@/components/shell";
import {
  appHealth,
  appSections,
  getApp,
  getNode,
  listApps,
} from "@/lib/control-plane";

export function generateStaticParams() {
  return listApps().map((app) => ({ slug: app.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const app = getApp(slug);
  return { title: app ? app.name : "Unknown app" };
}

const checkTone = { pass: "ok", fail: "bad", running: "info" } as const;
const checkLabel = { pass: "Pass", fail: "Fail", running: "Running" } as const;
const deployTone = { live: "ok", failed: "bad", running: "info" } as const;
const deployLabel = { live: "Live", failed: "Failed", running: "Running" } as const;

export default async function AppDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const app = getApp(slug);
  if (!app) {
    notFound();
  }

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
          stack={app.stack}
          health={health}
          sections={appSections}
        />
      }
    >
      <div className="grid gap-10">
        <div id="overview" className="scroll-mt-24">
          <Link
            href="/apps"
            className="inline-flex items-center gap-2 text-sm font-semibold lg:hidden"
            style={{ color: "var(--color-ink-2)" }}
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Apps
          </Link>
          <h1 className="mt-3 text-[clamp(2rem,3.5vw+0.75rem,3rem)] font-bold leading-[1.05] tracking-tight">
            {app.name}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span
              className="tag px-2 py-1 text-xs"
              style={{
                background: "var(--color-paper-2)",
                color: "var(--color-ink-2)",
              }}
            >
              {app.slug}
            </span>
            <span
              className="tag px-2 py-1 text-xs"
              style={{
                background: "var(--color-paper-2)",
                color: "var(--color-ink-2)",
              }}
            >
              {app.stack}
            </span>
            <HealthPill health={health} />
          </div>
          <p
            className="mt-4 max-w-[65ch] text-base"
            style={{ color: "var(--color-ink-2)" }}
          >
            {app.description}
          </p>
        </div>

        <div className="rule-top pt-8">
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
          <div className="grid gap-4">
            {app.envs.map((env) => (
              <EnvironmentCard
                key={env.name}
                env={env}
                nodeName={getNode(env.node)?.name ?? env.node}
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
      </div>
    </ControlPlaneShell>
  );
}
