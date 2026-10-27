import { ActivityFeed } from "@/components/activity-feed";
import { ControlPlaneShell } from "@/components/shell";
import { recentActivity } from "@/lib/control-plane";

export default function Activity() {
  const items = recentActivity();

  return (
    <ControlPlaneShell crumb="Activity">
      <div className="grid gap-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Activity
          </h1>
          <p
            className="mt-2 max-w-[65ch] text-sm"
            style={{ color: "var(--color-muted)" }}
          >
            Every control plane event, newest first.
          </p>
        </div>
        <ActivityFeed items={items} />
      </div>
    </ControlPlaneShell>
  );
}
