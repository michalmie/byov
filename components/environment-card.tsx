import type { AccessPolicy, AppEnvironment, Deployment } from "@/lib/control-plane";
import { AccessPolicyBadge } from "./access-policy-badge";
import { HealthPill, StatusPill } from "./data-ui";
import { DnsTestButton } from "./dns-test-button";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs" style={{ color: "var(--color-muted)" }}>
        {label}
      </dt>
      <dd className="mt-1 text-[13px]">{children}</dd>
    </div>
  );
}

const deployTone = { live: "ok", failed: "bad", running: "info" } as const;
const deployLabel = { live: "Live", failed: "Failed", running: "Running" } as const;

export function EnvironmentCard({
  env,
  urlNote,
  testTarget,
  nodeName,
  lastDeploy,
  checksPassing,
  checksTotal,
  actions,
  varKeys,
  accessPolicy,
}: {
  env: AppEnvironment;
  accessPolicy?: AccessPolicy;
  urlNote?: string;
  testTarget?: { host: string; port: number };
  nodeName: string;
  lastDeploy?: Deployment;
  checksPassing: number;
  checksTotal: number;
  actions?: React.ReactNode;
  varKeys?: string[];
}) {
  const checksOk = checksPassing === checksTotal;
  return (
    <article
      aria-label={`${env.name} environment`}
      className="card grid gap-4 p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[15px] font-semibold tracking-tight">{env.name}</h3>
        <HealthPill health={env.status} />
        {lastDeploy && (
          <StatusPill
            tone={deployTone[lastDeploy.status]}
            label={deployLabel[lastDeploy.status]}
          />
        )}
        {actions && <span className="ml-auto">{actions}</span>}
      </div>
      <p className="mono text-xs" style={{ color: "var(--color-muted)" }}>
        {env.node}
      </p>
      <dl className="tnum rule-top grid gap-x-6 gap-y-4 pt-4 sm:grid-cols-3">
        <Fact label="URL">
          <span className="mono block truncate text-[13px]">
            {env.url ?? "—"}
          </span>
          {testTarget && (
            <span className="mt-1 block">
              <DnsTestButton host={testTarget.host} port={testTarget.port} />
            </span>
          )}
          {urlNote && (
            <span
              className="hint mt-1 block"
              style={{ color: "var(--color-muted)" }}
            >
              {urlNote}
            </span>
          )}
        </Fact>
        <Fact label="Node">
          <span className="mono text-[13px]">{nodeName}</span>
        </Fact>
        <Fact label="Last deploy">
          {lastDeploy ? (
            <>
              <span className="mono text-[13px]">{lastDeploy.id}</span>
              <span
                className="block text-xs"
                style={{ color: "var(--color-muted)" }}
              >
                {lastDeploy.when} · by {lastDeploy.by}
              </span>
            </>
          ) : (
            "—"
          )}
        </Fact>
        {accessPolicy && (
          <Fact label="Access">
            <AccessPolicyBadge policy={accessPolicy} />
          </Fact>
        )}
        <Fact label="Variables">
          <span className="mono text-[13px]">
            {varKeys && varKeys.length > 0 ? varKeys.join(", ") : "none set"}
          </span>
        </Fact>
        <Fact label="Checks">
          <span className="inline-flex items-center gap-2">
            {checksPassing}/{checksTotal} passing
            <StatusPill
              tone={checksOk ? "ok" : "warn"}
              label={checksOk ? "Passing" : "Attention"}
            />
          </span>
        </Fact>
      </dl>
    </article>
  );
}
