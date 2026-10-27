import type { Health } from "@/lib/control-plane";
import { healthLabel } from "@/lib/control-plane";

type Tone = "ok" | "warn" | "bad" | "info";

const toneVars: Record<Tone, { dot: string; soft: string }> = {
  ok: { dot: "var(--color-ok)", soft: "var(--color-ok-soft)" },
  warn: { dot: "var(--color-warn)", soft: "var(--color-warn-soft)" },
  bad: { dot: "var(--color-bad)", soft: "var(--color-bad-soft)" },
  info: { dot: "var(--color-info)", soft: "var(--color-info-soft)" },
};

export function StatusPill({ tone, label }: { tone: Tone; label: string }) {
  const vars = toneVars[tone];
  return (
    <span
      className="tag px-1.5 py-0.5"
      style={{ background: vars.soft, color: "var(--color-ink)" }}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: vars.dot }}
      />
      {label}
    </span>
  );
}

const healthTone: Record<Health, Tone> = {
  healthy: "ok",
  deploying: "info",
  degraded: "warn",
  down: "bad",
  pending: "info",
};

export function HealthPill({ health }: { health: Health }) {
  return <StatusPill tone={healthTone[health]} label={healthLabel(health)} />;
}

export interface StatItem {
  value: string;
  qualifier: string;
  accent?: boolean;
}

export function StatStrip({ items }: { items: StatItem[] }) {
  return (
    <dl className="tnum grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.qualifier}>
          <dd
            className="text-2xl font-semibold tracking-tight"
            style={item.accent ? { color: "var(--color-warn-deep)" } : undefined}
          >
            {item.value}
          </dd>
          <dt
            className="mt-0.5 text-[13px]"
            style={{ color: "var(--color-muted)" }}
          >
            {item.qualifier}
          </dt>
        </div>
      ))}
    </dl>
  );
}

export function SectionHead({
  title,
  lede,
}: {
  title: string;
  lede: string;
}) {
  return (
    <div className="max-w-2xl">
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-muted)" }}>
        {lede}
      </p>
    </div>
  );
}
