import type { ActivityItem } from "@/lib/control-plane";

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <ol className="grid">
      {items.map((item, index) => (
        <li
          key={`${item.when}-${index}`}
          className="rule-top flex items-start gap-4 py-3"
        >
          <span
            className="mono w-24 shrink-0 text-sm"
            style={{ color: "var(--color-ink-2)" }}
          >
            {item.when}
          </span>
          <p className="text-sm">
            <strong className="font-semibold">{item.actor}</strong> {item.text}
          </p>
        </li>
      ))}
    </ol>
  );
}
