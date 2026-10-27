import { ActivityFeed } from "@/components/activity-feed";
import { ControlPlaneShell } from "@/components/shell";
import { recentActivity } from "@/lib/control-plane";

export default function Activity() {
  const items = recentActivity();

  return (
    <ControlPlaneShell crumb="Activity">
      <div className="grid gap-8">
        <div>
          <h1 className="text-[clamp(2rem,3.5vw+0.75rem,3rem)] font-bold leading-[1.05] tracking-tight">
            Activity
          </h1>
          <p
            className="mt-3 max-w-[65ch] text-base"
            style={{ color: "var(--color-ink-2)" }}
          >
            Every control plane event, newest first.
          </p>
        </div>
        <ActivityFeed items={items} />
      </div>
    </ControlPlaneShell>
  );
}
