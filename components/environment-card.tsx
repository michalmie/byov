import type { AppEnvironment, Deployment } from "@/lib/control-plane";
import { HealthPill } from "./data-ui";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt
        className="mono text-xs uppercase"
        style={{ color: "var(--color-ink-2)", letterSpacing: "0.1em" }}
      >
        {label}
      </dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

export function EnvironmentCard({
  env,
  nodeName,
  lastDeploy,
  checksPassing,
  checksTotal,
}: {
  env: AppEnvironment;
  nodeName: string;
  lastDeploy?: Deployment;
  checksPassing: number;
  checksTotal: number;
}) {
  return (
    <article
      aria-label={`${env.name} environment`}
      className="card grid gap-5 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-semibold tracking-tight">{env.name}</h3>
        <HealthPill health={env.status} />
      </div>
      <dl className="tnum grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Fact label="URL">
          <span className="mono block truncate">{env.url}</span>
        </Fact>
        <Fact label="Node">
          <span className="mono">{nodeName}</span>
        </Fact>
        <Fact label="Last deploy">
          {lastDeploy ? (
            <>
              <span className="mono">{lastDeploy.id}</span>
              <span
                className="block"
                style={{ color: "var(--color-ink-2)" }}
              >
                {lastDeploy.when} · by {lastDeploy.by}
              </span>
            </>
          ) : (
            "—"
          )}
        </Fact>
        <Fact label="Checks">
          {checksPassing}/{checksTotal} passing
        </Fact>
      </dl>
    </article>
  );
}
