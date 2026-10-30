"use client";

import { ActivityFeed } from "@/components/activity-feed";
import { ControlPlaneShell } from "@/components/shell";
import { useActivity } from "@/lib/use-activity";

export default function Activity() {
  const items = useActivity();

  return (
    <ControlPlaneShell crumb="Activity">
      <div className="grid gap-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Activity</h1>
          <p
            className="mt-2 max-w-[65ch] text-sm"
            style={{ color: "var(--color-muted)" }}
          >
            Every control plane event, newest first. Persisted audit
            events replace the sample feed once real actions happen.
          </p>
        </div>
        <ActivityFeed items={items} />
      </div>
    </ControlPlaneShell>
  );
}
