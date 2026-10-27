import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { HealthPill, SectionHead, StatStrip, StatusPill } from "@/components/data-ui";
import { EnvironmentCard } from "@/components/environment-card";
import { ArrowLeftIcon } from "@/components/icons";
import { ProjectSubnav } from "@/components/project-subnav";
import {
  getProject,
  getNode,
  listProjects,
  projectHealth,
  projectSections,
} from "@/lib/control-plane";

export function generateStaticParams() {
  return listProjects().map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = getProject(slug);
  return { title: project ? project.name : "Unknown project" };
}

const checkTone = { pass: "ok", fail: "bad", running: "info" } as const;
const checkLabel = { pass: "Pass", fail: "Fail", running: "Running" } as const;
const deployTone = { live: "ok", failed: "bad", running: "info" } as const;
const deployLabel = { live: "Live", failed: "Failed", running: "Running" } as const;

export default async function ProjectDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) {
    notFound();
  }

  const health = projectHealth(project);
  const passing = project.checks.filter(
    (check) => check.status === "pass",
  ).length;
  const homeNodes = new Set(project.envs.map((env) => env.node)).size;

  return (
    <AppShell
      crumb={
        <>
          <Link href="/projects" className="hover:underline">
            Projects
          </Link>{" "}
          / {project.name}
        </>
      }
      subnav={
        <ProjectSubnav
          name={project.name}
          slug={project.slug}
          stack={project.stack}
          health={health}
          sections={projectSections}
        />
      }
    >
      <div className="grid gap-10">
        <div id="overview" className="scroll-mt-24">
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 text-sm font-semibold lg:hidden"
            style={{ color: "var(--color-ink-2)" }}
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Projects
          </Link>
          <h1 className="mt-3 text-[clamp(2rem,3.5vw+0.75rem,3rem)] font-bold leading-[1.05] tracking-tight">
            {project.name}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span
              className="tag px-2 py-1 text-xs"
              style={{
                background: "var(--color-paper-2)",
                color: "var(--color-ink-2)",
              }}
            >
              {project.slug}
            </span>
            <span
              className="tag px-2 py-1 text-xs"
              style={{
                background: "var(--color-paper-2)",
                color: "var(--color-ink-2)",
              }}
            >
              {project.stack}
            </span>
            <HealthPill health={health} />
          </div>
          <p
            className="mt-4 max-w-[65ch] text-base"
            style={{ color: "var(--color-ink-2)" }}
          >
            {project.description}
          </p>
        </div>

        <div className="rule-top pt-8">
          <StatStrip
            items={[
              {
                value: String(project.envs.length),
                qualifier: "Environments",
              },
              {
                value: String(project.deployments.length),
                qualifier: "Recent deployments",
              },
              {
                value: `${passing}/${project.checks.length}`,
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
            {project.envs.map((env) => (
              <EnvironmentCard
                key={env.name}
                env={env}
                nodeName={getNode(env.node)?.name ?? env.node}
                lastDeploy={project.deployments.find(
                  (deploy) => deploy.env === env.name,
                )}
                checksPassing={passing}
                checksTotal={project.checks.length}
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
                {project.deployments.map((deploy) => (
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
                {project.checks.map((check) => (
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
    </AppShell>
  );
}
